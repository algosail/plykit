import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Middleware, Reply, Route } from '../src/mod.ts'
import {
  after,
  answer,
  before,
  data,
  endpoint,
  failed,
  handler,
  json,
  only,
  page,
  stack,
  text,
  watch,
  whenRequest,
  withHeader,
} from '../src/mod.ts'
import { discover } from '../src/nodejs.ts'
import { error, routes, state, through } from './fixture/app.ts'
import './fixture/islands/desk.ts'
import './fixture/islands/mark.ts'
import './fixture/islands/reading.ts'
import { theme } from './fixture/ui/theme.ts'

await discover ({
  include: ['navigation', 'live'],
})

const asking = (path: string, init?: RequestInit) =>
  new Request (`http://kit.test${path}`, init)

let seen: readonly string[] = []
const note = (line: string): void => {
  seen = [...seen, line]
}

type Who = { readonly who: string }

const said: Route<Who>[] = [
  page ({
    pattern: '/said',
    load: (ctx) => {
      note (`load ${ctx.state.who}`)
      return F.resolve (data ({ who: ctx.state.who }))
    },
    view: (ctx) => H.p ([`said ${ctx.data.who}`]),
  }),
  endpoint ({
    pattern: '/api/said',
    on: { GET: (ctx) => F.resolve (json ({ who: ctx.state.who })) },
  }),
]

const around = (name: string): Middleware<Who> => (next) => (ctx) => {
  note (`${name} →`)
  return P.map ((reply: Reply) => {
    note (`${name} ←`)
    return reply
  }) (next (ctx))
}

const app = (middlewares: readonly Middleware<Who>[]) =>
  handler ({
    routes: said,
    state: () => F.resolve ({ who: 'anya' }),
    through: middlewares,
  })

test ('kit/middleware — the first in the list is the outside', async () => {
  seen = []
  await app ([around ('one'), around ('two')]) (asking ('/said'))
  assert.deepStrictEqual (seen, [
    'one →',
    'two →',
    'load anya',
    'two ←',
    'one ←',
  ])
})

test ('kit/middleware — did not call next — the route did not run', async () => {
  seen = []
  const stops: Middleware<Who> = () => () => F.resolve (text ('instead'))
  const res = await app ([stops, around ('inside')]) (asking ('/said'))

  assert.deepStrictEqual (await res.text (), 'instead')
  assert.deepStrictEqual (seen, [])
})

test ('kit/middleware — sees the page already drawn and changes it', async () => {
  const res = await app ([
    after (withHeader ('x-kit') ('yes')),
    (next) => (ctx) =>
      P.map ((reply: Reply) => {
        note (reply.tag === 'sent' ? String (reply.body).slice (0, 15) : reply.tag)
        return reply
      }) (next (ctx)),
  ]) (asking ('/said'))

  seen = []
  assert.deepStrictEqual (res.headers.get ('x-kit'), 'yes')
  assert.ok ((await res.text ()).includes ('said anya'))
})

test ('kit/middleware — watch sees both sides and changes nothing', async () => {
  seen = []
  const looked: Middleware<Who> = watch ((ctx) => {
    note (`entered ${ctx.url.pathname} ${ctx.state.who}`)
    const at = ctx.request.method
    return (reply: Reply) =>
      note (`left ${at} ${reply.tag === 'sent' ? reply.status : reply.tag}`)
  })

  const res = await app ([looked]) (asking ('/said'))
  assert.deepStrictEqual (seen, ['entered /said anya', 'load anya', 'left GET 200'])
  assert.ok ((await res.text ()).includes ('said anya'))
})

test ('kit/middleware/stack — a group under one name', async () => {
  seen = []
  const both: Middleware<Who> = stack ([
    around ('outer'),
    around ('inner'),
  ])
  await app ([both]) (asking ('/said'))
  assert.deepStrictEqual (seen, [
    'outer →',
    'inner →',
    'load anya',
    'inner ←',
    'outer ←',
  ])
})

test ('kit/middleware — when lets only its own through', async () => {
  const only: Middleware<Who> = whenRequest ((ctx) =>
    P.startsWith ('/api') (ctx.url.pathname),
  ) (after (withHeader ('x-api') ('yes')))

  const page = await app ([only]) (asking ('/said'))
  const data = await app ([only]) (asking ('/api/said'))

  assert.deepStrictEqual (page.headers.get ('x-api'), null)
  assert.deepStrictEqual (data.headers.get ('x-api'), 'yes')
  await page.body?.cancel ()
  await data.body?.cancel ()
})

test ('kit/middleware/only — by the routes themselves, not by the path string', async () => {
  const page = said[0]
  const api = said[1]

  const mine: Middleware<Who> = only ([api]) (
    after (withHeader ('x-only') ('yes')),
  )

  const onPage = await app ([mine]) (asking ('/said'))
  const onApi = await app ([mine]) (asking ('/api/said'))
  const onNothing = await app ([mine]) (asking ('/no-such'))

  assert.deepStrictEqual (onApi.headers.get ('x-only'), 'yes')
  assert.deepStrictEqual (onPage.headers.get ('x-only'), null)
  assert.deepStrictEqual (onNothing.headers.get ('x-only'), null)
  assert.deepStrictEqual (page.id, '/said')
  await onPage.body?.cancel ()
  await onApi.body?.cancel ()
  await onNothing.body?.cancel ()
})

test ('kit/middleware/only — one route can go without a list', async () => {
  const api = said[1]

  const mine: Middleware<Who> = only (api) (after (withHeader ('x-one') ('yes')))

  const onApi = await app ([mine]) (asking ('/api/said'))
  const onPage = await app ([mine]) (asking ('/said'))

  assert.deepStrictEqual (onApi.headers.get ('x-one'), 'yes')
  assert.deepStrictEqual (onPage.headers.get ('x-one'), null)
  await onApi.body?.cancel ()
  await onPage.body?.cancel ()
})

test ('kit/middleware/only — a filter that did not match lets the rest through', async () => {
  const page = said[0]
  const api = said[1]

  const both: readonly Middleware<Who>[] = [
    only (page) (after (withHeader ('x-first') ('yes'))),
    only (api) (after (withHeader ('x-second') ('yes'))),
  ]

  const onApi = await app (both) (asking ('/api/said'))

  assert.deepStrictEqual (onApi.headers.get ('x-first'), null)
  assert.deepStrictEqual (onApi.headers.get ('x-second'), 'yes')
  await onApi.body?.cancel ()
})

test ('kit/middleware — before replaces the context for everything after it', async () => {
  seen = []
  const asBorya: Middleware<Who> = before ((ctx) => ({
    ...ctx,
    state: { who: 'borya' },
  }))
  const res = await app ([asBorya]) (asking ('/said'))

  assert.deepStrictEqual (seen, ['load borya'])
  assert.ok ((await res.text ()).includes ('said borya'))
})

test ('kit/middleware — a refusal is drawn for whoever asked', async () => {
  const refuses: Middleware<Who> = () => () => F.resolve (failed (401) ('who are you'))

  const page = await handler ({
    routes: said,
    state: () => F.resolve ({ who: 'anya' }),
    error: (ctx) => H.div ({ class: 'own' }, [H.h1 ([ctx.error.message])]),
    through: [refuses],
  }) (asking ('/said'))
  assert.deepStrictEqual (page.status, 401)
  assert.deepStrictEqual (page.headers.get ('content-type'), 'text/html; charset=utf-8')
  assert.ok ((await page.text ()).includes ('<div class="own"><h1>who are you'))

  const data = await app ([refuses]) (asking ('/api/said'))
  assert.deepStrictEqual (data.status, 401)
  assert.deepStrictEqual (await data.json (), { error: 'who are you' })
})

test ('kit/middleware — a refusal\'s headers arrive, including a 405', async () => {
  const res = await app ([
    after (withHeader ('x-kit') ('yes')),
  ]) (asking ('/said', { method: 'PUT' }))

  assert.deepStrictEqual (res.status, 405)
  assert.deepStrictEqual (res.headers.get ('allow'), 'GET, HEAD')
  assert.deepStrictEqual (res.headers.get ('x-kit'), 'yes')
  await res.body?.cancel ()
})

test ('kit/middleware — an empty list is the same reply', async () => {
  const bare = await F.promise (
    answer ({ routes: said, state: () => F.resolve ({ who: 'anya' }) }) (
      asking ('/said'),
    ),
  )
  const wrapped = await F.promise (
    answer ({
      routes: said,
      state: () => F.resolve ({ who: 'anya' }),
      through: [],
    }) (
      asking ('/said'),
    ),
  )
  assert.deepStrictEqual (bare, wrapped)
})

const site = handler ({ routes, error, state, through })

test ('example/cors — the preflight is before the route, and the headers are on the reply', async () => {
  const flight = await site (asking ('/api/books/solaris/notes', {
    method: 'OPTIONS',
  }))
  assert.deepStrictEqual (flight.status, 204)
  assert.deepStrictEqual (flight.headers.get ('access-control-allow-origin'), '*')

  const got = await site (asking ('/api/books/solaris/notes'))
  assert.deepStrictEqual (got.status, 200)
  assert.deepStrictEqual (got.headers.get ('access-control-allow-origin'), '*')
  await got.body?.cancel ()
})

test ('example/cors — pages are not told this', async () => {
  const page = await site (asking ('/about'))
  assert.deepStrictEqual (page.headers.get ('access-control-allow-origin'), null)
  assert.ok ((await page.text ()).includes (theme.page))
})
