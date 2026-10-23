import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import { Window } from 'happy-dom'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { About, Item, Place, Route, Written } from '../src/mod.ts'
import { staticSite } from '../src/build/site.ts'
import { readText } from '../src/fs/disk.ts'
import {
  data,
  endpoint,
  feed,
  handler,
  json,
  page,
  robots,
  sitemap,
} from '../src/mod.ts'
import './fixture/islands/desk.ts'

import './fixture/islands/mark.ts'
import './fixture/islands/reading.ts'
import { inDirs } from './temp.ts'
const ORIGIN = 'https://kit.example'

const posts = [
  { id: 'first', title: 'First & best', at: new Date ('2026-01-02') },
  { id: 'second', title: 'Second <b>', at: new Date ('2026-02-03') },
]

const plain = (pattern: string, title: string): Route =>
  page ({
    pattern,
    head: () => ({ title: P.just (title) }),
    view: () => H.h1 ([title]),
  })

const home = plain ('/', 'Home')
const about = plain ('/about', 'About us')

/**
 * A live route with a capture, which still knows its addresses.
 */
const post: Route = page ({
  pattern: '/blog/[slug]',
  paths: () => F.resolve (P.map ((p: { id: string }) => ({ slug: p.id })) (posts)),
  load: (ctx) =>
    F.resolve (data ({
      title: posts.find ((p) => p.id === ctx.params.slug)?.title ?? '',
    })),
  head: (ctx) => ({ title: P.just (ctx.data.title) }),
  view: (ctx) => H.h1 ([ctx.data.title]),
})

/**
 * A capture without paths — there is nothing to name its addresses with.
 */
const anon: Route = page ({
  pattern: '/u/[name]',
  head: () => ({ title: P.just ('someone') }),
  view: (ctx) => H.h1 ([ctx.params.name]),
})

const api: Route = endpoint ({
  pattern: '/api/posts',
  on: { GET: () => F.resolve (json ({ posts: [] })) },
})

const pages: readonly Route[] = [home, about, post, anon, api]

const ask = async (routes: readonly Route[], path: string): Promise<Response> =>
  await handler ({ routes }) (new Request (`http://kit.test${path}`))

const parsed = (text: string): Document => {
  const window = new Window ()
  return new window.DOMParser ().parseFromString (
    text,
    'text/html',
  ) as unknown as Document
}

const textsOf = (doc: Document, tag: string): readonly string[] =>
  Array.from (doc.getElementsByTagName (tag)).map ((el) => el.textContent ?? '')

test ('kit/sitemap — addresses come from the routes, and are not written a second time', async () => {
  const map_ = sitemap ({ origin: ORIGIN, routes: pages })
  const res = await ask ([...pages, map_], '/sitemap.xml')
  const said = await res.text ()

  assert.deepStrictEqual (res.status, 200)
  assert.ok ((res.headers.get ('content-type') ?? '').includes ('application/xml'))

  const doc = parsed (said)
  assert.deepStrictEqual (textsOf (doc, 'loc'), [
    `${ORIGIN}/`,
    `${ORIGIN}/about`,
    `${ORIGIN}/blog/first`,
    `${ORIGIN}/blog/second`,
  ])
})

test ('kit/sitemap — endpoints and nameless captures do not get in', async () => {
  const map_ = sitemap ({ origin: ORIGIN, routes: pages })
  const said = await (await ask ([...pages, map_], '/sitemap.xml')).text ()

  assert.deepStrictEqual (said.includes ('/api/posts'), false)
  assert.deepStrictEqual (said.includes ('/u/'), false)
  assert.deepStrictEqual (said.includes ('/sitemap.xml</loc>'), false)
})

test ('kit/sitemap — about and also add what the routes do not have', async () => {
  const map_ = sitemap ({
    origin: ORIGIN,
    routes: [home],
    about: () =>
      F.resolve ({ lastmod: new Date ('2026-03-04'), changefreq: 'weekly' }),
    also: () =>
      F.resolve ([{ loc: '/old', priority: 0.3 }] as readonly Place[]),
  })
  const doc = parsed (await (await ask ([home, map_], '/sitemap.xml')).text ())

  assert.deepStrictEqual (textsOf (doc, 'lastmod'), ['2026-03-04'])
  assert.deepStrictEqual (textsOf (doc, 'changefreq'), ['weekly'])
  assert.deepStrictEqual (textsOf (doc, 'priority'), ['0.3'])
  assert.deepStrictEqual (textsOf (doc, 'loc'), [`${ORIGIN}/`, `${ORIGIN}/old`])
})

test ('kit/sitemap — about takes lastmod from the same place as paths', async () => {
  const dateOf = (slug: string): F.Future<unknown, About> =>
    F.resolve ({ lastmod: posts.find ((one) => one.id === slug)?.at })
  const map_ = sitemap ({
    origin: ORIGIN,
    routes: [post],
    about: (path: string) => dateOf (path.slice ('/blog/'.length)),
  })
  const doc = parsed (await (await ask ([post, map_], '/sitemap.xml')).text ())

  assert.deepStrictEqual (textsOf (doc, 'loc'), [
    `${ORIGIN}/blog/first`,
    `${ORIGIN}/blog/second`,
  ])
  assert.deepStrictEqual (textsOf (doc, 'lastmod'), ['2026-01-02', '2026-02-03'])
})

test ('kit/feed — RSS with what was given, and with escaping', async () => {
  const asItem = (p: typeof posts[number]): Item => ({
    title: p.title,
    link: `/blog/${p.id}`,
    published: p.at,
    summary: 'beginning & end',
  })
  const rss = feed ({
    origin: ORIGIN,
    title: 'Notes',
    description: 'about this and that',
    language: 'ru',
    items: () => F.resolve (P.map (asItem) (posts)),
  })

  const res = await ask ([...pages, rss], '/feed.xml')
  const said = await res.text ()
  const doc = parsed (said)

  assert.deepStrictEqual (res.status, 200)
  assert.deepStrictEqual (textsOf (doc, 'title')[0], 'Notes')
  assert.deepStrictEqual (textsOf (doc, 'language'), ['ru'])
  assert.deepStrictEqual (textsOf (doc, 'title').slice (1), [
    'First & best',
    'Second <b>',
  ])
  assert.ok ((said).includes (`<link>${ORIGIN}/blog/first</link>`))
  assert.ok ((said).includes (`<link>${ORIGIN}/blog/second</link>`))
  assert.ok ((textsOf (doc, 'pubDate')[0]).includes ('Fri, 02 Jan 2026'))
})

test ('kit/feed — a quote in the origin does not break atom:link', async () => {
  const rss = feed ({
    origin: `${ORIGIN}/"q`,
    title: 'Notes',
    items: () => F.resolve ([] as readonly Item[]),
  })
  const said = await (await ask ([rss], '/feed.xml')).text ()

  assert.ok ((said).includes (`<atom:link href="${ORIGIN}/&quot;q/feed.xml" rel="self"`))
  assert.deepStrictEqual (said.includes (`href="${ORIGIN}/"q`), false)
})

test ('kit/robots — by default everything is allowed, and that is said out loud', async () => {
  const said = await (await ask ([robots ()], '/robots.txt')).text ()
  assert.deepStrictEqual (said, 'User-agent: *\nDisallow:\n')
})

test ('kit/robots — disallow rules and a link to the map', async () => {
  const rules = robots ({
    disallow: ['/admin', '/api'],
    sitemap: `${ORIGIN}/sitemap.xml`,
  })
  const res = await ask ([rules], '/robots.txt')

  assert.ok ((res.headers.get ('content-type') ?? '').includes ('text/plain'))
  assert.deepStrictEqual (
    await res.text (),
    'User-agent: *\nDisallow: /admin\nDisallow: /api\n\n' +
      `Sitemap: ${ORIGIN}/sitemap.xml\n`,
  )
})

test ('kit/discovery — all three go into the static site', () =>
  inDirs (async ({ out, outDir }) => {
    const routes = [
      home,
      sitemap ({ origin: ORIGIN, routes: [home] }),
      feed ({
        origin: ORIGIN,
        title: 'Notes',
        items: () => F.resolve ([] as readonly Item[]),
      }),
      robots ({ sitemap: `${ORIGIN}/sitemap.xml` }),
    ]

    const done = await staticSite ({ routes, outDir }, { out })
    const written = P.map ((w: Written) => w.file) (done.written)

    assert.deepStrictEqual (written.includes ('sitemap.xml'), true)
    assert.deepStrictEqual (written.includes ('feed.xml'), true)
    assert.deepStrictEqual (written.includes ('robots.txt'), true)
    assert.ok ((await readText (`${out}/sitemap.xml`)).includes (`${ORIGIN}/`))
  }))
