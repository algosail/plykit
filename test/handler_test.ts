import * as P from '@algosail/ply'
import * as D from '@algosail/plydom'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Handler, Reply, Route } from '../src/mod.ts'
import { empty } from '../src/app/reply.ts'
import { discover } from '../src/build/build.ts'
import {
  answer,
  cookie,
  data,
  endpoint,
  failed,
  handler,
  json,
  layout,
  noContent,
  page,
  readFields,
  readHeader,
  readJson,
  readQuery,
  readText,
  redirect,
  reply,
  statusOf,
  text,
  toResponse,
  withCookie,
  withHeader,
  withStatus,
} from '../src/mod.ts'
import { error, routes, state } from './fixture/app.ts'
import './fixture/islands/desk.ts'
import './fixture/islands/mark.ts'
import './fixture/islands/reading.ts'
import { theme } from './fixture/ui/theme.ts'

await discover ({
  include: ['navigation', 'live'],
})

const at = (path: string) => `http://kit.test${path}`
const asking = (path: string, init?: RequestInit) => new Request (at (path), init)
const posting = (path: string, fields: Record<string, string>) =>
  asking (path, { method: 'POST', body: new URLSearchParams (fields) })

test ('kit/reply — replies are values, not a Response', () => {
  assert.deepStrictEqual (data ({ n: 1 }), { tag: 'data', data: { n: 1 }, status: 200 })
  assert.deepStrictEqual (json ({ n: 1 }), {
    tag: 'sent',
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    cookies: [],
    body: '{"n":1}',
  })
  assert.deepStrictEqual (empty (), {
    tag: 'sent',
    status: 204,
    headers: {},
    cookies: [],
    body: null,
  })
  assert.deepStrictEqual (redirect ('/blog'), {
    tag: 'redirect',
    status: 303,
    location: '/blog',
    headers: {},
    cookies: [],
  })
  assert.deepStrictEqual (redirect ('/blog', 301).status, 301)
  assert.deepStrictEqual (
    [failed (404) ('no').error.status, failed (404) ('no').error.message],
    [404, 'no'],
  )
})

test ('kit/reply — status and a header change the reply, without touching the original', () => {
  const made = json ({ id: 7 })
  const created = withHeader ('location') ('/things/7') (withStatus (201) (made))

  assert.deepStrictEqual ([created.status, created.headers.location], [201, '/things/7'])
  assert.deepStrictEqual ([made.status, made.headers.location], [200, undefined])

  assert.deepStrictEqual (withStatus (308) (redirect ('/x')).status, 308)
  assert.deepStrictEqual (withStatus (410) (failed (404) ('no')).error.status, 410)
  assert.deepStrictEqual (withStatus (410) (failed (404) ('no')).error.message, 'no')
  assert.deepStrictEqual (withStatus (201) (data ({ n: 1 })), {
    tag: 'data',
    data: { n: 1 },
    status: 201,
  })

  const shown = data ({ n: 1 }, 422)
  assert.deepStrictEqual (shown.tag === 'data' ? shown.status : 0, 422)
  assert.deepStrictEqual (redirect ('/x', 308).status, 308)
  assert.deepStrictEqual (redirect ('/x').status, 303)
})

test ('kit/reply — a redirect does not take a status you do not redirect with', () => {
  const moved = withStatus (200) (redirect ('/blog'))

  assert.deepStrictEqual (moved.status, 303)
  const res = toResponse (moved)
  assert.deepStrictEqual ([res.status, res.headers.get ('location')], [303, '/blog'])

  assert.deepStrictEqual (withStatus (307) (redirect ('/blog')).status, 307)
  assert.deepStrictEqual (withStatus (503) (redirect ('/blog', 307)).status, 307)
})

test ('kit/reply/toResponse — three kinds of reply arrive', async () => {
  const sent = toResponse (text ('done'))
  assert.deepStrictEqual (sent.status, 200)
  assert.deepStrictEqual (sent.headers.get ('content-type'), 'text/plain; charset=utf-8')
  assert.deepStrictEqual (await sent.text (), 'done')

  const away = toResponse (redirect ('/blog'))
  assert.deepStrictEqual ([away.status, away.headers.get ('location')], [303, '/blog'])
  await away.body?.cancel ()

  const refused = toResponse (failed (422) ('does not match'))
  assert.deepStrictEqual (refused.status, 422)
  assert.deepStrictEqual (
    refused.headers.get ('content-type'),
    'application/json; charset=utf-8',
  )
  assert.deepStrictEqual (await refused.json (), { error: 'does not match' })
})

test ('kit/request/fields — both form encodings read the same', async () => {
  const urlencoded = await F.promise (
    readFields (posting ('/x', { text: 'hello', from: 'anya' })),
  )
  assert.deepStrictEqual (urlencoded, { text: 'hello', from: 'anya' })

  const form = new FormData ()
  form.set ('text', 'hello')
  form.set ('file', new File (['…'], 'note.txt'))
  const multipart = await F.promise (
    readFields (asking ('/x', { method: 'POST', body: form })),
  )
  assert.deepStrictEqual (multipart, { text: 'hello' })
})

test ('kit/request — a body, a query, and a header', async () => {
  const body = asking ('/x', {
    method: 'POST',
    body: JSON.stringify ({ text: 'hello' }),
  })
  assert.deepStrictEqual (await F.promise (readJson (body)), { text: 'hello' })

  const raw = asking ('/x', { method: 'POST', body: 'plain text' })
  assert.deepStrictEqual (await F.promise (readText (raw)), 'plain text')

  assert.deepStrictEqual (readQuery (new URL (at ('/blog?tag=fp&page=2'))), {
    tag: 'fp',
    page: '2',
  })

  const headed = asking ('/x', { headers: { accept: 'application/json' } })
  assert.deepStrictEqual (readHeader ('accept') (headed), P.just ('application/json'))
  assert.deepStrictEqual (readHeader ('x-missing') (headed), P.nothing ())
})

const shell = layout ({ view: (ctx) => H.div ({ class: 'shell' }, [ctx.slot]) })

let seen: Readonly<P.StrMap<string>> = {}

const noted: Handler = (event) =>
  P.map ((fields: Readonly<P.StrMap<string>>) => {
    seen = { ...fields, slug: event.params.slug, method: event.request.method }
    return redirect (`/note/${event.params.slug}`)
  }) (readFields (event.request))

const notePath = '/note/one'
const escaped = '/note/one'

const noteRoutes: readonly Route[] = shell ([
  page<Record<string, never>> ({
    pattern: '/note/[slug]',
    load: () => F.resolve (data ({})),
    view: (ctx) => H.p ([`note ${ctx.params.slug}`]),
    on: {
      POST: noted,
      DELETE: () => F.resolve (failed (403) ('must not delete')),
    },
  }),
])

const notes = handler ({ routes: noteRoutes, error, state })

test ('kit/server — POST to a page goes to its handler and returns 303', async () => {
  const res = await notes (posting ('/note/one', { text: 'hello' }))
  assert.deepStrictEqual (res.status, 303)
  assert.deepStrictEqual (res.headers.get ('location'), '/note/one')
  assert.deepStrictEqual (seen, { text: 'hello', slug: 'one', method: 'POST' })
  await res.body?.cancel ()
})

test ('kit/server — a capture arrives at the handler decoded', async () => {
  const res = await notes (posting (notePath, { text: 'hello' }))
  assert.deepStrictEqual (seen.slug, 'one')
  assert.deepStrictEqual ([res.status, res.headers.get ('location')], [303, escaped])
  await res.body?.cancel ()

  const page = await notes (asking (escaped))
  assert.ok ((await page.text ()).includes ('note one'))
})

test ('kit/server — GET of the same page is still drawn', async () => {
  const res = await notes (asking ('/note/two'))
  assert.deepStrictEqual (res.status, 200)
  assert.ok ((await res.text ()).includes ('note two'))
})

test ('kit/server — a handler\'s refusal on a page is drawn as a page', async () => {
  const res = await notes (asking ('/note/three', { method: 'DELETE' }))
  const html = await res.text ()
  assert.deepStrictEqual (res.status, 403)
  assert.deepStrictEqual (res.headers.get ('content-type'), 'text/html; charset=utf-8')
  assert.ok ((html).includes ('must not delete'))
  assert.ok ((html).includes (`<div class="${theme.page}">`))
})

test ('kit/server — a method the page does not have is a 405', async () => {
  const res = await notes (asking ('/note/one', { method: 'PUT' }))
  assert.deepStrictEqual (res.status, 405)
  assert.deepStrictEqual (res.headers.get ('allow'), 'DELETE, GET, HEAD, POST')
  assert.deepStrictEqual (res.headers.get ('content-type'), 'text/html; charset=utf-8')
  assert.ok ((await res.text ()).includes ('PUT not allowed at /note/[slug]'))
})

test ('kit/server — what a handler threw becomes a 500 and does not escape', async () => {
  const boom = handler ({
    routes: [page<Record<string, never>> ({
      pattern: '/boom',
      load: () => F.resolve (data ({})),
      view: () => H.p (['—']),
      on: {
        POST: () => {
          throw new Error ('it broke off')
        },
      },
    })],
  })
  const res = await boom (asking ('/boom', { method: 'POST' }))
  assert.deepStrictEqual (res.status, 500)
  assert.ok ((await res.text ()).includes ('it broke off'))
})

test ('kit/server — a GET handler on a page answers instead of the view', async () => {
  const both = handler ({
    routes: [page<Record<string, never>> ({
      pattern: '/both',
      load: () => F.resolve (data ({})),
      view: () => H.p (['view']),
      on: { GET: () => F.resolve (text ('handler')) },
    })],
  })
  assert.deepStrictEqual (await (await both (asking ('/both'))).text (), 'handler')
})

const things = handler ({
  routes: [
    endpoint ({
      pattern: '/api/things/[id]',
      on: {
        GET: (event) => F.resolve (json ({ id: event.params.id })),
        PUT: () => F.resolve (empty ()),
        POST: () => F.resolve (failed (422) ('does not match')),
      },
    }),
  ],
  error,
  state,
})

test ('kit/server — an endpoint answers with data, and the capture arrives', async () => {
  const res = await things (asking ('/api/things/7'))
  assert.deepStrictEqual (res.status, 200)
  assert.deepStrictEqual (
    res.headers.get ('content-type'),
    'application/json; charset=utf-8',
  )
  assert.deepStrictEqual (await res.json (), { id: '7' })
})

test ('kit/server — a 204 stays without a body', async () => {
  const res = await things (asking ('/api/things/7', { method: 'PUT' }))
  assert.deepStrictEqual ([res.status, res.body], [204, null])
})

test ('kit/server — an endpoint\'s refusal leaves as JSON, not as a page', async () => {
  const res = await things (asking ('/api/things/7', { method: 'POST' }))
  assert.deepStrictEqual (res.status, 422)
  assert.deepStrictEqual (await res.json (), { error: 'does not match' })
})

test ('kit/server — an endpoint\'s 405 names what it can do', async () => {
  const res = await things (asking ('/api/things/7', { method: 'DELETE' }))
  assert.deepStrictEqual (res.status, 405)
  assert.deepStrictEqual (res.headers.get ('allow'), 'GET, POST, PUT')
  assert.deepStrictEqual (await res.json (), {
    error: 'DELETE not allowed at /api/things/[id]',
  })
})

test ('kit/router/layout — a layout does not touch an endpoint', async () => {
  const wrapped = shell ([
    endpoint ({
      pattern: '/api/bare',
      on: { GET: () => F.resolve (text ('go')) },
    }),
  ])
  const res = await handler ({ routes: wrapped }) (asking ('/api/bare'))
  assert.deepStrictEqual (await res.text (), 'go')
})

test ('kit/server/answer — a reply can be read without opening a socket', async () => {
  const reply = await F.promise (
    answer ({ routes: noteRoutes, error, state }) (
      asking ('/note/one'),
    ),
  )
  assert.deepStrictEqual (reply.tag, 'sent')
  if (reply.tag !== 'sent') return
  assert.deepStrictEqual (reply.status, 200)
  assert.ok ((String (reply.body)).includes ('note one'))

  assert.deepStrictEqual (
    await F.promise (
      answer ({ routes: noteRoutes, state }) (posting ('/note/one', {
        text: 'more',
      })),
    ),
    {
      tag: 'redirect',
      status: 303,
      location: '/note/one',
      headers: {},
      cookies: [],
    },
  )
})

const app = handler ({ routes, error, state })

const asReader = async (name: string): Promise<string> => {
  const entered = await app (posting ('/reader', { name, back: '/' }))
  await entered.body?.cancel ()
  return entered.headers.getSetCookie ()[0].split (';')[0]
}

test ('example — a note from the form is saved and visible on the page', async () => {
  const cookie = await asReader ('anya')
  const sent = await app (asking ('/book/solaris', {
    method: 'POST',
    headers: { cookie },
    body: new URLSearchParams ({ text: 'from the form' }),
  }))
  assert.deepStrictEqual (sent.status, 303)
  assert.deepStrictEqual (sent.headers.get ('location'), '/book/solaris')
  await sent.body?.cancel ()

  const page = await app (asking ('/book/solaris'))
  assert.ok ((await page.text ()).includes ('from the form'))
})

test ('example — an empty note is a 400, as a page', async () => {
  const cookie = await asReader ('borya')
  const res = await app (asking ('/book/solaris', {
    method: 'POST',
    headers: { cookie },
    body: new URLSearchParams ({ text: '   ' }),
  }))
  const html = await res.text ()
  assert.deepStrictEqual (res.status, 400)
  assert.ok ((html).includes ('an empty note cannot be saved'))
  assert.ok ((html).includes (`<div class="${theme.page}">`))
})

test ('example — only readers write in the margins', async () => {
  const res = await app (posting ('/book/solaris', { text: 'I was just passing' }))
  const html = await res.text ()
  assert.deepStrictEqual (res.status, 403)
  assert.ok ((html).includes ('only readers can write in the margins'))
})

test ('example — the same comment through the endpoint: 201, and the record back', async () => {
  const res = await app (asking ('/api/books/solaris/notes', {
    method: 'POST',
    body: JSON.stringify ({ text: 'from fetch' }),
  }))
  assert.deepStrictEqual (res.status, 201)
  const made = await res.json ()
  assert.deepStrictEqual ([made.book, made.text], ['solaris', 'from fetch'])

  const all = await (await app (asking ('/api/books/solaris/notes'))).json ()
  assert.deepStrictEqual (all.some ((c: { text: string }) => c.text === 'from fetch'), true)
})

test ('example — an empty comment through the endpoint is a 400 in JSON', async () => {
  const res = await app (asking ('/api/books/solaris/notes', {
    method: 'POST',
    body: JSON.stringify ({ text: '' }),
  }))
  assert.deepStrictEqual (res.status, 400)
  assert.deepStrictEqual (await res.json (), { error: 'an empty note cannot be saved' })
})

test ('kit/server — a view that fell gives a 500 and does not take the backend with it', async () => {
  const before = D.getBackend ()
  const app = handler ({
    routes: [
      page<Record<string, never>> ({
        pattern: '/boom',
        load: () => F.resolve (data ({})),
        view: () => {
          throw new Error ('the view exploded')
        },
      }),
      page<Record<string, never>> ({
        pattern: '/',
        load: () => F.resolve (data ({})),
        view: () => H.p (['intact']),
      }),
    ],
  })

  const boom = await app (new Request ('http://kit.test/boom'))
  assert.deepStrictEqual (boom.status, 500)
  await boom.body?.cancel ()
  assert.deepStrictEqual (D.getBackend (), before)

  const fine = await app (new Request ('http://kit.test/'))
  assert.deepStrictEqual (fine.status, 200)
  assert.ok ((await fine.text ()).includes ('intact'))
})

test ('kit/server — a page that refuses keeps both the headers and the cookies', async () => {
  const app = handler ({
    routes: [
      page<Record<string, never>> ({
        pattern: '/',
        load: () => F.resolve (data ({})),
        view: () => H.p (['home']),
      }),
    ],
    through: [
      (next) => (ctx) =>
        P.map ((r: Reply) => withCookie (cookie ('flash') ('hi')) (r)) (
          P.map ((r: Reply) => withHeader ('x-mw') ('yes') (r)) (next (ctx)),
        ),
    ],
  })

  const found = await app (new Request ('http://kit.test/'))
  assert.deepStrictEqual (found.headers.getSetCookie ().length, 1)
  await found.body?.cancel ()

  const missing = await app (new Request ('http://kit.test/nope'))
  assert.deepStrictEqual (missing.status, 404)
  assert.deepStrictEqual (missing.headers.get ('x-mw'), 'yes')
  assert.deepStrictEqual (missing.headers.getSetCookie ().length, 1)
  await missing.body?.cancel ()
})

test ('kit/server — a header that does not fit in bytes is a 500, not a crash', async () => {
  const app = handler ({
    routes: [
      endpoint ({
        pattern: '/api',
        on: {
          GET: () => F.resolve (withHeader ('x-who') ('anya—') (json ({ ok: true }))),
        },
      }),
    ],
  })
  const res = await app (new Request ('http://kit.test/api'))
  assert.deepStrictEqual (res.status, 500)
  await res.body?.cancel ()
})

test ('kit/server — HEAD of a page goes to its own on.GET', async () => {
  let loaded = 0
  const ask = handler ({
    routes: [
      page<Record<string, never>> ({
        pattern: '/x',
        load: () => {
          loaded += 1
          return F.resolve (data ({}))
        },
        view: () => H.p (['page']),
        on: { GET: () => F.resolve (text ('handler')) },
      }),
      endpoint ({
        pattern: '/api',
        on: { GET: () => F.resolve (text ('endpoint')) },
      }),
    ],
  })

  const get = await ask (asking ('/x'))
  const head = await ask (asking ('/x', { method: 'HEAD' }))
  assert.deepStrictEqual ([head.status, head.headers.get ('content-type')], [
    get.status,
    get.headers.get ('content-type'),
  ])
  assert.deepStrictEqual (loaded, 0)
  await get.body?.cancel ()
  await head.body?.cancel ()

  const api = await ask (asking ('/api', { method: 'HEAD' }))
  assert.deepStrictEqual ([api.status, api.headers.get ('allow')], [405, 'GET'])
  await api.body?.cancel ()
})

test ('kit/server — ahead answers before the state is built', async () => {
  let built = 0
  const ask = handler<{ who: string }> ({
    routes: [
      page<Record<string, never>> ({
        pattern: '/blog',
        load: () => F.resolve (data ({})),
        view: () => H.p (['blog']),
      }),
    ],
    state: () => {
      built += 1
      return F.reject<unknown, { who: string }> (new Error ('no session'))
    },
    ahead: [(request: Request) => {
      const url = new URL (request.url)
      return url.pathname.length > 1 && url.pathname.endsWith ('/')
        ? P.just (redirect (url.pathname.slice (0, -1), 308))
        : P.nothing<Reply> ()
    }],
  })

  const moved = await ask (asking ('/blog/'))
  assert.deepStrictEqual ([moved.status, moved.headers.get ('location')], [308, '/blog'])
  assert.deepStrictEqual (built, 0)
  await moved.body?.cancel ()

  const broken = await ask (asking ('/blog'))
  assert.deepStrictEqual ([broken.status, built], [500, 1])
  await broken.body?.cancel ()
})

test ('kit/reply — reply is a catamorphism, and statusOf goes through it', () => {
  const describe = reply<string> ({
    sent: (s) => `sent ${s.status}`,
    redirect: (r) => `to ${r.location}`,
    failure: (f) => `no ${f.error.status}`,
  })
  assert.deepStrictEqual (describe (redirect ('/blog')), 'to /blog')
  assert.deepStrictEqual (describe (text ('go')), 'sent 200')
  assert.deepStrictEqual (describe (failed (404) ('no')), 'no 404')
  assert.deepStrictEqual (
    [redirect ('/x'), text ('go'), failed (403) ('no')].map (statusOf),
    [303, 200, 403],
  )
  assert.deepStrictEqual (noContent ().status, 204)
})

test ('kit/handlers — POST of a page answers with that page\'s own data', async () => {
  let reads = 0
  const chrome = layout<{ total: number }> ({
    load: () => F.resolve (data ({ total: 7 })),
    view: (ctx) =>
      H.div ([H.header ([`total: ${ctx.data.total}`]), H.main ([ctx.slot])]),
  })

  type Shown = { readonly title: string; readonly error: string | null }

  const form = page<Shown> ({
    pattern: '/notes',
    load: () => {
      reads += 1
      return F.resolve (data<Shown> ({ title: '', error: null }))
    },
    head: () => ({ title: P.just ('Notes') }),
    on: {
      POST: () =>
        F.resolve (
          withStatus (422) (
            data<Shown> ({ title: 'something', error: 'not allowed' }),
          ),
        ),
    },
    view: (ctx) =>
      H.form ([
        ctx.data.error === null ? null : H.p ([ctx.data.error]),
        H.input ({ name: 'title', value: ctx.data.title }),
      ]),
  })

  const ask = answer ({ routes: chrome ([form]) })
  const said = await F.promise (
    ask (new Request ('http://kit.test/notes', { method: 'POST' })),
  )
  const markup = said.tag === 'sent' ? String (said.body) : ''

  assert.deepStrictEqual (statusOf (said), 422)
  assert.ok ((markup).includes ('not allowed'))
  assert.ok ((markup).includes ('value="something"'))
  assert.ok ((markup).includes ('total: 7'))
  assert.deepStrictEqual (reads, 0)

  const shown = await F.promise (ask (new Request ('http://kit.test/notes')))
  assert.deepStrictEqual (statusOf (shown), 200)
  assert.deepStrictEqual (reads, 1)
})

test ('kit/handlers — a handler that answers with a reply works as before', async () => {
  const form = page ({
    pattern: '/notes',
    head: () => ({ title: P.just ('Notes') }),
    view: () => H.h1 (['Notes']),
    on: { POST: () => F.resolve (redirect ('/notes')) },
  })
  const ask = answer ({ routes: [form] })

  const posted = await F.promise (
    ask (new Request ('http://kit.test/notes', { method: 'POST' })),
  )
  assert.deepStrictEqual (statusOf (posted), 303)
  assert.deepStrictEqual (posted.tag === 'redirect' ? posted.location : '', '/notes')

  const refusing = page ({
    pattern: '/other',
    head: () => ({ title: P.just ('x') }),
    view: () => H.h1 (['x']),
    on: { POST: () => F.resolve (failed (400) ('no')) },
  })
  const bad = await F.promise (
    answer ({ routes: [refusing] }) (
      new Request ('http://kit.test/other', { method: 'POST' }),
    ),
  )
  assert.deepStrictEqual (statusOf (bad), 400)
  assert.ok ((bad.tag === 'sent' ? String (bad.body) : '').includes ('<!doctype'))
})
