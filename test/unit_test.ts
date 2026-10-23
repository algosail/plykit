import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  Arrival,
  Context,
  Hazard,
  Loaded,
  Outcome,
  PageRoute,
  Reply,
  Route,
  ServerNode,
  Table,
} from '../src/mod.ts'
import {
  fields,
  fieldsAll,
  jsonField,
  jsonText,
  query,
  queryAll,
} from '../src/app/request.ts'
import {
  after,
  aim,
  answer,
  around,
  before,
  COMMENT,
  cors,
  csp,
  data,
  ELEMENT,
  endpoint,
  etag,
  failed,
  HttpError,
  instead,
  into,
  island,
  json,
  layout,
  localPath,
  page,
  part,
  redirect,
  renderDocument,
  renderToString,
  resolveRoute,
  ROOT_ID,
  routeTable,
  serializeChildren,
  serverBackend,
  serverRoot,
  TEXT,
  trailingSlash,
  watch,
  whenRequest,
} from '../src/mod.ts'

const asNode = (e: Element | Text | Comment): ServerNode =>
  e as unknown as ServerNode
const anElement = (tag: string) => asNode (serverBackend.element (tag))
const aText = (data: string) => asNode (serverBackend.text (data))
const aComment = (data: string) => asNode (serverBackend.comment (data))

test ('kit/node — constructors and the kinds of node', () => {
  const e = anElement ('div')
  const t = aText ('hi')
  const c = aComment ('[')
  assert.deepStrictEqual ([e.nodeType, t.nodeType, c.nodeType], [
    ELEMENT,
    TEXT,
    COMMENT,
  ])
  assert.deepStrictEqual ([e.nodeName, t.nodeName, c.nodeName], [
    'DIV',
    '#text',
    '#comment',
  ])
  assert.deepStrictEqual ([e.localName, t.data, c.data], ['div', 'hi', '['])
  assert.deepStrictEqual (
    asNode (serverBackend.elementNS ('http://www.w3.org/2000/svg', 'svg'))
      .namespaceURI,
    'http://www.w3.org/2000/svg',
  )
})

test ('kit/node — insertion, order, and neighbours', () => {
  const p = anElement ('ul')
  const a = anElement ('li')
  const b = anElement ('li')
  p.insertBefore (b, null)
  p.insertBefore (a, b)
  assert.deepStrictEqual (p.childNodes.length, 2)
  assert.deepStrictEqual (p.firstChild === a, true)
  assert.deepStrictEqual (a.nextSibling === b, true)
  assert.deepStrictEqual (b.nextSibling, null)
  assert.deepStrictEqual (a.parentNode === p, true)
})

test ('kit/node — insertion detaches a node from its previous parent', () => {
  const one = anElement ('div')
  const two = anElement ('div')
  const kid = anElement ('span')
  one.insertBefore (kid, null)
  two.insertBefore (kid, null)
  assert.deepStrictEqual (one.childNodes.length, 0)
  assert.deepStrictEqual ([two.childNodes.length, kid.parentNode === two], [1, true])
})

const watchingChildren = (node: ServerNode): () => number => {
  let reads = 0
  const seen = new Proxy (node.childNodes, {
    get(target, key, self) {
      if (typeof key === 'string' && /^\d+$/.test (key)) reads++
      return Reflect.get (target, key, self)
    },
  })
  Object.defineProperty (node, 'childNodes', { value: seen })
  return () => reads
}

test ('kit/node — insertion before the tail anchor does not walk the list', () => {
  const ul = anElement ('ul')
  const close = aComment (']')
  ul.insertBefore (close, null)
  const reads = watchingChildren (ul)
  const n = 200
  for (let i = 0; i < n; i++) ul.insertBefore (anElement ('li'), close)

  assert.deepStrictEqual (ul.childNodes.length, n + 1)
  assert.deepStrictEqual (ul.childNodes[n] === close, true)
  assert.deepStrictEqual (
    reads () < 10 * n,
    true,
    `child reads ${reads ()} for ${n} inserts`,
  )
})

test ('kit/node — removeChild and contains', () => {
  const p = anElement ('div')
  const kid = anElement ('span')
  const deep = anElement ('b')
  p.insertBefore (kid, null)
  kid.insertBefore (deep, null)
  assert.deepStrictEqual ([p.contains (kid), p.contains (deep), kid.contains (p)], [
    true,
    true,
    false,
  ])
  p.removeChild (kid)
  assert.deepStrictEqual ([p.contains (kid), kid.parentNode], [false, null])
  assert.throws (
    () => p.removeChild (kid),
    (error: unknown) => error instanceof Error && error.message.includes ('not a child'),
  )
})

test ('kit/node — textContent reads the tree and replaces it', () => {
  const p = anElement ('p')
  p.insertBefore (aText ('a'), null)
  p.insertBefore (aText ('b'), null)
  assert.deepStrictEqual (p.textContent, 'ab')
  p.textContent = 'replaced'
  assert.deepStrictEqual ([p.childNodes.length, p.textContent], [1, 'replaced'])
  p.textContent = ''
  assert.deepStrictEqual (p.childNodes.length, 0)
})

test ('kit/node — attributes, and splitText is not for the server', () => {
  const e = anElement ('a')
  e.setAttribute ('href', '/x')
  assert.deepStrictEqual (e.attributes.get ('href'), '/x')
  e.removeAttribute ('href')
  assert.deepStrictEqual (e.attributes.has ('href'), false)
  assert.throws (
    () => aText ('x').splitText (),
    (error: unknown) => error instanceof Error && error.message.includes ('never hydrates'),
  )
})

test ('kit/node/root — a container whose tag does not land in the output', () => {
  assert.deepStrictEqual (serverRoot ().localName, 'kit-root')
  assert.deepStrictEqual (serverRoot ().childNodes.length, 0)
})

test ('kit/html — a node of each kind, and empty elements', () => {
  const host = serverRoot ()
  host.insertBefore (aText ('a & b'), null)
  host.insertBefore (aComment ('['), null)
  const img = anElement ('img')
  img.setAttribute ('src', 'a.png')
  host.insertBefore (img, null)
  assert.deepStrictEqual (serializeChildren (host), 'a &amp; b<!--[--><img src="a.png">')
})

test ('kit/html — a comment is not closed by its own data', () => {
  const host = serverRoot ()
  host.insertBefore (aComment ('note --> <img src=x onerror=alert(1)>'), null)
  assert.deepStrictEqual (
    serializeChildren (host),
    '<!--note --&gt; <img src=x onerror=alert(1)&gt;-->',
  )
})

test ('kit/html — a name that is not a name is not printed', () => {
  const host = serverRoot ()
  const e = anElement ('div')
  e.setAttribute ('x" onload="alert(1)', 'v')
  e.setAttribute ('data-ok', '1')
  host.insertBefore (e, null)
  assert.deepStrictEqual (serializeChildren (host), '<div data-ok="1"></div>')

  const wild = serverRoot ()
  const bad = anElement ('div><script>alert(1)</script')
  bad.insertBefore (aText ('inside'), null)
  wild.insertBefore (bad, null)
  assert.deepStrictEqual (serializeChildren (wild), '')

  const ok = serverRoot ()
  const use = anElement ('x-use')
  use.setAttribute ('xlink:href', '#a')
  ok.insertBefore (use, null)
  assert.deepStrictEqual (serializeChildren (ok), '<x-use xlink:href="#a"></x-use>')
})

class WatchedAttributes extends Map<string, string> {
  asked = 0
  override [Symbol.iterator](): MapIterator<[string, string]> {
    this.asked += 1
    return super[Symbol.iterator] ()
  }
}

const watchingTag = (node: ServerNode): WatchedAttributes => {
  const seen = new WatchedAttributes (node.attributes)
  Object.defineProperty (node, 'attributes', { value: seen })
  return seen
}

test ('kit/html — the opening tag is built once, and only for an element', () => {
  const host = serverRoot ()
  const div = anElement ('div')
  div.setAttribute ('id', 'a')
  const said = aText ('hello')
  const note = aComment ('[')
  host.insertBefore (div, null)
  host.insertBefore (said, null)
  host.insertBefore (note, null)
  const onDiv = watchingTag (div)
  const onText = watchingTag (said)
  const onNote = watchingTag (note)

  assert.deepStrictEqual (serializeChildren (host), '<div id="a"></div>hello<!--[-->')
  assert.deepStrictEqual ([onDiv.asked, onText.asked, onNote.asked], [1, 0, 0])
})

test ('kit/html — an empty element does not walk its children, and a nameless one walks nothing', () => {
  const host = serverRoot ()
  const br = anElement ('br')
  const inside = aText ('inside')
  br.insertBefore (inside, null)
  host.insertBefore (br, null)
  const onInside = watchingTag (inside)

  const bad = anElement ('div><script>alert(1)</script')
  const hidden = aText ('also inside')
  bad.insertBefore (hidden, null)
  host.insertBefore (bad, null)
  const onHidden = watchingTag (hidden)

  assert.deepStrictEqual (serializeChildren (host), '<br>')
  assert.deepStrictEqual ([onInside.asked, onHidden.asked], [0, 0])
})

const home: PageRoute = page<{ readonly n: number }> ({
  pattern: '/',
  load: () => F.resolve (data ({ n: 1 })),
  head: () => ({ title: P.just ('home'), meta: [] }),
  view: (ctx) => H.h1 ([`n=${ctx.data.n}`]),
})

const boom: PageRoute = page<Record<string, never>> ({
  pattern: '/boom',
  load: () => {
    throw new HttpError (418, 'teapot')
  },
  view: () => H.p (['—']),
})

const oops: PageRoute = page<Record<string, never>> ({
  pattern: '/oops',
  load: () => {
    throw new TypeError ('chance')
  },
  view: () => H.p (['—']),
})

const table = routeTable ([home, boom, oops])
const at = (p: string) => new URL (`http://kit.test${p}`)
const asking = (p: string, init?: RequestInit) => new Request (at (p), init)

const resolving = (t: Table) => (p: string, init?: RequestInit) => {
  const aimed = aim (t) (undefined) (asking (p, init))
  return F.promise (resolveRoute (aimed.route) (aimed.ctx))
}

const answerOf = (out: Outcome): Reply => {
  if (out.tag !== 'replied') throw new Error ('expected a reply, not a page')
  return out.reply
}

const statusOf = (reply: Reply): number =>
  reply.tag === 'failure' ? reply.error.status : reply.status

const complaintOf = (reply: Reply): string =>
  reply.tag === 'failure' ? reply.error.message : ''

test ('kit/resolve — a load that succeeds', async () => {
  const out = await resolving (table) ('/')
  assert.deepStrictEqual (out.tag, 'resolved')
  if (out.tag !== 'resolved') return
  assert.deepStrictEqual (out.resolved.data, { n: 1 })
  assert.deepStrictEqual (out.resolved.status, 200)
  assert.deepStrictEqual (out.resolved.ctx.routeId, '/')
})

test ('kit/resolve — aim finds the captures and the route, without starting anything', () => {
  const aimed = aim (table) (undefined) (asking ('/'))
  assert.deepStrictEqual (aimed.ctx.routeId, '/')
  assert.deepStrictEqual (aimed.ctx.params, {})
  assert.deepStrictEqual (P.isJust (aimed.route), true)

  const nowhere = aim (table) (undefined) (asking ('/nope'))
  assert.deepStrictEqual ([nowhere.ctx.routeId, nowhere.ctx.url.pathname], ['', '/nope'])
  assert.deepStrictEqual (nowhere.route, P.nothing ())
})

test ('kit/resolve — a path that was not found is a 404', async () => {
  const reply = answerOf (await resolving (table) ('/nope'))
  assert.deepStrictEqual (statusOf (reply), 404)
})

test ('kit/resolve — a thrown HttpError keeps its status', async () => {
  const reply = answerOf (await resolving (table) ('/boom'))
  assert.deepStrictEqual ([statusOf (reply), complaintOf (reply)], [418, 'teapot'])
})

test ('kit/resolve — an unexpected exception becomes a 500', async () => {
  const reply = answerOf (await resolving (table) ('/oops'))
  assert.deepStrictEqual ([statusOf (reply), complaintOf (reply)], [500, 'chance'])
})

test ('kit/resolve — a redirect from load arrives as a redirect', async () => {
  const away: PageRoute = page<Record<string, never>> ({
    pattern: '/away',
    load: () => F.resolve (redirect ('/there', 302)),
    view: () => H.p (['—']),
  })
  assert.deepStrictEqual (answerOf (await resolving (routeTable ([away])) ('/away')), {
    tag: 'redirect',
    status: 302,
    location: '/there',
    headers: {},
    cookies: [],
  })
})

test ('kit/resolve — a refusal from load carries its own status', async () => {
  const denied: PageRoute = page<Record<string, never>> ({
    pattern: '/denied',
    load: (): F.Future<unknown, Loaded<Record<string, never>>> =>
      F.resolve (failed (403) ('not allowed')),
    view: () => H.p (['—']),
  })
  const reply = answerOf (await resolving (routeTable ([denied])) ('/denied'))
  assert.deepStrictEqual ([statusOf (reply), complaintOf (reply)], [403, 'not allowed'])
})

const asPage = (route: Route): PageRoute => {
  if (route.tag !== 'page') throw new Error ('this is not a page')
  return route
}

const drawn = (route: Route): string =>
  renderToString ({
    route: asPage (route),
    ctx: {
      url: at ('/x'),
      params: {},
      request: asking ('/x'),
      routeId: '/x',
      state: undefined,
      env: undefined,
      live: { send() {} },
      client: P.nothing<string> (),
    },
    data: {},
    layoutData: [],
    status: 200,
  }).body

test ('kit/router/layout — a layout around a list, and nesting as nesting', () => {
  const shell = layout ({ view: (ctx) => H.div ({ class: 'shell' }, [ctx.slot]) })
  const chrome = layout ({
    view: (ctx) => H.section ({ class: 'chrome' }, [ctx.slot]),
  })
  const plain: PageRoute = page<Record<string, never>> ({
    pattern: '/x',
    load: () => F.resolve (data ({})),
    view: () => H.p (['x']),
  })

  const [outer, inner] = shell ([plain, ...chrome ([plain])])

  assert.ok ((drawn (outer)).includes ('<div class="shell"><p>x'))
  assert.ok ((drawn (inner)).includes ('<div class="shell"><section class="chrome"><p>x'))

  assert.ok ((drawn (plain)).includes ('<p>x'))
  assert.deepStrictEqual (drawn (plain).includes ('shell'), false)
})

test ('kit/shell/document — the head of the page is escaped', () => {
  const plain = renderDocument ({
    head: { title: P.nothing (), meta: [] },
    body: '',
    styles: '',
    lang: 'ru',
    scripts: [],
  })
  assert.deepStrictEqual (plain.includes ('<title>'), false)

  const full = renderDocument ({
    head: { title: P.just ('a & b'), meta: [{ name: 'x', content: '"y"' }] },
    body: '',
    styles: '',
    lang: 'ru',
    scripts: [],
  })
  assert.ok ((full).includes ('<title>a &amp; b</title>'))
  assert.ok ((full).includes ('<meta name="x" content="&quot;y&quot;">'))
})

test ('kit/shell/document — an attribute name in the head is checked too', () => {
  const doc = renderDocument ({
    head: {
      title: P.nothing (),
      meta: [],
      link: [{ 'x"><script>alert(1)</script><link rel': 'stylesheet' }],
    },
    body: '',
    styles: '',
    lang: 'ru',
    scripts: [],
  })
  assert.deepStrictEqual (doc.includes ('<script>'), false)
  assert.ok ((doc).includes ('<head><meta charset'))
  assert.ok ((doc).includes ('<link>'))
})

test ('kit/shell/document — link, and it stands before the styles', () => {
  const page = renderDocument ({
    head: {
      title: P.just ('Home'),
      meta: [{ name: 'x', content: 'y' }],
      link: [
        { rel: 'icon', href: '/static/logo.svg' },
        { rel: 'preload', href: '/f.woff2', as: 'font', crossorigin: '' },
      ],
    },
    body: '',
    styles: '<style>a{}</style>',
    lang: 'ru',
    scripts: [],
  })
  assert.ok ((page).includes ('<link rel="icon" href="/static/logo.svg">'))
  assert.ok ((page).includes ('<link rel="preload" href="/f.woff2" as="font" crossorigin="">'))
  assert.deepStrictEqual (page.indexOf ('<link') < page.indexOf ('<style'), true)
  assert.deepStrictEqual (page.indexOf ('<link') < page.indexOf ('<meta name="x"'), true)

  const bare = renderDocument ({
    head: { title: P.nothing (), meta: [] },
    body: '',
    styles: '',
    lang: 'ru',
    scripts: [],
  })
  assert.deepStrictEqual (bare.includes ('<link'), false)
})

test ('kit/shell/document — the root and the list of scripts', () => {
  const base = {
    head: { title: P.just ('T'), meta: [] },
    body: '<h1>hi</h1>',
    styles: '',
    lang: 'ru',
  }
  const plain = renderDocument ({
    ...base,
    scripts: [],
  })
  assert.ok ((plain).includes ('<!doctype html><html lang="ru">'))
  assert.ok ((plain).includes (`<div id="${ROOT_ID}"><h1>hi</h1></div>`))
  assert.deepStrictEqual (plain.includes ('type="module"'), false)

  const withScripts = renderDocument ({
    ...base,
    scripts: ['/_kit/counter.js', '/c.js'],
  })
  assert.ok ((withScripts).includes ('<script type="module" src="/_kit/counter.js"></script>' +
      '<script type="module" src="/c.js"></script>'))
})

const outer = layout ({ view: (ctx) => H.div ({ class: 'outer' }, [ctx.slot]) })

test ('kit/server/renderToString — markup, status, and hazards', () => {
  const out = renderToString ({
    route: asPage (outer ([home])[0]),
    ctx: {
      url: at ('/'),
      params: {},
      request: asking ('/'),
      routeId: '/',
      state: undefined,
      env: undefined,
      live: { send() {} },
      client: P.nothing<string> (),
    },
    data: { n: 5 },
    layoutData: [],
    status: 200,
  })
  assert.ok ((out.body).includes ('<div class="outer">'))
  assert.ok ((out.body).includes ('n=5'))
  assert.deepStrictEqual ([out.status, out.hazards.length], [200, 0])
})

test ('kit/route — localPath lets through only a path on this site', () => {
  assert.deepStrictEqual (localPath ('/blog'), P.just ('/blog'))
  assert.deepStrictEqual (localPath ('/'), P.just ('/'))
  assert.deepStrictEqual (localPath ('/a?b=1#c'), P.just ('/a?b=1#c'))
  assert.deepStrictEqual (localPath ('//evil.test'), P.nothing ())
  assert.deepStrictEqual (localPath ('https://evil.test'), P.nothing ())
  assert.deepStrictEqual (localPath ('/\\evil.test'), P.nothing ())
  assert.deepStrictEqual (localPath ('blog'), P.nothing ())
  assert.deepStrictEqual (localPath (''), P.nothing ())
})

test ('kit/request — a field of a json body is read by asking, not by casting', () => {
  assert.deepStrictEqual (jsonField ('text') ({ text: 'hello' }), P.just ('hello'))
  assert.deepStrictEqual (jsonText ('hello'), P.just ('hello'))
  assert.deepStrictEqual (jsonField ('text') ([1, 2]), P.nothing ())
  assert.deepStrictEqual (jsonField ('text') (null), P.nothing ())
  assert.deepStrictEqual (jsonField ('text') ('string'), P.nothing ())
  assert.deepStrictEqual (jsonField ('missing') ({ text: 'hello' }), P.nothing ())
  assert.deepStrictEqual (jsonText (7), P.nothing ())
  assert.deepStrictEqual (jsonText ({ a: 1 }), P.nothing ())
})

test ('kit/request — a repeated name arrives whole', async () => {
  const form = new FormData ()
  form.append ('tag', 'fp')
  form.append ('tag', 'deno')
  form.append ('tag', 'ply')
  form.append ('text', 'wrote')
  const posting = () =>
    new Request ('http://kit.test/', { method: 'POST', body: form })

  assert.deepStrictEqual (await F.promise (fields (posting ())), {
    tag: 'ply',
    text: 'wrote',
  })
  assert.deepStrictEqual (await F.promise (fieldsAll (posting ())), {
    tag: ['fp', 'deno', 'ply'],
    text: ['wrote'],
  })

  const url = new URL ('http://kit.test/blog?tag=fp&tag=deno&page=2')
  assert.deepStrictEqual (query (url), { tag: 'deno', page: '2' })
  assert.deepStrictEqual (queryAll (url), { tag: ['fp', 'deno'], page: ['2'] })
  assert.deepStrictEqual (queryAll (new URL ('http://kit.test/blog')), {})
})

test ('kit/middleware — cors answers the preflight and dresses the replies', async () => {
  const open = answer ({
    routes: [
      endpoint ({
        pattern: '/api/x',
        on: { GET: () => F.resolve (json ({ n: 1 })) },
      }),
    ],
    through: [cors ({ methods: ['GET', 'POST'], maxAge: 600 })],
  })

  const asked = await F.promise (
    open (new Request ('http://kit.test/api/x', { method: 'OPTIONS' })),
  )
  assert.deepStrictEqual (statusOf (asked), 204)
  const headers = asked.tag === 'sent' ? asked.headers : {}
  assert.deepStrictEqual (headers['access-control-allow-origin'], '*')
  assert.deepStrictEqual (headers['access-control-allow-methods'], 'GET, POST, OPTIONS')
  assert.deepStrictEqual (headers['access-control-max-age'], '600')

  const got = await F.promise (open (new Request ('http://kit.test/api/x')))
  assert.deepStrictEqual (statusOf (got), 200)
  assert.deepStrictEqual (
    got.tag === 'sent' ? got.headers['access-control-allow-origin'] : '',
    '*',
  )
  assert.deepStrictEqual (got.tag === 'sent' ? got.body : '', '{"n":1}')
})

test ('kit/middleware — cors with one origin marks vary', async () => {
  const one = answer ({
    routes: [
      endpoint ({ pattern: '/api/x', on: { GET: () => F.resolve (json ({})) } }),
    ],
    through: [cors ({ origin: 'https://friend.test', credentials: true })],
  })
  const got = await F.promise (one (new Request ('http://kit.test/api/x')))
  const headers = got.tag === 'sent' ? got.headers : {}
  assert.deepStrictEqual (headers['access-control-allow-origin'], 'https://friend.test')
  assert.deepStrictEqual (headers['access-control-allow-credentials'], 'true')
  assert.ok ((String (headers['vary'])).includes ('origin'))
})

test ('kit/server — an island without a chunk, and an action to nowhere, is heard', async () => {
  const ghost = island (
    'ghost',
    (_p: Record<string, never>) => (H.p (['here'])),
    import.meta.url,
  )

  const said: Hazard[] = []
  const home = page ({
    pattern: '/',
    head: () => ({ title: P.just ('Home') }),
    view: () =>
      H.main ([
        ghost ({}),
        H.section ({ ...part ('list') }, [
          H.form ({ ...into ('lst'), method: 'post' }, [
            H.input ({ name: 'x' }),
          ]),
        ]),
      ]),
  })

  await F.promise (
    answer ({ routes: [home], chunks: {}, onHazard: (h) => said.push (...h) }) (
      new Request ('http://kit.test/'),
    ),
  )
  const problems = said.map ((h: Hazard) => h.problem).join ('\n')
  assert.ok ((problems).includes ('placed but not built'))
  assert.ok ((problems).includes ('no `navigation` island'))
  assert.ok ((problems).includes ('nothing on this page is named that'))
})

test ('kit/server — a built island and a true aim are met with silence', async () => {
  const seen = island (
    'seen',
    (_p: Record<string, never>) => (H.p (['here'])),
    import.meta.url,
  )
  const { navigation } = await import ('../src/islands/navigate.ts')

  const said: Hazard[] = []
  const home = page ({
    pattern: '/',
    head: () => ({ title: P.just ('Home') }),
    view: () =>
      H.main ([
        seen ({}),
        navigation ({}),
        H.section ({ ...part ('list') }, [
          H.form ({ ...into ('list'), method: 'post' }, [
            H.input ({ name: 'x' }),
          ]),
        ]),
      ]),
  })

  await F.promise (
    answer ({
      routes: [home],
      chunks: { seen: '/_kit/seen.js', navigation: '/_kit/navigation.js' },
      onHazard: (h) => said.push (...h),
    }) (new Request ('http://kit.test/')),
  )
  assert.deepStrictEqual (said, [])
})

test ('kit/middleware — etag itself says the reply depended on a cookie', async () => {
  const home = page ({
    pattern: '/',
    head: () => ({ title: P.just ('Home') }),
    view: () => H.h1 (['Home']),
  })
  const replying = answer ({ routes: [home], through: [etag ()] })
  const varyOf = (r: Reply) =>
    r.tag === 'sent' ? String (r.headers['vary'] ?? '') : ''

  const carried = await F.promise (
    replying (new Request ('http://kit.test/', { headers: { cookie: 'a=1' } })),
  )
  assert.ok ((varyOf (carried)).includes ('cookie'))
  const bare = await F.promise (replying (new Request ('http://kit.test/')))
  assert.deepStrictEqual (varyOf (bare).includes ('cookie'), false)
  assert.ok ((varyOf (bare)).includes ('kit-part'))
})

test ('kit/middleware — csp says what the page may load', async () => {
  const home = page ({
    pattern: '/',
    head: () => ({ title: P.just ('Home') }),
    view: () => H.h1 (['Home']),
  })
  const plain = await F.promise (
    answer ({ routes: [home], through: [csp ()] }) (
      new Request ('http://kit.test/'),
    ),
  )
  const policy = plain.tag === 'sent'
    ? String (plain.headers['content-security-policy'])
    : ''
  assert.ok ((policy).includes ("default-src 'self'"))
  assert.ok ((policy).includes ("frame-ancestors 'none'"))

  const own = await F.promise (
    answer ({
      routes: [home],
      through: [
        csp ({ directives: { 'img-src': "'self' data:" }, reportOnly: true }),
      ],
    }) (new Request ('http://kit.test/')),
  )
  const headers = own.tag === 'sent' ? own.headers : {}
  assert.deepStrictEqual (headers['content-security-policy'], undefined)
  assert.ok ((String (headers['content-security-policy-report-only'])).includes ("img-src 'self' data:"))
})

test ('kit/middleware — a path has one spelling', async () => {
  const home = page ({
    pattern: '/blog',
    head: () => ({ title: P.just ('Blog') }),
    view: () => H.h1 (['Blog']),
  })
  const strict = answer ({ routes: [home], through: [trailingSlash ()] })

  const extra = await F.promise (
    strict (new Request ('http://kit.test/blog/?a=1')),
  )
  assert.deepStrictEqual (statusOf (extra), 308)
  assert.deepStrictEqual (extra.tag === 'redirect' ? extra.location : '', '/blog?a=1')

  assert.deepStrictEqual (
    statusOf (await F.promise (strict (new Request ('http://kit.test/blog')))),
    200,
  )
  const root = answer ({ routes: [], through: [trailingSlash ()] })
  assert.deepStrictEqual (
    statusOf (await F.promise (root (new Request ('http://kit.test/')))),
    404,
  )

  const loose = answer ({
    routes: [home],
    through: [trailingSlash ({ trailing: true })],
  })
  const bare = await F.promise (loose (new Request ('http://kit.test/blog')))
  assert.deepStrictEqual (bare.tag === 'redirect' ? bare.location : '', '/blog/')
})

test ('kit/partial — aim says where to put the reply', () => {
  assert.deepStrictEqual (into ('feed'), { 'data-kit-into': 'feed' })
  assert.deepStrictEqual (into ('feed', 'replace'), { 'data-kit-into': 'feed' })
  assert.deepStrictEqual (into ('feed', 'append'), {
    'data-kit-into': 'feed',
    'data-kit-mode': 'append',
  })
  assert.deepStrictEqual (into ('feed', 'prepend')['data-kit-mode'], 'prepend')
})

test ('kit/middleware — instead answers in place of the route', async () => {
  const secret = page ({
    pattern: '/secret',
    head: () => ({ title: P.just ('Secret') }),
    view: () => H.h1 (['Secret']),
  })
  const ours = (ctx: Context<unknown>): boolean =>
    P.fromMaybe (false) (
      P.map ((ip: string) => P.elem (ip) (['10.0.0.1'])) (ctx.client),
    )
  const guarded = (from?: Arrival) =>
    F.promise (
      answer ({
        routes: [secret],
        through: [
          whenRequest (P.predicateNot (P.predicate (ours))) (
            instead (() => failed (403) ('not from here')),
          ),
        ],
      }) (new Request ('http://kit.test/secret'), from),
    )

  assert.deepStrictEqual (statusOf (await guarded ()), 403)
  assert.deepStrictEqual (
    statusOf (await guarded ({ remoteAddr: { hostname: '192.168.0.7' } })),
    403,
  )
  assert.deepStrictEqual (
    statusOf (await guarded ({ remoteAddr: { hostname: '10.0.0.1' } })),
    200,
  )
})

test ('kit/server — the connection address reaches the route', async () => {
  const seen: string[] = []
  const who = endpoint ({
    pattern: '/who',
    on: {
      GET: (ctx) => {
        seen.push (P.fromMaybe ('—') (ctx.client))
        return F.resolve (json ({}))
      },
    },
  })
  const ask = answer ({ routes: [who] })
  await F.promise (ask (new Request ('http://kit.test/who')))
  await F.promise (
    ask (new Request ('http://kit.test/who'), {
      remoteAddr: { hostname: '203.0.113.9' },
    }),
  )
  assert.deepStrictEqual (seen, ['—', '203.0.113.9'])
})

test ('kit/server — always puts a script on the document, but not in a region', async () => {
  const shown = page ({
    pattern: '/',
    head: () => ({ title: P.just ('Home') }),
    view: () => H.section ({ ...part ('feed') }, [H.p (['line'])]),
  })
  const ask = answer ({ routes: [shown], always: ['/_kit/reload.js'] })

  const whole = await F.promise (ask (new Request ('http://kit.test/')))
  assert.ok ((whole.tag === 'sent' ? String (whole.body) : '').includes ('<script type="module" src="/_kit/reload.js"></script>'))

  const region = await F.promise (
    ask (
      new Request ('http://kit.test/', { headers: { 'kit-part': 'feed' } }),
    ),
  )
  const markup = region.tag === 'sent' ? String (region.body) : ''
  assert.ok ((markup).includes ('data-kit-part="feed"'))
  assert.deepStrictEqual (markup.includes ('reload.js'), false)
})

test ('kit/server — a region is not told what is true only of the page', async () => {
  const said: string[][] = []
  const notes = page ({
    pattern: '/',
    head: () => ({ title: P.just ('Notes') }),
    view: () =>
      H.section ({ ...part ('notes') }, [
        H.form ({ ...into ('notes'), method: 'post' }, [
          H.input ({ name: 'title' }),
        ]),
      ]),
  })
  const ask = answer ({
    routes: [notes],
    onHazard: (hazards) => said.push (hazards.map ((h) => h.path)),
  })

  await F.promise (ask (new Request ('http://kit.test/')))
  assert.deepStrictEqual (said, [['[data-kit-into]']])

  await F.promise (
    ask (new Request ('http://kit.test/', { headers: { 'kit-part': 'notes' } })),
  )
  assert.deepStrictEqual (said.length, 1)
})

test ('kit/middleware — the order is the same as in the list', async () => {
  const said: string[] = []
  const home = page ({
    pattern: '/',
    head: () => ({ title: P.just ('home') }),
    view: () => {
      said.push ('route')
      return H.p (['home'])
    },
  })

  const ask = answer ({
    routes: [home],
    through: [
      before ((ctx) => {
        said.push ('before')
        return ctx
      }),
      around (() => {
        said.push ('around down')
        return (reply) => {
          said.push ('around up')
          return reply
        }
      }),
      watch (() => {
        said.push ('watch down')
        return () => said.push ('watch up')
      }),
      after ((reply) => {
        said.push ('after')
        return reply
      }),
    ],
  })

  await F.promise (ask (new Request ('http://kit.test/')))

  assert.deepStrictEqual (said, [
    'before',
    'around down',
    'watch down',
    'route',
    'after',
    'watch up',
    'around up',
  ])
})
