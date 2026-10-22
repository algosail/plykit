import * as F from '@algosail/plyfuture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Listening } from '../src/listen.ts'
import { listen } from '../src/listen.ts'
import { announce, endpoint, handler, liveRoute, stale, text } from '../src/mod.ts'

const within = <A>(ms: number, work: Promise<A>): Promise<A> =>
  new Promise ((resolve, reject) => {
    const timer = setTimeout (
      () => reject (new Error ('the socket did not answer')),
      ms,
    )
    work.then (
      (value) => {
        clearTimeout (timer)
        resolve (value)
      },
      (err: unknown) => {
        clearTimeout (timer)
        reject (err instanceof Error ? err : new Error (String (err)))
      },
    )
  })

const opened = (socket: WebSocket): Promise<void> => {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve ()
  return new Promise ((resolve, reject) => {
    socket.addEventListener ('open', () => resolve ())
    socket.addEventListener ('error', () =>
      reject (new Error ('the socket did not open')),
    )
  })
}

const nextMessage = (socket: WebSocket): Promise<string> =>
  new Promise ((resolve) => {
    socket.addEventListener ('message', (event: MessageEvent) => {
      resolve (String (event.data))
    }, { once: true })
  })

const refused = (url: string): Promise<void> =>
  new Promise ((resolve, reject) => {
    const socket = new WebSocket (url)
    const timer = setTimeout (() => {
      socket.close ()
      reject (new Error ('the socket stayed open'))
    }, 1_000)
    socket.addEventListener ('open', () => {
      clearTimeout (timer)
      socket.close ()
      reject (new Error ('the socket opened'))
    })
    socket.addEventListener ('error', () => {
      clearTimeout (timer)
      resolve ()
    })
  })

const stop = async (
  running: Listening,
  socket?: WebSocket,
): Promise<void> => {
  socket?.close ()
  await running.close ()
}

test ('kit/listen — the free-channel socket receives stale and announce', async () => {
  const running = await listen (handler ({
    routes: [
      liveRoute (),
      endpoint ({
        pattern: '/mark',
        on: {
          POST: (ctx) => {
            stale (ctx) ('notes')
            return F.resolve (text ('ok'))
          },
        },
      }),
      endpoint ({
        pattern: '/price',
        on: {
          POST: (ctx) => {
            announce (ctx) ({ event: 'price', data: '42' })
            return F.resolve (text ('ok'))
          },
        },
      }),
    ],
  }), { port: 0 })
  const url = `ws://127.0.0.1:${running.port}/live`
  const socket = new WebSocket (url)
  const ready = opened (socket)
  try {
    const plain = await fetch (`http://127.0.0.1:${running.port}/live`)
    assert.deepStrictEqual (plain.status, 426)
    assert.deepStrictEqual (plain.headers.get ('upgrade'), 'websocket')
    await plain.body?.cancel ()

    await within (2_000, ready)
    const first = nextMessage (socket)
    const marked = await fetch (`http://127.0.0.1:${running.port}/mark`, {
      method: 'POST',
    })
    assert.deepStrictEqual (marked.status, 200)
    await marked.body?.cancel ()
    assert.deepStrictEqual (JSON.parse (await within (2_000, first)), {
      event: 'kit-part',
      data: 'notes',
    })
    const second = nextMessage (socket)
    const priced = await fetch (`http://127.0.0.1:${running.port}/price`, {
      method: 'POST',
    })
    assert.deepStrictEqual (priced.status, 200)
    await priced.body?.cancel ()
    assert.deepStrictEqual (JSON.parse (await within (2_000, second)), {
      event: 'price',
      data: '42',
    })
  } finally {
    await stop (running, socket)
  }
})

test ('kit/listen — without a route the upgrade does not stay open', async () => {
  const running = await listen (handler ({ routes: [] }), { port: 0 })
  try {
    await within (
      2_000,
      refused (`ws://127.0.0.1:${running.port}/live`),
    )
  } finally {
    await running.close ()
  }
})

test ('kit/listen — someone else\'s /live is not taken', async () => {
  const running = await listen (handler ({
    routes: [
      endpoint ({
        pattern: '/live',
        on: { GET: () => F.resolve (text ('mine')) },
      }),
    ],
  }), { port: 0 })
  try {
    const res = await fetch (`http://127.0.0.1:${running.port}/live`)
    assert.deepStrictEqual (await res.text (), 'mine')
    await within (
      2_000,
      refused (`ws://127.0.0.1:${running.port}/live`),
    )
  } finally {
    await running.close ()
  }
})
