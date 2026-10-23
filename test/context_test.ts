import type * as D from '@algosail/plydom'
import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Context, ErrorView, Route } from '../src/mod.ts'
import { data, handler, layout, page, readQuery, text } from '../src/mod.ts'

const asking = (path: string, init?: RequestInit) =>
  new Request (`http://kit.test${path}`, init)

type Visitor = { readonly who: string }

let built = 0

const state = (request: Request): F.Future<unknown, Visitor> =>
  F.attemptP (() => {
    built = built + 1
    return Promise.resolve ({
      who: P.fromMaybe ('guest') (
        P.lookup ('who') (readQuery (new URL (request.url))),
      ),
    })
  })

let seen: readonly string[] = []
const note = (from: string) => (line: string): void => {
  seen = [...seen, `${from}: ${line}`]
}

const chrome = (
  ctx: Context<Visitor> & { readonly slot: D.Child },
): D.View =>
  H.div ({ class: 'shell' }, [
    H.span ([`who: ${ctx.state.who}`]),
    ctx.slot,
  ])

const shell = layout<Context<Visitor>> ({ view: chrome })

const whom: readonly Route<Context<Visitor>>[] = shell ([
  page ({
    pattern: '/who/:id',
    load: (ctx) => {
      note ('load') (`${ctx.state.who} ${ctx.params.id} ${ctx.routeId}`)
      return F.resolve (data ({ id: ctx.params.id }))
    },
    view: (ctx) => {
      note ('view') (`${ctx.state.who} ${ctx.params.id} ${ctx.url.pathname}`)
      return H.p ([`${ctx.data.id} for ${ctx.state.who}`])
    },
    on: {
      POST: (ctx) => {
        note ('on') (`${ctx.state.who} ${ctx.params.id} ${ctx.request.method}`)
        return F.resolve (text (ctx.state.who))
      },
    },
  }),
])

const failing: ErrorView<Context<Visitor>> = (ctx) =>
  chrome ({
    ...ctx,
    slot: H.p ([
      `${ctx.error.status} on ${ctx.url.pathname} at ${ctx.routeId}`,
    ]),
  })

const app = handler ({ routes: whom, error: failing, state })

test ('kit/context — load, view, and the layout read the same context', async () => {
  built = 0
  seen = []
  const res = await app (asking ('/who/seven?who=anya'))
  const html = await res.text ()

  assert.deepStrictEqual (res.status, 200)
  assert.ok ((html).includes ('seven for anya'))
  assert.ok ((html).includes ('who: anya'))
  assert.deepStrictEqual (seen, [
    'load: anya seven /who/:id',
    'view: anya seven /who/seven',
  ])
  assert.deepStrictEqual (built, 1)
})

test ('kit/context — the handler gets that same context', async () => {
  built = 0
  seen = []
  const res = await app (asking ('/who/seven?who=borya', { method: 'POST' }))

  assert.deepStrictEqual (await res.text (), 'borya')
  assert.deepStrictEqual (seen, ['on: borya seven POST'])
  assert.deepStrictEqual (built, 1)
})

test ('kit/context — without its own question the state is still there', async () => {
  const res = await app (asking ('/who/seven'))
  assert.ok ((await res.text ()).includes ('who: guest'))
})

test ('kit/context — the error view gets the same context', async () => {
  const res = await app (asking ('/missing?who=anya'))
  const html = await res.text ()

  assert.deepStrictEqual (res.status, 404)
  assert.ok ((html).includes ('404 on /missing at '))
  assert.ok ((html).includes ('who: anya'))
})

test ('kit/context — a state that did not build is drawn by kit, not by the app', async () => {
  const broken = handler ({
    routes: whom,
    error: failing,
    state: () => F.attemptP (() => Promise.reject (new Error ('the source is silent'))),
  })
  const res = await broken (asking ('/who/seven'))
  const html = await res.text ()

  assert.deepStrictEqual (res.status, 500)
  assert.ok ((html).includes ('the source is silent'))
  assert.deepStrictEqual (html.includes ('class="shell"'), false)
})
