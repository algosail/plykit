import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  DurableObjectState,
  WorkerContext,
  WorkerRecord,
} from '../src/workers/mod.ts'
import { stale } from '../src/app/events.ts'
import { chunkDir } from '../src/build/build.ts'
import { mkdir, readText, realpath, stat, writeText } from '../src/fs/disk.ts'
import { css, endpoint, page, resetStyles, styleIds, text } from '../src/mod.ts'
import { KitLive, worker } from '../src/workers/mod.ts'
import { stage } from '../src/workers/stage.ts'
import { inDir } from './temp.ts'

const record: WorkerRecord = {
  manifest: {},
  styles: null,
  styleIds: [],
}

const quiet: WorkerContext = { waitUntil: () => {} }

class FakeSocket extends EventTarget {
  readonly sent: string[] = []
  accepted = false

  accept(): void {
    this.accepted = true
  }

  send(data: string): void {
    this.sent.push (String (data))
  }

  close(): void {
    this.dispatchEvent (new Event ('close'))
  }
}

class FakePair {
  readonly 0: FakeSocket
  readonly 1: FakeSocket

  constructor() {
    this[0] = new FakeSocket ()
    this[1] = new FakeSocket ()
    latest = this
    server = this[1]
  }
}

let latest: FakePair | undefined
let server: FakeSocket | undefined

const socketHost = (): { WebSocketPair?: unknown } =>
  globalThis as { WebSocketPair?: unknown }

const closeServer = (): void => {
  server?.close ()
  server = undefined
}

const usingPair = async (run: () => Promise<void>): Promise<void> => {
  const prior = socketHost ().WebSocketPair
  latest = undefined
  server = undefined
  socketHost ().WebSocketPair = FakePair
  try {
    await run ()
  } finally {
    if (prior === undefined) delete socketHost ().WebSocketPair
    else socketHost ().WebSocketPair = prior
    closeServer ()
  }
}

const stateWith = (sockets: FakeSocket[]): DurableObjectState => ({
  acceptWebSocket(ws: WebSocket): void {
    sockets.push (ws as unknown as FakeSocket)
  },
  getWebSockets(): readonly WebSocket[] {
    return sockets as unknown as readonly WebSocket[]
  },
})

test ('kit/workers — the page is drawn, and the client address is taken from the platform', async () => {
  const app = worker ({
    routes: [
      page ({
        pattern: '/',
        view: (one) => H.p ([P.fromMaybe ('nobody') (one.client)]),
      }),
    ],
  }, { record })

  const res = await app.fetch (
    new Request ('http://x/', {
      headers: { 'cf-connecting-ip': '203.0.113.5' },
    }),
    {},
    quiet,
  )
  assert.deepStrictEqual (res.status, 200)
  assert.ok ((await res.text ()).includes ('203.0.113.5'))
})

test ('kit/workers — a block missing from the linked sheet rides in the page', async () => {
  resetStyles ()
  const painted = css`
    .banner {
      color: #123456;
    }
  `
  const id = styleIds ()[0] ?? ''
  const app = worker ({
    routes: [
      page ({
        pattern: '/',
        view: () => H.p ({ class: painted.banner }, ['hi']),
      }),
    ],
  }, {
    record: {
      manifest: {},
      styles: '/_kit/styles-old.css',
      styleIds: ['not-the-banner'],
    },
  })

  const html = await (await app.fetch (new Request ('http://x/'), {}, quiet)).text ()
  assert.ok ((html).includes ('rel="stylesheet" href="/_kit/styles-old.css"'))
  assert.ok ((html).includes (painted.banner))
  assert.ok ((html).includes ('#123456'))

  const caughtUp = worker ({
    routes: [
      page ({
        pattern: '/',
        view: () => H.p ({ class: painted.banner }, ['hi']),
      }),
    ],
  }, {
    record: {
      manifest: {},
      styles: '/_kit/styles-old.css',
      styleIds: [id],
    },
  })
  const quietHtml = await (await caughtUp.fetch (new Request ('http://x/'), {}, quiet)).text ()
  assert.ok ((quietHtml).includes (painted.banner))
  assert.deepStrictEqual (quietHtml.includes ('#123456'), false)
})

test ('kit/workers — a file under the prefix comes from ASSETS, a page does not', async () => {
  const seen: string[] = []
  const app = worker ({
    routes: [page ({ pattern: '/', view: () => H.p (['page']) })],
    assets: { dir: 'file:///unused/', base: '/static/' },
  }, { record })

  const env = {
    ASSETS: {
      fetch: (input: RequestInfo | URL): Promise<Response> => {
        const url = input instanceof Request ? input.url : String (input)
        seen.push (new URL (url).pathname)
        return Promise.resolve (
          new URL (url).pathname === '/static/lamp.svg'
            ? new Response ('<svg/>', {
              headers: { 'content-type': 'image/svg+xml' },
            })
            : new Response (null, { status: 404 }),
        )
      },
    },
  }

  const file = await app.fetch (
    new Request ('http://x/static/lamp.svg'),
    env,
    quiet,
  )
  assert.deepStrictEqual (file.status, 200)
  assert.deepStrictEqual (await file.text (), '<svg/>')

  const missing = await app.fetch (
    new Request ('http://x/static/gone.svg'),
    env,
    quiet,
  )
  assert.deepStrictEqual (missing.status, 404)

  const pageRes = await app.fetch (new Request ('http://x/'), env, quiet)
  assert.deepStrictEqual (pageRes.status, 200)
  assert.ok ((await pageRes.text ()).includes ('page'))
  assert.deepStrictEqual (seen.includes ('/'), false)
})

test ('kit/workers — record.files is a static prefix when the app names none', async () => {
  const seen: string[] = []
  const app = worker ({
    routes: [page ({ pattern: '/', view: () => H.p (['page']) })],
  }, {
    record: { ...record, files: '/static/' },
  })
  const env = {
    ASSETS: {
      fetch: (input: RequestInfo | URL): Promise<Response> => {
        const url = input instanceof Request ? input.url : String (input)
        seen.push (new URL (url).pathname)
        return Promise.resolve (
          new URL (url).pathname === '/static/lamp.svg'
            ? new Response ('<svg/>')
            : new Response (null, { status: 404 }),
        )
      },
    },
  }
  const file = await app.fetch (new Request ('http://x/static/lamp.svg'), env, quiet)
  assert.deepStrictEqual (file.status, 200)
  assert.deepStrictEqual (await file.text (), '<svg/>')
  const missingFile = await app.fetch (new Request ('http://x/static/gone.svg'), env, quiet)
  assert.deepStrictEqual (missingFile.status, 404)
  const chunk = await app.fetch (new Request ('http://x/_kit/mark.js'), env, quiet)
  assert.deepStrictEqual (chunk.status, 404)
  assert.deepStrictEqual (seen.includes ('/_kit/mark.js'), true)
  const pageRes = await app.fetch (new Request ('http://x/'), env, quiet)
  assert.ok ((await pageRes.text ()).includes ('page'))
  assert.deepStrictEqual (seen.includes ('/'), false)
})

test ('kit/workers — stale reaches a listener through KitLive', async () => {
  const sockets: FakeSocket[] = []
  const live = new KitLive (stateWith (sockets), {})
  const pending: Promise<unknown>[] = []
  const app = worker ({
    routes: [
      endpoint ({
        pattern: '/mark',
        on: {
          POST: (ctx) => {
            stale (ctx) ('notes')
            return F.resolve (text ('ok'))
          },
        },
      }),
    ],
    include: ['live'],
  }, { record })

  const env = {
    KIT_LIVE: {
      idFromName: () => 'kit',
      get: () => live,
    },
  }
  const waiting: WorkerContext = {
    waitUntil: (promise) => {
      pending.push (promise)
    },
  }

  const plain = await app.fetch (new Request ('http://x/live'), env, waiting)
  assert.deepStrictEqual (plain.status, 426)
  assert.deepStrictEqual (plain.headers.get ('upgrade'), 'websocket')
  assert.deepStrictEqual (sockets.length, 0)

  const bad = await live.fetch ('https://kit-live/send', {
    method: 'POST',
    body: '{',
  })
  assert.deepStrictEqual (bad.status, 400)

  await usingPair (async () => {
    const opened = await app.fetch (
      new Request ('http://x/live', { headers: { upgrade: 'websocket' } }),
      env,
      waiting,
    )
    assert.deepStrictEqual (opened.status, 101)
    assert.deepStrictEqual (opened.headers.get ('upgrade'), 'websocket')
    assert.deepStrictEqual (sockets.length, 1)
    assert.deepStrictEqual (sockets[0], server)
    assert.deepStrictEqual (server?.accepted, false)

    const marked = await app.fetch (
      new Request ('http://x/mark', { method: 'POST' }),
      env,
      waiting,
    )
    assert.deepStrictEqual (marked.status, 200)
    await Promise.all (pending)
    assert.deepStrictEqual (JSON.parse (sockets[0]?.sent[0] ?? ''), {
      event: 'kit-part',
      data: 'notes',
    })
  })
})

test ('kit/workers — without KIT_LIVE an ordinary GET asks for an upgrade', async () => {
  const app = worker ({ routes: [], include: ['live'] }, { record })
  const res = await app.fetch (new Request ('http://x/live'), {}, quiet)
  assert.deepStrictEqual (res.status, 426)
  assert.deepStrictEqual (res.headers.get ('upgrade'), 'websocket')
  await res.body?.cancel ()
})

test ('kit/workers — without the binding the socket listens in the isolate', async () =>
  usingPair (async () => {
    const app = worker ({
      routes: [
        endpoint ({
          pattern: '/mark',
          on: {
            POST: (ctx) => {
              stale (ctx) ('shelf')
              return F.resolve (text ('ok'))
            },
          },
        }),
      ],
      include: ['live'],
    }, { record })
    const opened = await app.fetch (
      new Request ('http://x/live', { headers: { upgrade: 'websocket' } }),
      {},
      quiet,
    )
    assert.deepStrictEqual (opened.status, 101)
    assert.deepStrictEqual (server?.accepted, true)
    const marked = await app.fetch (
      new Request ('http://x/mark', { method: 'POST' }),
      {},
      quiet,
    )
    assert.deepStrictEqual (marked.status, 200)
    assert.deepStrictEqual (JSON.parse (server?.sent[0] ?? ''), {
      event: 'kit-part',
      data: 'shelf',
    })
  }))

test ('kit/workers — someone else\'s /live does not become a socket', async () =>
  usingPair (async () => {
    const app = worker ({
      routes: [
        endpoint ({
          pattern: '/live',
          on: { GET: () => F.resolve (text ('mine')) },
        }),
      ],
      include: ['live'],
    }, { record })
    const res = await app.fetch (
      new Request ('http://x/live', { headers: { upgrade: 'websocket' } }),
      {},
      quiet,
    )
    assert.deepStrictEqual (await res.text (), 'mine')
    assert.deepStrictEqual (latest, undefined)
  }))

test ('kit/stage — chunks go into assets, and the record stays beside them', () =>
  inDir (async (root) => {
    const chunks = `${root}/chunks`
    const files = `${root}/static`
    const to = `${root}/dist`
    await mkdir (chunks)
    await mkdir (`${files}/img`, { recursive: true })
    await writeText (
      `${chunks}/kit-build.json`,
      JSON.stringify ({
        manifest: { counter: '/_kit/counter-abc.js' },
        styles: '/_kit/styles-abc.css',
        styleIds: ['one'],
        files: ['counter-abc.js', 'styles-abc.css'],
      }),
    )
    await writeText (`${chunks}/counter-abc.js`, 'console.log(1)')
    await writeText (`${chunks}/styles-abc.css`, 'p{}')
    await writeText (
      `${chunks}/kit-data.json`,
      JSON.stringify ({ '/': { n: 1 } }),
    )
    await writeText (`${files}/img/lamp.svg`, '<svg/>')
    await writeText (`${files}/notes.log`, 'do not serve')

    const laid = await stage ({
      outDir: chunks,
      to,
      assets: {
        dir: files,
        serves: (name) => !name.endsWith ('.log'),
      },
    })

    assert.deepStrictEqual (
      await readText (`${to}/assets/_kit/counter-abc.js`),
      'console.log(1)',
    )
    assert.deepStrictEqual (
      await readText (`${to}/assets/static/img/lamp.svg`),
      '<svg/>',
    )
    await assert.rejects (() => stat (`${to}/assets/static/notes.log`))
    await assert.rejects (() => stat (`${to}/assets/_kit/kit-build.json`))
    assert.ok ((await readText (`${to}/assets/_headers`)).includes ('public, max-age=31536000, immutable'))
    const written = JSON.parse (await readText (laid.record))
    assert.deepStrictEqual (written.manifest.counter, '/_kit/counter-abc.js')
    assert.deepStrictEqual (written.styleIds, ['one'])
    assert.deepStrictEqual (written.data, { '/': { n: 1 } })
    assert.deepStrictEqual (written.files, '/static/')
    assert.deepStrictEqual (laid.assets, `${to}/assets`)
  }))

test ('kit/build — without outDir the chunks go to .kit, not into the assets', () =>
  inDir (async (dir) => {
    const back = process.cwd ()
    try {
      process.chdir (dir)
      await mkdir (`${dir}/static`)
      const got = await chunkDir ({})
      assert.deepStrictEqual (got, await realpath (`${dir}/.kit`))
      await assert.rejects (() => stat (`${dir}/static/_kit`))
    } finally {
      process.chdir (back)
    }
  }))

test ('kit/stage — a chunk directory inside the assets is copied once', () =>
  inDir (async (root) => {
    const files = `${root}/static`
    const chunks = `${files}/_kit`
    const to = `${root}/dist`
    await mkdir (`${chunks}`, { recursive: true })
    await mkdir (`${files}/img`, { recursive: true })
    await mkdir (`${to}/assets/static/_kit`, { recursive: true })
    await writeText (`${to}/assets/static/_kit/stale.js`, 'old')
    await writeText (
      `${chunks}/kit-build.json`,
      JSON.stringify ({
        manifest: { counter: '/_kit/counter-abc.js' },
        styles: null,
        styleIds: [],
        files: ['counter-abc.js'],
      }),
    )
    await writeText (`${chunks}/counter-abc.js`, 'console.log(1)')
    await writeText (`${files}/img/lamp.svg`, '<svg/>')

    await stage ({ outDir: chunks, to, assets: { dir: files } })

    assert.deepStrictEqual (
      await readText (`${to}/assets/_kit/counter-abc.js`),
      'console.log(1)',
    )
    assert.deepStrictEqual (
      await readText (`${to}/assets/static/img/lamp.svg`),
      '<svg/>',
    )
    await assert.rejects (() => stat (`${to}/assets/static/_kit`))
    await assert.rejects (() => stat (`${to}/assets/static/_kit/stale.js`))
  }))
