import * as D from '@algosail/plydom'
import * as H from '@algosail/plydom/h'
import * as S from '@algosail/plystream'
import { Window } from 'happy-dom'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Hazard, ServerNode } from '../src/mod.ts'
import {
  escapeAttribute,
  escapeText,
  hazards,
  serializeChildren,
  serverBackend,
  serverRoot,
} from '../src/mod.ts'
import { patchFormSibling } from './dom.ts'

const doc = new Window ().document as unknown as Document
patchFormSibling (doc.createElement ('div'))
const make = (tag: string): Element => {
  const e = doc.createElement (tag) as unknown as {
    style?: Record<string, string>
  }
  if (e.style === undefined) e.style = {}
  return e as unknown as Element
}
const clientBackend: D.Backend = {
  element: make,
  elementNS: (_ns, tag) => make (tag),
  text: (data) => doc.createTextNode (data) as unknown as Text,
  comment: (data) => doc.createComment (data) as unknown as Comment,
}
type Box = Node & { innerHTML: string }
const box = (): Box => doc.createElement ('div') as unknown as Box

/**
 * Renders a factory on the server.
 */
const server = (
  make: () => D.View,
): { markup: string; hazards: readonly Hazard[] } => {
  D.setBackend (serverBackend)
  const tree = serverRoot ()
  const dsp = D.mount (tree as unknown as Node) (make ())
  const rendered = {
    markup: serializeChildren (tree),
    hazards: hazards (tree),
  }
  S.dispose (dsp)
  return rendered
}

/**
 * Every element under a node, in document order.
 */
const elementsIn = (node: Node): readonly Node[] => {
  const found: Node[] = []
  const walk = (current: Node): void => {
    for (const child of current.childNodes) {
      if (child.nodeType === 1) found.push (child)
      walk (child)
    }
  }
  walk (node)
  return found
}

/**
 * Server-renders, reparses, hydrates, and reports whether it was adopted.
 */
const roundTrip = (
  make: () => D.View,
): { markup: string; adopted: boolean; rebuiltTo: string } => {
  const { markup } = server (make)
  D.setBackend (clientBackend)
  const target = box ()
  target.innerHTML = markup

  const marked = elementsIn (target)
  const dsp = D.hydrate (target) (make)
  const live = new Set (elementsIn (target))
  const adopted = marked.every ((el) => live.has (el))
  const after = target.innerHTML
  S.dispose (dsp)
  return { markup, adopted, rebuiltTo: after }
}

test ('kit/serialize — an element, attributes, and a slot anchor', () => {
  const { markup } = server (() => D.el ('div', { class: 'box' }, ['Hello']))
  assert.deepStrictEqual (markup, '<div class="box">Hello</div>')
})

test ('kit/serialize — empty elements without a closing tag', () => {
  assert.deepStrictEqual (server (() => H.br ()).markup, '<br>')
  assert.deepStrictEqual (
    server (() => H.img ({ src: 'a.png' })).markup,
    '<img src="a.png">',
  )
})

test ('kit/escapeText and escapeAttribute', () => {
  assert.deepStrictEqual (escapeText ('a & <b>'), 'a &amp; &lt;b&gt;')
  assert.deepStrictEqual (escapeText ('say "hi"'), 'say "hi"')
  assert.deepStrictEqual (
    escapeAttribute ('say "hi" & <go>'),
    'say &quot;hi&quot; &amp; &lt;go&gt;',
  )
})

test ('kit/serialize — escapes text and attribute values', () => {
  const { markup } = server (() => H.p ({ title: 'a "b" & c' }, ['<script>']))
  assert.deepStrictEqual (
    markup,
    '<p title="a &quot;b&quot; &amp; c">&lt;script&gt;</p>',
  )
})

test ('kit/serialize — a style block is gathered into an attribute', () => {
  const { markup } = server (() =>
    D.el ('div', { style: { color: 'red', width: '' } }, []),
  )
  assert.deepStrictEqual (markup, '<div style="color: red;"></div>')
})

test ('kit/serialize — a declaration that is not one declaration is not written', () => {
  const hurt = server (() =>
    D.el ('div', {
      style: { color: 'red; position: fixed; inset: 0; z-index: 9999' },
    }, []),
  )
  assert.deepStrictEqual (hurt.markup, '<div></div>')

  const named = server (() =>
    D.el ('div', { 'color: red; position': 'fixed', width: '1px' }, []),
  )
  assert.deepStrictEqual (named.markup, '<div width="1px"></div>')
  const inStyle = server (() =>
    D.el (
      'div',
      { style: { 'color: red; position': 'fixed', width: '1px' } },
      [],
    ),
  )
  assert.deepStrictEqual (inStyle.markup, '<div style="width: 1px;"></div>')

  const quoted = server (() => D.el ('div', { style: { content: '"a;b"' } }, []))
  assert.deepStrictEqual (quoted.markup, '<div style="content: &quot;a;b&quot;;"></div>')
})

test ('kit/serialize — event listeners are not serialized', () => {
  const { markup } = server (() => H.button ({ 'on:click': () => {} }, ['go']))
  assert.deepStrictEqual (markup, '<button>go</button>')
})

test ('kit/serialize — .textContent changes the tree, not a bag of properties', () => {
  const { markup } = server (() =>
    D.el ('div', { '.textContent': 'via prop' }, []),
  )
  assert.deepStrictEqual (markup, '<div>via prop</div>')
})

test ('kit/serialize — an unfilled cell gives an empty slot', () => {
  const [strm] = S.bus<D.Child> ()
  const { markup } = server (() => H.div ([strm]))
  assert.deepStrictEqual (markup, '<div></div>')
})

test ('kit/serialize — a cell among neighbours still writes the markers', () => {
  const [strm] = S.bus<D.Child> ()
  const { markup } = server (() => H.div (['before ', strm]))
  assert.deepStrictEqual (markup, '<div>before <!--[--><!--]--></div>')
})

test ('kit/serialize — a slot is filled after mounting', () => {
  D.setBackend (serverBackend)
  const [slot, fill] = S.bus<D.Child> ()
  const tree = serverRoot ()
  const dsp = D.mount (tree as unknown as Node) (H.div ([slot]))
  assert.deepStrictEqual (
    serializeChildren (tree),
    '<div></div>',
    'the slot is empty before it is filled',
  )
  fill ('filled')
  assert.deepStrictEqual (
    serializeChildren (tree),
    '<div>filled</div>',
  )
  S.dispose (dsp)
})

test ('kit/serialize — nested slots fill from the outside in', () => {
  D.setBackend (serverBackend)
  const [outer, fillOuter] = S.bus<D.Child> ()
  const [inner, fillInner] = S.bus<D.Child> ()
  const tree = serverRoot ()
  const dsp = D.mount (tree as unknown as Node) (
    H.div ({ class: 'a' }, [outer]),
  )
  fillOuter (H.section ({ class: 'b' }, [inner]))
  fillInner (H.p (['leaf']))
  assert.deepStrictEqual (
    serializeChildren (tree),
    '<div class="a"><section class="b"><p>leaf</p></section></div>',
  )
  S.dispose (dsp)
})

const scenes: [string, () => D.View][] = [
  ['a plain element', () => D.el ('div', { class: 'a' }, ['text'])],
  [
    'nesting and arrays',
    () => H.ul ([[H.li (['1']), H.li (['2'])], H.li (['3'])]),
  ],
  ['an empty element', () => H.br ()],
  ['numbers and nullish', () => H.p ([1, null, 'x', undefined, 2])],
  ['adjacent texts', () => H.p (['a', 'b', 'c'])],
  ['escaping', () => H.p (['<script>&"'])],
  ['an event listener', () => H.button ({ 'on:click': () => {} }, ['press'])],
  [
    'deep nesting',
    () => H.main ([H.section ([H.article ([H.h2 (['t']), H.p (['b'])])])]),
  ],
  ['a table with tbody', () => H.table ([H.tbody ([H.tr ([H.td (['x'])])])])],
]

for (const [name, make] of scenes) {
  test (`kit/round trip — ${name}`, () => {
    const { adopted } = roundTrip (make)
    assert.deepStrictEqual (adopted, true)
  })
}

test ('kit/round trip — SVG is serialized and adopted', () => {
  const { markup } = server (() => H.svg ({}, [H.circle ({ r: '4' })]))
  assert.deepStrictEqual (markup, '<svg><circle r="4"></circle></svg>')
  const { adopted } = roundTrip (() => H.svg ({}, [H.circle ({ r: '4' })]))
  assert.deepStrictEqual (adopted, true)
})

test ('kit/round trip — a slot filled after mounting is adopted', () => {
  const build = () => {
    const [slot, fill] = S.bus<D.Child> ()
    return { view: H.div ([slot]), fill: () => fill (H.span (['from the slot'])) }
  }

  D.setBackend (serverBackend)
  const tree = serverRoot ()
  const srv = build ()
  const sd = D.mount (tree as unknown as Node) (srv.view)
  srv.fill ()
  const markup = serializeChildren (tree)
  S.dispose (sd)

  D.setBackend (clientBackend)
  const target = box ()
  target.innerHTML = markup
  const marked = target.firstChild as unknown as { adopted?: boolean }
  marked.adopted = true

  const cli = build ()
  const dsp = D.hydrate (target) (cli.view)
  cli.fill ()
  assert.deepStrictEqual (
    (target.firstChild as unknown as { adopted?: boolean }).adopted,
    true,
    'the markup should be adopted, not rebuilt',
  )
  assert.deepStrictEqual (target.innerHTML, markup)
  S.dispose (dsp)
})

test ('kit/hazards — a clean tree gives no hazards', () => {
  assert.deepStrictEqual (
    server (() => H.main ([H.p (['ok']), H.ul ([H.li (['x'])])])).hazards,
    [],
  )
})

const watchingName = (node: ServerNode): () => number => {
  let asked = 0
  const said = node.localName
  Object.defineProperty (node, 'localName', {
    get() {
      asked += 1
      return said
    },
  })
  return () => asked
}

test ('kit/hazards — the walk asks a node once and does not ask a text', () => {
  const asNode = (e: Element | Text | Comment): ServerNode =>
    e as unknown as ServerNode
  const host = serverRoot ()
  const ul = asNode (serverBackend.element ('ul'))
  const li = asNode (serverBackend.element ('li'))
  const said = asNode (serverBackend.text ('string'))
  li.insertBefore (said, null)
  ul.insertBefore (li, null)
  host.insertBefore (ul, null)
  const onUl = watchingName (ul)
  const onLi = watchingName (li)
  const onText = watchingName (said)

  assert.deepStrictEqual (hazards (host), [])
  assert.deepStrictEqual ([onUl () <= 2, onLi () <= 2], [true, true], `${onUl ()}/${onLi ()}`)
  assert.deepStrictEqual (onText (), 0)
})

test ('kit/hazards — raw text inside style breaks hydration', () => {
  const found = server (() => H.style (['a{color:red}'])).hazards
  assert.deepStrictEqual (found.length, 1)
  assert.deepStrictEqual (found[0].path, 'style')
})

test ('kit/hazards — tr without tbody, div in p, a in a', () => {
  const cases: [() => D.View, string][] = [
    [() => H.table ([H.tr ([H.td (['x'])])]), 'table > tr'],
    [() => H.p ([H.div (['x'])]), 'p > div'],
    [() => H.a ([H.a (['x'])]), 'a > a'],
  ]
  for (const [make, path] of cases) {
    const found = server (make).hazards
    assert.deepStrictEqual (found.length >= 1, true, `${path}: a hazard was expected`)
    assert.deepStrictEqual (found[0].path, path)
  }
})

test ('kit/hazards — the hazards match a real hydration failure', () => {
  const cases: [string, () => D.View][] = [
    [
      'table > tbody > tr',
      () => H.table ([H.tbody ([H.tr ([H.td (['x'])])])]),
    ],
    ['ul > div', () => H.ul ([H.div (['x'])])],
    ['a > a', () => H.a ([H.a (['x'])])],
  ]
  for (const [name, make] of cases) {
    const flagged = server (make).hazards.length > 0
    const { adopted } = roundTrip (make)
    assert.deepStrictEqual (flagged, !adopted, `${name}: the hazard and the result disagreed`)
  }
})

test ('kit/hazards — the stand does not rewrite table and p, and the hazard stays', () => {
  const cases: [string, () => D.View][] = [
    ['table > tr', () => H.table ([H.tr ([H.td (['x'])])])],
    ['p > div', () => H.p ([H.div (['x'])])],
  ]
  for (const [name, make] of cases) {
    assert.deepStrictEqual (server (make).hazards.length > 0, true, name)
    assert.deepStrictEqual (roundTrip (make).adopted, true, name)
  }
})
