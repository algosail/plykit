import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  comparePatterns,
  data,
  href,
  lookupRoute,
  matchPattern,
  page,
  parsePattern,
  routeTable,
} from '../src/mod.ts'

test ('route/parsePattern — three kinds of segment', () => {
  assert.deepStrictEqual (parsePattern ('/blog/:slug/:rest{.+}'), [
    { tag: 'static', value: 'blog' },
    { tag: 'param', name: 'slug' },
    { tag: 'rest', name: 'rest' },
  ])
  assert.deepStrictEqual (parsePattern ('/[oops'), [{ tag: 'static', value: '[oops' }])
})

test ('route/parsePattern — slashes at the edges and in a row do not count', () => {
  const same = [
    parsePattern ('/blog/hello'),
    parsePattern ('blog/hello/'),
    parsePattern ('//blog//hello//'),
  ]
  assert.deepStrictEqual (same[1], same[0])
  assert.deepStrictEqual (same[2], same[0])
  assert.deepStrictEqual (parsePattern ('/'), [])
  assert.deepStrictEqual (parsePattern (''), [])
})

test ('route/parsePattern — rest only comes last', () => {
  assert.throws (
    () => parsePattern ('/:rest{.+}/tail'),
    (error: unknown) => error instanceof Error && error.message.includes ('rest segment must come last'),
  )
  assert.throws (
    () => parsePattern ('/*/tail'),
    (error: unknown) => error instanceof Error && error.message.includes ('rest segment must come last'),
  )
})

test ('route/parsePattern — a star is the tail, and a colon inside a piece is literal', () => {
  assert.deepStrictEqual (parsePattern ('/files/*'), [
    { tag: 'static', value: 'files' },
    { tag: 'rest', name: '*' },
  ])
  assert.deepStrictEqual (parsePattern ('/*'), [{ tag: 'rest', name: '*' }])
  assert.deepStrictEqual (parsePattern ('/file:name'), [{ tag: 'static', value: 'file:name' }])
  assert.deepStrictEqual (parsePattern ('/files*'), [{ tag: 'static', value: 'files*' }])
})

test ('route/parsePattern — brackets, an optional piece, and a regexp are refused', () => {
  const refuses = (pattern: string, said: string) => {
    assert.throws (
      () => parsePattern (pattern),
      (error: unknown) => error instanceof Error && error.message.includes (said),
    )
  }
  refuses ('/blog/[slug]', '`:name`')
  refuses ('/[[lang]]/about', 'i18n')
  refuses ('/api/:type?', 'no optional segment')
  refuses ('/post/:id{[0-9]+}', 'no regexp segment')
  refuses ('/:slug-id', 'letters, digits and underscores')
})

test ('route/match — a static segment, a capture, and the length of the path', () => {
  const p = parsePattern ('/blog/:slug')
  assert.deepStrictEqual (matchPattern (p) ('/blog/hello'), P.just ({ slug: 'hello' }))
  assert.deepStrictEqual (matchPattern (p) ('/blog/hello/'), P.just ({ slug: 'hello' }))
  assert.deepStrictEqual (matchPattern (p) ('/blog'), P.nothing ())
  assert.deepStrictEqual (matchPattern (p) ('/blog/a/b'), P.nothing ())
  assert.deepStrictEqual (matchPattern (p) ('/news/hello'), P.nothing ())
})

test ('route/match — the root', () => {
  assert.deepStrictEqual (matchPattern (parsePattern ('/')) ('/'), P.just ({}))
  assert.deepStrictEqual (matchPattern (parsePattern ('/')) ('/x'), P.nothing ())
})

test ('route/match — a star is that same tail, under the name *', () => {
  const p = parsePattern ('/files/*')
  assert.deepStrictEqual (matchPattern (p) ('/files/a/b'), P.just ({ '*': 'a/b' }))
  assert.deepStrictEqual (matchPattern (p) ('/files'), P.just ({ '*': '' }))
  assert.deepStrictEqual (matchPattern (p) ('/other'), P.nothing ())
  assert.deepStrictEqual (href ('/files/*') ({ '*': 'a/b' }), P.just ('/files/a/b'))
  assert.deepStrictEqual (href ('/files/*') ({ '*': '' }), P.just ('/files'))
})

test ('route/match — rest takes the rest, including an empty one', () => {
  const p = parsePattern ('/files/:path{.+}')
  assert.deepStrictEqual (matchPattern (p) ('/files/a/b/c'), P.just ({ path: 'a/b/c' }))
  assert.deepStrictEqual (matchPattern (p) ('/files/a'), P.just ({ path: 'a' }))
  assert.deepStrictEqual (matchPattern (p) ('/files'), P.just ({ path: '' }))
  assert.deepStrictEqual (matchPattern (p) ('/other'), P.nothing ())
})

test ('route/match — several captures', () => {
  const p = parsePattern ('/:year/:month/:slug')
  assert.deepStrictEqual (
    matchPattern (p) ('/2026/08/hello'),
    P.just ({ year: '2026', month: '08', slug: 'hello' }),
  )
})

test ('route/compare — a literal is more specific than a capture', () => {
  const lit = parsePattern ('/blog/new')
  const cap = parsePattern ('/blog/:slug')
  const rest = parsePattern ('/blog/:r{.+}')
  assert.deepStrictEqual (P.isLT (comparePatterns (lit) (cap)), true)
  assert.deepStrictEqual (P.isLT (comparePatterns (cap) (rest)), true)
  assert.deepStrictEqual (P.isEQ (comparePatterns (lit) (lit)), true)
  assert.deepStrictEqual (
    P.isLT (comparePatterns (parsePattern ('/a/b')) (parsePattern ('/a'))),
    true,
  )
})

const stub = (pattern: string) =>
  page ({
    pattern,
    load: () => F.resolve (data ({})),
    view: () => H.h1 ([pattern]),
  })

test ('router/table — sorts from specific to general', () => {
  const t = routeTable ([
    stub ('/blog/:rest{.+}'),
    stub ('/blog/:slug'),
    stub ('/blog/new'),
  ])
  assert.deepStrictEqual (t.rows.map ((e) => e.route.pattern), [
    '/blog/new',
    '/blog/:slug',
    '/blog/:rest{.+}',
  ])
})

test ('router/lookup — the first by specificity wins', () => {
  const t = routeTable ([stub ('/blog/:slug'), stub ('/blog/new')])
  const hit = lookupRoute (t) ('/blog/new')
  assert.deepStrictEqual (P.isJust (hit) && hit.value.route.pattern, '/blog/new')
  const cap = lookupRoute (t) ('/blog/other')
  assert.deepStrictEqual (P.isJust (cap) && cap.value.route.pattern, '/blog/:slug')
  assert.deepStrictEqual (P.isJust (cap) && cap.value.params, { slug: 'other' })
  assert.deepStrictEqual (lookupRoute (t) ('/nope'), P.nothing ())
})

test ('route/compare — an index comes before its catch-all', () => {
  const index = parsePattern ('/docs')
  const rest = parsePattern ('/docs/:rest{.+}')
  assert.deepStrictEqual (P.isLT (comparePatterns (index) (rest)), true)
  assert.deepStrictEqual (P.isGT (comparePatterns (rest) (index)), true)
  assert.deepStrictEqual (
    P.isLT (comparePatterns (parsePattern ('/')) (parsePattern ('/:any{.+}'))),
    true,
  )
  const lt = (a: string, b: string) =>
    P.isLT (comparePatterns (parsePattern (a)) (parsePattern (b)))
  assert.deepStrictEqual (lt ('/a/b', '/a/:b'), true)
  assert.deepStrictEqual (lt ('/a/:b', '/a/:r{.+}'), true)
  assert.deepStrictEqual (lt ('/a/:b', '/a'), true)
})

test ('router/table — the index page stays reachable', () => {
  const t = routeTable ([stub ('/docs/:rest{.+}'), stub ('/docs')])
  assert.deepStrictEqual (t.rows.map ((e) => e.route.pattern), [
    '/docs',
    '/docs/:rest{.+}',
  ])
  const exact = lookupRoute (t) ('/docs')
  assert.deepStrictEqual (P.isJust (exact) && exact.value.route.pattern, '/docs')
  const deep = lookupRoute (t) ('/docs/intro')
  assert.deepStrictEqual (P.isJust (deep) && deep.value.route.pattern, '/docs/:rest{.+}')
  assert.deepStrictEqual (P.isJust (deep) && deep.value.params, { rest: 'intro' })
})

test ('router/table — the order does not depend on how they were given', () => {
  const given = [
    '/docs',
    '/docs/:rest{.+}',
    '/docs/:slug',
    '/docs/intro',
    '/',
    '/:any{.+}',
  ]
  const order = (ps: readonly string[]) =>
    routeTable (ps.map (stub)).rows.map ((e) => e.route.pattern)
  assert.deepStrictEqual (order (given), [
    '/docs/intro',
    '/docs/:slug',
    '/docs',
    '/docs/:rest{.+}',
    '/',
    '/:any{.+}',
  ])
  assert.deepStrictEqual (order ([...given].reverse ()), order (given))
})

test ('route/match — a capture is decoded', () => {
  const one = parsePattern ('/blog/:slug')
  assert.deepStrictEqual (matchPattern (one) ('/blog/%79%65%73'), P.just ({ slug: 'yes' }))
  assert.deepStrictEqual (matchPattern (one) ('/blog/a%2Fb'), P.just ({ slug: 'a/b' }))
  assert.deepStrictEqual (matchPattern (one) ('/blog/a/b'), P.nothing ())

  const about = parsePattern ('/about-us')
  assert.deepStrictEqual (matchPattern (about) ('/%61bout-us'), P.just ({}))
  assert.deepStrictEqual (matchPattern (about) ('/about-us'), P.just ({}))

  assert.deepStrictEqual (
    matchPattern (parsePattern ('/files/:path{.+}')) ('/files/%61/b'),
    P.just ({ path: 'a/b' }),
  )

  assert.deepStrictEqual (matchPattern (one) ('/blog/%ZZ'), P.just ({ slug: '%ZZ' }))
})

test ('router/href — builds the path back out of the template', () => {
  assert.deepStrictEqual (
    href ('/blog/:slug') ({ slug: 'hello' }),
    P.just ('/blog/hello'),
  )
  assert.deepStrictEqual (
    href ('/blog/:slug') ({ slug: 'yes' }),
    P.just ('/blog/yes'),
  )
  assert.deepStrictEqual (href ('/blog/:slug') ({ slug: 'a/b' }), P.just ('/blog/a%2Fb'))
  assert.deepStrictEqual (
    href ('/files/:path{.+}') ({ path: 'a/b' }),
    P.just ('/files/a/b'),
  )
  assert.deepStrictEqual (
    href ('/files/:path{.+}') ({ path: 'a/b c' }),
    P.just ('/files/a/b%20c'),
  )
  assert.deepStrictEqual (href ('/') ({}), P.just ('/'))
  assert.deepStrictEqual (href ('/about') ({}), P.just ('/about'))
  assert.deepStrictEqual (href ('/blog/:slug') ({}), P.nothing ())
  assert.deepStrictEqual (href ('/:a/:b') ({ a: 'x' }), P.nothing ())
})

test ('router/href — is the inverse of match, and not only for plain letters', () => {
  const roundTrip = (pattern: string) => (params: Record<string, string>) =>
    P.chain (matchPattern (parsePattern (pattern))) (href (pattern) (params))

  assert.deepStrictEqual (
    roundTrip ('/:year/:slug') ({ year: '2026', slug: 'x' }),
    P.just ({ year: '2026', slug: 'x' }),
  )
  assert.deepStrictEqual (
    roundTrip ('/blog/:slug') ({ slug: 'two words/# ?' }),
    P.just ({ slug: 'two words/# ?' }),
  )
  assert.deepStrictEqual (
    roundTrip ('/files/:path{.+}') ({ path: 'a/b c/d' }),
    P.just ({ path: 'a/b c/d' }),
  )
})

test ('router/href — an empty capture is not a link to the neighbouring route', () => {
  assert.deepStrictEqual (href ('/blog/:slug') ({ slug: '' }), P.nothing ())
  assert.deepStrictEqual (matchPattern (parsePattern ('/blog/:slug')) ('/blog'), P.nothing ())
  assert.deepStrictEqual (href ('/:a/:b') ({ a: '', b: 'x' }), P.nothing ())
  assert.deepStrictEqual (href ('/a/:x/b') ({ x: '' }), P.nothing ())
  assert.deepStrictEqual (href ('/:slug') ({ slug: '' }), P.nothing ())

  assert.deepStrictEqual (href ('/files/:path{.+}') ({ path: '' }), P.just ('/files'))
  assert.deepStrictEqual (
    matchPattern (parsePattern ('/files/:path{.+}')) ('/files'),
    P.just ({ path: '' }),
  )
})
