import * as P from '@algosail/ply'
import * as D from '@algosail/plydom'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import * as S from '@algosail/plystream'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Route } from '../src/mod.ts'
import { asked, find } from '../src/document/partial.ts'
import {
  answer,
  css,
  into,
  page,
  part,
  PART_ATTR,
  PART_HEADER,
  resetIslandsIn,
  serializeNode,
  serverBackend,
  serverRoot,
} from '../src/mod.ts'

const at = (path: string) => `http://kit.test${path}`
const asking = (path: string, headers?: Record<string, string>) =>
  new Request (at (path), { headers })

const style = css`
  .board {
    border: 1px solid black;
  }
`

const board: Route = page ({
  pattern: '/board',
  load: () =>
    F.resolve ({ tag: 'data', data: { items: ['one', 'two'] }, status: 200 }),
  head: () => ({ title: P.just ('Board'), meta: [] }),
  view: (ctx) =>
    H.main ([
      H.h1 (['Board']),
      H.ul (
        { ...part ('items'), class: style.board },
        (ctx.data as { items: string[] }).items.map ((s: string) => H.li ([s])),
      ),
      H.p (['footer']),
    ]),
})

const replying = answer ({ routes: [board] })
const bodyOf = async (request: Request): Promise<string> => {
  const reply = await F.promise (replying (request))
  return reply.tag === 'sent' ? String (reply.body) : ''
}

test ('kit/partial — the markup names the region and where an action goes', () => {
  assert.deepStrictEqual (part ('items'), { 'data-kit-part': 'items' })
  assert.deepStrictEqual (into ('items'), { 'data-kit-into': 'items' })
  assert.deepStrictEqual (PART_ATTR, 'data-kit-part')
})

test ('kit/partial — the name arrives in a header and is checked', () => {
  assert.deepStrictEqual (
    asked (asking ('/board', { [PART_HEADER]: 'items' })),
    P.just ('items'),
  )
  assert.deepStrictEqual (asked (asking ('/board')), P.nothing ())
  assert.deepStrictEqual (asked (asking ('/board', { [PART_HEADER]: 'a b' })), P.nothing ())
  assert.deepStrictEqual (
    asked (asking ('/board', { [PART_HEADER]: 'x'.repeat (65) })),
    P.nothing (),
  )
})

test ('kit/partial — find takes the node, and serializeNode prints the whole of it', () => {
  const previous = D.setBackend (serverBackend)
  const tree = serverRoot ()
  const mounted = D.mount (tree as unknown as Node) (
    H.div ([H.ul ({ ...part ('items') }, [H.li (['one'])])]),
  )
  const found = find ('items') (tree)
  const printed = found.tag === 'just' ? serializeNode (found.value) : ''
  S.dispose (mounted)
  D.setBackend (previous)

  assert.ok ((printed).includes ('<ul data-kit-part="items">'))
  assert.ok ((printed).includes ('<li>one'))
  assert.deepStrictEqual (printed.endsWith ('</ul>'), true)
  assert.deepStrictEqual (find ('no such') (serverRoot ()), P.nothing ())
})

test ('kit/partial — without the header the whole page arrives', async () => {
  const body = await bodyOf (asking ('/board'))
  assert.ok ((body).includes ('<!doctype html>'))
  assert.ok ((body).includes ('<h1>Board'))
  assert.ok ((body).includes ('footer'))
})

test ('kit/partial — with the header one region arrives', async () => {
  const body = await bodyOf (asking ('/board', { [PART_HEADER]: 'items' }))
  assert.ok ((body).includes (`${PART_ATTR}="items"`))
  assert.ok ((body).includes ('<li>one'))
  assert.deepStrictEqual (body.trimEnd ().endsWith ('</ul>'), true)
  assert.deepStrictEqual (body.includes ('<!doctype html>'), false)
  assert.deepStrictEqual (body.includes ('<h1>'), false)
  assert.deepStrictEqual (body.includes ('footer'), false)
})

test ('kit/partial — a region carries its own styles', async () => {
  const body = await bodyOf (asking ('/board', { [PART_HEADER]: 'items' }))
  assert.ok ((body).includes ('<style data-kit'))
  assert.ok ((body).includes ('border: 1px solid black'))
})

test ('kit/partial — a name that is not on the page is answered with the page', async () => {
  const body = await bodyOf (asking ('/board', { [PART_HEADER]: 'no-such' }))
  assert.ok ((body).includes ('<!doctype html>'))
})

test ('kit/partial — the reply is marked vary: one address answers two different things', async () => {
  const whole = await F.promise (replying (asking ('/board')))
  const piece = await F.promise (
    replying (asking ('/board', { [PART_HEADER]: 'items' })),
  )
  const varyOf = (r: typeof whole) =>
    r.tag === 'sent' ? r.headers['vary'] : undefined
  assert.deepStrictEqual (varyOf (whole), PART_HEADER)
  assert.deepStrictEqual (varyOf (piece), PART_HEADER)
})

test ('kit/partial — the page status carries over to its region', async () => {
  const slow: Route = page ({
    pattern: '/slow',
    load: () => F.resolve ({ tag: 'data', data: {}, status: 201 }),
    head: () => ({ title: P.nothing (), meta: [] }),
    view: () => H.div ({ ...part ('x') }, ['here']),
  })
  const reply = await F.promise (
    answer ({ routes: [slow] }) (asking ('/slow', { [PART_HEADER]: 'x' })),
  )
  assert.deepStrictEqual (reply.tag === 'sent' ? reply.status : 0, 201)
})

test ('kit/island — resetIslandsIn takes down only its own subtree', () => {
  const tree = serverRoot ()
  resetIslandsIn (tree as unknown as Node)
})
