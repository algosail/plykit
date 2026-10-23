import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import type { Arrival } from '../app/types.ts'
import { attachLive, isLiveClaim } from '../app/events.ts'

/** A server that is accepting requests, and how to stop it. */
export type Listening = {
  readonly port: number
  readonly close: () => Promise<void>
}

const headersOf = (message: IncomingMessage): Headers => {
  const headers = new Headers ()
  for (const [key, value] of Object.entries (message.headers)) {
    if (value === undefined) continue
    if (Array.isArray (value)) {
      for (const one of value) headers.append (key, one)
    } else headers.append (key, value)
  }
  return headers
}

const requestOf = (message: IncomingMessage): Request => {
  const host = message.headers.host ?? 'localhost'
  const url = new URL (message.url ?? '/', `http://${host}`)
  const method = message.method ?? 'GET'
  const head = method === 'GET' || method === 'HEAD'
  return new Request (url, {
    method,
    headers: headersOf (message),
    body: head ? undefined : Readable.toWeb (message) as ReadableStream,
    duplex: 'half',
  } as RequestInit)
}

const writeHead = (out: ServerResponse, response: Response): void => {
  out.statusCode = response.status
  response.headers.forEach ((value, key) => {
    if (key === 'set-cookie') return
    out.setHeader (key, value)
  })
  const cookies = response.headers.getSetCookie ()
  if (cookies.length > 0) out.setHeader ('set-cookie', cookies)
}

const writeBody = (out: ServerResponse, response: Response): Promise<void> => {
  writeHead (out, response)
  if (response.body === null) {
    out.end ()
    return Promise.resolve ()
  }
  return new Promise ((resolve, reject) => {
    Readable.fromWeb (response.body as import('node:stream/web').ReadableStream)
      .pipe (out)
      .on ('finish', () => resolve ())
      .on ('error', reject)
  })
}

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const MAX_FRAME = 1_048_576

const OP_TEXT = 0x1

const OP_CLOSE = 0x8

const OP_PING = 0x9

const OP_PONG = 0xa

const acceptOf = (key: string): string =>
  createHash ('sha1').update (key + GUID).digest ('base64')

const lineSafe = (value: string): boolean =>
  !value.includes ('\r') && !value.includes ('\n')

const keyOf = (message: IncomingMessage): string | undefined => {
  const raw = message.headers['sec-websocket-key']
  const key = Array.isArray (raw) ? raw[0] : raw
  return key === undefined || key === '' ? undefined : key
}

const sendFrame = (socket: Duplex, opcode: number, payload: Buffer): void => {
  if (socket.destroyed) return
  const len = payload.length
  let header: Buffer
  if (len < 126) {
    header = Buffer.allocUnsafe (2)
    header[0] = 0x80 | opcode
    header[1] = len
  } else if (len < 65_536) {
    header = Buffer.allocUnsafe (4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE (len, 2)
  } else {
    header = Buffer.allocUnsafe (10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE (BigInt (len), 2)
  }
  socket.write (Buffer.concat ([header, payload]))
}

const calm = (socket: Duplex): void => {
  const timed = socket as Duplex & {
    setTimeout?(ms: number): void
    setNoDelay?(on: boolean): void
  }
  timed.setTimeout?. (0)
  timed.setNoDelay?. (true)
}

const refuse = (socket: Duplex, response: Response): void => {
  void response.arrayBuffer ().then ((body) => {
    if (socket.destroyed) return
    try {
      const phrase = lineSafe (response.statusText) && response.statusText !== ''
        ? response.statusText
        : 'Error'
      const lines = [`HTTP/1.1 ${response.status} ${phrase}`]
      response.headers.forEach ((value, key) => {
        if (lineSafe (key) && lineSafe (value)) lines.push (`${key}: ${value}`)
      })
      lines.push ('connection: close', '', '')
      socket.write (lines.join ('\r\n'))
      if (body.byteLength > 0) socket.write (Buffer.from (body))
      socket.end ()
    } catch {
      if (!socket.destroyed) socket.destroy ()
    }
  }, () => {
    if (!socket.destroyed) socket.destroy ()
  })
}

type Frames = {
  readonly ping: (payload: Buffer) => void
  readonly close: () => void
}

const takeFrames = (buffer: Buffer, on: Frames): Buffer | undefined => {
  let pending = buffer
  while (pending.length >= 2) {
    const first = pending[0] ?? 0
    const second = pending[1] ?? 0
    if ((first & 0x70) !== 0) return undefined
    const opcode = first & 0x0f
    const masked = (second & 0x80) !== 0
    let length = second & 0x7f
    let offset = 2
    if (length === 126) {
      if (pending.length < 4) return pending
      length = pending.readUInt16BE (2)
      offset = 4
    } else if (length === 127) {
      if (pending.length < 10) return pending
      const wide = pending.readBigUInt64BE (2)
      if (wide > BigInt (MAX_FRAME)) return undefined
      length = Number (wide)
      offset = 10
    }
    if (length > MAX_FRAME) return undefined
    const maskLen = masked ? 4 : 0
    const total = offset + maskLen + length
    if (pending.length < total) return pending
    const payload = Buffer.from (pending.subarray (offset + maskLen, total))
    if (masked) {
      const mask = pending.subarray (offset, offset + 4)
      for (let i = 0; i < payload.length; i++) {
        payload[i] = (payload[i] ?? 0) ^ (mask[i % 4] ?? 0)
      }
    }
    pending = pending.subarray (total)
    if (opcode === OP_PING) on.ping (payload)
    else if (opcode === OP_CLOSE) {
      on.close ()
      return pending
    }
  }
  return pending
}

const readFrames = (socket: Duplex, head: Buffer, on: Frames): void => {
  let pending: Buffer | undefined = Buffer.from (head)
  const take = (): void => {
    if (pending === undefined) return
    pending = takeFrames (pending, on)
    if (pending !== undefined) return
    if (!socket.destroyed) socket.destroy ()
  }
  socket.on ('data', (chunk: Buffer | string) => {
    if (pending === undefined) return
    const next = Buffer.isBuffer (chunk) ? chunk : Buffer.from (chunk)
    pending = pending.length === 0 ? next : Buffer.concat ([pending, next])
    take ()
  })
  take ()
}

const arrive = (message: IncomingMessage): Arrival => ({
  remoteAddr: { hostname: message.socket.remoteAddress },
})

/** What a host calls. `any` lets an app typed for one `Env` be served here too. */
type Answers = (request: Request, from?: Arrival<any>) => Promise<Response>

const claim = (
  sockets: Set<Duplex>,
  handler: Answers,
  message: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void => {
  sockets.add (socket)
  let stopped = false
  let detach = (): void => {}
  const stop = (): void => {
    if (stopped) return
    stopped = true
    detach ()
    sockets.delete (socket)
  }
  socket.on ('error', () => {
    stop ()
    if (!socket.destroyed) socket.destroy ()
  })
  socket.on ('close', stop)
  calm (socket)
  let pending: Promise<Response>
  try {
    pending = handler (requestOf (message), arrive (message))
  } catch {
    stop ()
    if (!socket.destroyed) socket.destroy ()
    return
  }
  pending.then ((response) => {
    if (socket.destroyed) return
    if (!isLiveClaim (response)) {
      stop ()
      refuse (socket, response)
      return
    }
    const key = keyOf (message)
    if (key === undefined) {
      stop ()
      socket.destroy ()
      return
    }
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptOf (key)}`,
      '',
      '',
    ].join ('\r\n')
    socket.write (headers)
    detach = attachLive ((text: string): void => {
      sendFrame (socket, OP_TEXT, Buffer.from (text))
    })
    readFrames (socket, head, {
      ping: (payload: Buffer): void => sendFrame (socket, OP_PONG, payload),
      close: (): void => {
        stop ()
        if (socket.destroyed) return
        sendFrame (socket, OP_CLOSE, Buffer.alloc (0))
        socket.end ()
      },
    })
  }, () => {
    stop ()
    if (!socket.destroyed) socket.destroy ()
  })
}

/**
 * Serves `handler` until `close`.
 * @example
 * ```ts
 * const running = await listen (await dev (application))
 * running.port
 * // => 8000
 * ```
 */
export const listen = (
  handler: Answers,
  options?: { readonly port?: number },
): Promise<Listening> => {
  const sockets = new Set<Duplex> ()
  const server = createServer ((message, out) => {
    handler (requestOf (message), arrive (message)).then (
      (response) => writeBody (out, response),
      () => {
        out.statusCode = 500
        out.end ()
      },
    )
  })
  server.on ('upgrade', (message, socket, head) => {
    claim (sockets, handler, message, socket, head)
  })
  const port = options?.port ?? Number (process.env.PORT ?? 8000)
  return new Promise ((resolve, reject) => {
    server.once ('error', reject)
    server.listen (port, () => {
      const address = server.address ()
      const bound = typeof address === 'object' && address !== null
        ? address.port
        : port
      resolve ({
        port: bound,
        close: () =>
          new Promise ((done, fail) => {
            for (const socket of sockets) socket.destroy ()
            server.close ((err) => err ? fail (err) : done ())
            server.closeAllConnections ()
          }),
      })
    })
  })
}
