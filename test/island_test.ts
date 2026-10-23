import * as P from '@algosail/ply'
import * as D from '@algosail/plydom'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import * as S from '@algosail/plystream'
import { Window } from 'happy-dom'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Route } from '../src/mod.ts'
import { discover } from '../src/build/build.ts'
import { declared as declaredIslands } from '../src/islands/island.ts'
import {
  css,
  data,
  handler,
  hydrateIslands,
  island,
  resetIslands,
  resetIslandsIn,
  page as routePage,
  usedIslands,
} from '../src/mod.ts'
import { patchFormSibling } from './dom.ts'

const doc = new Window ().document as unknown as Document
patchFormSibling (doc.createElement ('div'))
const mk = (tag: string): Element => {
  const e = doc.createElement (tag) as unknown as {
    style?: Record<string, string>
  }
  if (e.style === undefined) e.style = {}
  return e as unknown as Element
}
D.setBackend ({
  element: mk,
  elementNS: (_ns, tag) => mk (tag),
  text: (data) => doc.createTextNode (data) as unknown as Text,
  comment: (data) => doc.createComment (data) as unknown as Comment,
})

type Box = Node & { innerHTML: string }
const box = (): Box => doc.createElement ('div') as unknown as Box

/**
 * Marks a node, so adoption can later be told from a rebuild.
 */
const mark = (n: Node): Node => {
  (n as unknown as { kept?: boolean }).kept = true
  return n
}
const kept = (n: Node): boolean =>
  (n as unknown as { kept?: boolean }).kept === true

type Shout = { readonly text: string }
type Nothing = Record<string, never>

const shout = island (
  'shout',
  (props: Shout) => (H.div ([props.text])),
  import.meta.url,
)

const stranger = island (
  'stranger',
  (_props: Nothing) => (H.div (['stranger'])),
  import.meta.url,
)

const loudly = island (
  'loudly',
  (props: Shout) => H.div ([H.button ([props.text]).use ({ pressed: 'click' })]),
  import.meta.url,
)

const tally = island (
  'tally',
  (_props: Nothing, on: { readonly bumped: S.Stream<Event> }) => {
    const count = S.hold ((n: number) => n + 1, 0) (
      P.map (() => 1) (on.bumped),
    )
    return H.p ([H.button (['+']).use ({ bumped: 'click' }), count])
  },
  import.meta.url,
)

test ('kit/island — the marker carries the name and the props', () => {
  const p = box ()
  const dsp = D.mount (p) (shout ({ text: 'hello' }))
  assert.deepStrictEqual (
    p.innerHTML,
    '<!--kit:shout {"text":"hello"}--><div>hello</div><!--/kit-->',
  )
  S.dispose (dsp)
})

test ('kit/island — what an island\'s markup said, the page does not hear', () => {
  assert.deepStrictEqual (Object.keys (D.outsOf (H.section ([loudly ({ text: '+' })]))), [])
  assert.deepStrictEqual (Object.keys (D.outsOf (H.section ([tally ({})]))), [])

  const bare = H.section ([H.div ([H.button (['+']).use ({ pressed: 'click' })])])
  assert.deepStrictEqual (Object.keys (D.outsOf (bare)), ['pressed'])

  assert.deepStrictEqual ('use' in loudly, false)
  assert.deepStrictEqual (
    'use' in (tally ({}) as unknown as Record<string, unknown>),
    false,
  )
})

test ('kit/island — props survive what a comment ends on', () => {
  const hostile = '--> <!-- </script> & "quotes" \u2028'
  const p = box ()
  const dsp = D.mount (p) (shout ({ text: hostile }))
  const markup = p.innerHTML
  S.dispose (dsp)

  assert.deepStrictEqual (markup.includes ('-->'), markup.indexOf ('-->') > 20)

  const q = box ()
  q.innerHTML = markup
  hydrateIslands (q as unknown as Node)
  assert.ok ((q.innerHTML).includes ('&amp; "quotes"'))
  assert.deepStrictEqual (q.innerHTML, markup)
  resetIslands ()
})

test ('kit/island — an island is recorded on the module it was given', async () => {
  const { make } = await import ('./maker.ts')
  make ('viaHelper', import.meta.url)

  const one = declaredIslands ().find ((it) => it.name === 'viaHelper')
  assert.deepStrictEqual (one?.module, import.meta.url)
})

test ('kit/island — a name may be scoped, the way ply\'s kinds are', () => {
  const vendor = island (
    '@x/counter',
    (_p: Nothing) => (H.div (['stranger'])),
    import.meta.url,
  )
  assert.deepStrictEqual (typeof vendor, 'function')

  const markup = '<main><!--kit:@x/counter {}--><div>x</div><!--/kit--></main>'
  assert.deepStrictEqual (usedIslands (markup), ['@x/counter'])

  assert.throws (
    () =>
      island (
        '@x/two words',
        (_p: Nothing) => (H.div ([])),
        import.meta.url,
      ),
    (error: unknown) => error instanceof Error && error.message.includes ('is not a name an island can have'),
  )
})

test ('kit/island — an empty module does not declare an island', () => {
  assert.throws (
    () => island ('nowhere', (_p: Nothing) => (H.div ([])), ''),
    (error: unknown) => error instanceof Error && error.message.includes ('import.meta.url'),
  )
})

test ('kit/island — the name is checked where it is given', () => {
  assert.throws (
    () => island ('not a name', (_p: Nothing) => (H.div ([])), import.meta.url),
    (error: unknown) => error instanceof Error && error.message.includes ('is not a name an island can have'),
  )
  assert.throws (
    () => island ('shout', (_p: Nothing) => (H.div ([])), import.meta.url),
    (error: unknown) => error instanceof Error && error.message.includes ('two islands named shout'),
  )
})

test ('kit/island — hydrateIslands returns its argument', () => {
  const p = box ()
  p.innerHTML = rendered (shout ({ text: 'hello' }))
  const root = p as unknown as Node
  assert.deepStrictEqual (hydrateIslands (root) === root, true)
  resetIslands ()
})

test ('kit/island/used — names in order and without repeats', () => {
  const markup = '<p><!--kit:counter {"from":1}-->1<!--/kit--></p>' +
    '<!--kit:todos {}-->x<!--/kit-->' +
    '<!--kit:counter {"from":9}-->9<!--/kit-->' +
    '<!--an ordinary comment-->'
  assert.deepStrictEqual (usedIslands (markup), ['counter', 'todos'])
  assert.deepStrictEqual (usedIslands ('<p>no islands at all</p>'), [])
})

const page = (pattern: string, body: () => D.Child): Route =>
  routePage<Record<string, never>> ({
    pattern,
    load: () => F.resolve (data ({})),
    view: () => H.main ([body ()]),
  })

const app = handler ({
  routes: [
    page ('/', () => shout ({ text: 'home' })),
    page ('/plain', () => 'plain text'),
    page ('/unknown', () => stranger ({})),
  ],
  chunks: { shout: '/_kit/shout.js' },
})

const get = async (path: string): Promise<string> =>
  await (await app (new Request (`http://kit.test${path}`))).text ()

test ('kit/island — a page with an island is drawn and asks for its chunk', async () => {
  const html = await get ('/')
  assert.ok ((html).includes ('<div>home</div>'))
  assert.ok ((html).includes ('<!--kit:shout {"text":"home"}-->'))
  assert.ok ((html).includes ('<script type="module" src="/_kit/shout.js"></script>'))
})

test ('kit/island — a page without islands carries neither a script nor a payload', async () => {
  const html = await get ('/plain')
  assert.ok ((html).includes ('plain text'))
  assert.deepStrictEqual (html.includes ('<script type="module"'), false)
  assert.deepStrictEqual (html.includes ('kit-payload'), false)
})

test ('kit/island — an island outside the manifest stays markup', async () => {
  const html = await get ('/unknown')
  assert.ok ((html).includes ('<div>stranger</div>'))
  assert.deepStrictEqual (html.includes ('<script type="module"'), false)
})

test ('kit/server — a page carries only its own styles', async () => {
  const one = css`
    .one {
      color: red;
    }
  `
  const two = css`
    .two {
      color: blue;
    }
  `
  assert.ok ((two.two).includes ('two_'))

  const respond = handler ({
    routes: [
      page ('/one', () => H.p ({ class: one.one }, ['one'])),
      page ('/none', () => 'not one class'),
    ],
  })
  const html = async (path: string): Promise<string> =>
    await (await respond (new Request (`http://kit.test${path}`))).text ()

  const withOne = await html ('/one')
  assert.ok ((withOne).includes ('color: red'))
  assert.deepStrictEqual (withOne.includes ('color: blue'), false)
  assert.deepStrictEqual ((await html ('/none')).includes ('<style'), false)
})

/**
 * The markup a server would have sent: mounted, taken down, handed back as a string.
 */
const rendered = (child: D.Child): string => {
  const p = box ()
  const dsp = D.mount (p) (child)
  const markup = p.innerHTML
  S.dispose (dsp)
  return markup
}

test ('kit/island — hydration adopts the island\'s markup', () => {
  const markup = rendered (shout ({ text: 'hello' }))
  const p = box ()
  p.innerHTML = markup
  const root = mark (
    (p.firstChild as unknown as { nextSibling: Node })
      .nextSibling,
  )

  hydrateIslands (p as unknown as Node)
  assert.deepStrictEqual (kept (root), true, 'the island node should survive')
  assert.deepStrictEqual (p.innerHTML, markup)
  resetIslands ()
})

test ('kit/island — the markup around an island is not touched', () => {
  const p = box ()
  p.innerHTML = `<h1>heading</h1>${
    rendered (shout ({ text: 'x' }))
  }<footer>foot</footer>`
  const before = mark (p.firstChild as unknown as Node)
  const after = mark (
    (p as unknown as { lastChild: Node }).lastChild,
  )

  hydrateIslands (p as unknown as Node)
  assert.deepStrictEqual (kept (before), true)
  assert.deepStrictEqual (kept (after), true)
  resetIslands ()
})

test ('kit/island — a mismatch rebuilds only its own stretch', () => {
  const p = box ()
  p.innerHTML = '<h1>before</h1>' +
    '<!--kit:shout {"text":"hello"}--><span>not that</span><!--/kit-->' +
    '<h1>after</h1>'
  const before = mark (p.firstChild as unknown as Node)
  const after = mark ((p as unknown as { lastChild: Node }).lastChild)

  hydrateIslands (p as unknown as Node)
  assert.ok ((p.innerHTML).includes ('<div>hello</div>'))
  assert.deepStrictEqual (p.innerHTML.includes ('<span>not that</span>'), false)
  assert.deepStrictEqual (kept (before), true)
  assert.deepStrictEqual (kept (after), true)
  resetIslands ()
})

test ('kit/island — a nested island comes alive once', () => {
  let renders = 0
  const inner = island (
    'inner',
    (_props: Nothing) => {
      renders++
      return H.div (['inside'])
    },
    import.meta.url,
  )
  const outer = island (
    'outer',
    (_props: Nothing) => (H.section ([inner ({})])),
    import.meta.url,
  )

  const markup = rendered (outer ({}))
  assert.ok ((markup).includes ('<!--kit:outer {}-->'))
  assert.ok ((markup).includes ('<!--kit:inner {}-->'))
  assert.deepStrictEqual (renders, 1, 'the server drew the inner one once')

  const p = box ()
  p.innerHTML = markup
  hydrateIslands (p as unknown as Node)
  assert.deepStrictEqual (renders, 2, 'the outer rebuilt the inner, and nobody else')
  assert.deepStrictEqual (p.innerHTML, markup)
  assert.deepStrictEqual (usedIslands (p.innerHTML), ['outer', 'inner'])
  resetIslands ()
})

test ('kit/island — hydrating again does not bring it alive twice', () => {
  let builds = 0
  const twice = island (
    'twice',
    (_props: Nothing) => {
      builds++
      return H.div (['one'])
    },
    import.meta.url,
  )

  const p = box ()
  p.innerHTML = rendered (twice ({}))
  assert.deepStrictEqual (builds, 1, 'the server drew it once')

  hydrateIslands (p as unknown as Node)
  assert.deepStrictEqual (builds, 2)
  hydrateIslands (p as unknown as Node)
  assert.deepStrictEqual (builds, 2, 'the second pass no longer takes the marker')
  resetIslands ()
})

test ('kit/island — a chunk that arrives later brings its island alive', () => {
  let builds = 0

  const p = box ()
  const before = '<!--kit:late {}--><div>late</div><!--/kit-->'
  p.innerHTML = before

  hydrateIslands (p as unknown as Node)
  assert.deepStrictEqual ([builds, p.innerHTML], [0, before])

  island (
    'late',
    (_props: Nothing) => {
      builds++
      return H.div (['late'])
    },
    import.meta.url,
  )
  hydrateIslands (p as unknown as Node)
  assert.deepStrictEqual ([builds, p.innerHTML], [1, before])
  resetIslands ()
})

test ('kit/island — an unknown island is left as it is', () => {
  const markup = rendered (shout ({ text: 'hello' }))
  const p = box ()
  p.innerHTML = markup
  hydrateIslands (p as unknown as Node)
  assert.deepStrictEqual (p.innerHTML, markup)
})

test ('kit/island — damaged props leave the markup alone', () => {
  const p = box ()
  p.innerHTML = '<!--kit:shout {this is not json}--><div>hello</div><!--/kit-->'
  const before = p.innerHTML
  hydrateIslands (p as unknown as Node)
  assert.deepStrictEqual (p.innerHTML, before)
})

test ('kit/island — a fallen island does not take its neighbours with it', () => {
  let ahead = 0
  let behind = 0

  island ('brittle', (props: Shout) => H.div ([props.text.trim ()]), import.meta.url)
  island ('ahead', (_props: Nothing) => {
    ahead++
    return H.div (['before'])
  }, import.meta.url)
  island ('behind', (_props: Nothing) => {
    behind++
    return H.div (['after'])
  }, import.meta.url)

  const broken =
    '<!--kit:brittle {"label":"old"}--><div>old</div><!--/kit-->'
  const p = box ()
  p.innerHTML = '<!--kit:ahead {}--><div>before</div><!--/kit-->' +
    broken +
    '<!--kit:behind {}--><div>after</div><!--/kit-->'

  const said: unknown[][] = []
  const wasSaid = console.error
  console.error = (...args: unknown[]) => void said.push (args)
  try {
    hydrateIslands (p as unknown as Node)
    hydrateIslands (p as unknown as Node)
  } finally {
    console.error = wasSaid
  }

  assert.deepStrictEqual ([ahead, behind], [1, 1], 'the neighbours on both sides came alive once each')
  assert.deepStrictEqual (said.length, 1, 'the fall was said out loud, and exactly once')
  assert.ok ((String (said[0][0])).includes ('brittle'))
  assert.ok ((p.innerHTML).includes (broken))

  resetIslandsIn (p as unknown as Node)
  assert.ok ((p.innerHTML).includes (broken))
  resetIslands ()
})

test ('kit/island — quenching takes the island down and leaves the markers', () => {
  const p = box ()
  p.innerHTML = rendered (shout ({ text: 'hello' }))
  hydrateIslands (p as unknown as Node)
  resetIslands ()
  assert.deepStrictEqual (p.innerHTML.includes ('<div>'), false)
  assert.ok ((p.innerHTML).includes ('<!--kit:shout'))
})

test ('dom/comment — a comment is built and adopted', () => {
  const built = rendered (D.el ('p', {}, [D.comment ('mark'), 'body']))
  assert.deepStrictEqual (built, '<p><!--mark-->body</p>')

  const p = box ()
  p.innerHTML = built
  const before = mark (p.firstChild as unknown as Node)
  const dsp = D.hydrate (p as unknown as Node) (() =>
    D.el ('p', {}, [D.comment ('mark'), 'body']),
  )
  assert.deepStrictEqual (kept (before), true)
  assert.deepStrictEqual (p.innerHTML, built)
  S.dispose (dsp)
})

test ('dom/hydrateIn — the stretch between the markers, and only that', () => {
  const p = box ()
  p.innerHTML = '<i>on the left</i><!--o--><em>body</em><!--c--><i>on the right</i>'
  const nodes = Array.from (
    (p as unknown as { childNodes: Node[] }).childNodes,
  )
  const [left, open, body, close, right] = nodes
  mark (left)
  mark (body)
  mark (right)

  const dsp = D.hydrateIn ({
    parent: p as unknown as Node,
    open: open as unknown as ChildNode,
    close: close as unknown as ChildNode,
  }) (() => D.el ('em', {}, ['body']))

  assert.deepStrictEqual (kept (body), true, 'the region\'s body was adopted')
  assert.deepStrictEqual (kept (left), true)
  assert.deepStrictEqual (kept (right), true)
  assert.deepStrictEqual (
    p.innerHTML,
    '<i>on the left</i><!--o--><em>body</em><!--c--><i>on the right</i>',
  )
  S.dispose (dsp)
})

test ('kit/build/discover — islands are taken from the ones declared, not from a directory', async () => {
  await import ('./fixture/islands/mark.ts')
  await import ('./fixture/islands/reading.ts')

  const has = (manifest: Record<string, string>) => (name: string) => [
    name,
    manifest[name],
  ]

  const own = await discover ({})
  assert.deepStrictEqual (P.map (has (own)) (['mark', 'reading']), [
    ['mark', '/_kit/mark.js'],
    ['reading', '/_kit/reading.js'],
  ])

  const based = await discover ({ base: '/assets/' })
  assert.deepStrictEqual (P.map (has (based)) (['mark', 'reading']), [
    ['mark', '/assets/mark.js'],
    ['reading', '/assets/reading.js'],
  ])

  const withKit = await discover ({ include: ['navigation', 'live'] })
  assert.deepStrictEqual (P.map (has (withKit)) (['navigation', 'live']), [
    ['navigation', '/_kit/navigation.js'],
    ['live', '/_kit/live.js'],
  ])

  assert.deepStrictEqual (Object.hasOwn (withKit, 'reload'), false)
  assert.deepStrictEqual (Object.hasOwn (own, 'navigation'), false)
})
