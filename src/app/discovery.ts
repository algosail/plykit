import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Reply, Route, Routes } from './types.ts'
import { escapeAttribute, escapeText } from '../document/html.ts'
import { addressesOf } from './data.ts'
import * as Rp from './reply.ts'
import * as R from './route.ts'
import { endpoint, flat } from './router.ts'

const XML_TYPE = 'application/xml; charset=utf-8'
const TEXT_TYPE = 'text/plain; charset=utf-8'

const xml = Rp.body (XML_TYPE)
const plain = Rp.body (TEXT_TYPE)

const HEAD = '<?xml version="1.0" encoding="utf-8"?>'

const asText = (parts: readonly string[]): string => P.mconcat (P.Concat) (parts)

const tag = (name: string) => (value: string): string =>
  `<${name}>${escapeText (value)}</${name}>`

const tagged =
  <A>(name: string, shown: (a: A) => string) =>
  (value: A | undefined): P.Maybe<string> =>
    P.map (P.pipe ([shown, tag (name)])) (P.fromNullable (value))

const someTags = (all: readonly P.Maybe<string>[]): string =>
  asText (P.justs (all))

const absolute = (origin: string) => (path: string): string =>
  `${origin.replace (/\/$/, '')}${path}`

const isWhole = (link: string): boolean => link.startsWith ('http')

const addressIn = (origin: string): (link: string) => string =>
  P.unless (isWhole) (absolute (origin))

const dated = (shape: (d: Date) => string) => (said: Date | string): string =>
  P.maybe_ (() => said as string) (shape) (P.fromPredicate (P.isDate) (said))

const asDay = (d: Date): string => d.toISOString ().slice (0, 10)

const asMoment = (d: Date): string => d.toUTCString ()

/** How often a page changes, in the words the format allows. */
export type Changes =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never'

/** What a sitemap says about one address, besides the address. */
export type About = {
  readonly lastmod?: Date | string
  readonly changefreq?: Changes
  /** Between 0 and 1. Left out where every page is as important as the next. */
  readonly priority?: number
}

/** One address in a sitemap. */
export type Place = About & { readonly loc: string }

/** What goes in a sitemap and where it is served. */
export type SitemapOptions<S = unknown> = {
  /** The site's public origin — `https://example.com`. */
  readonly origin: string
  readonly pattern?: string
  /** The routes to list. */
  readonly routes?: Routes<S>
  /** Addresses to add that no route stands for. */
  readonly also?: () => F.Future<unknown, readonly Place[]>
  /** What to say about each address the routes gave. */
  readonly about?: (path: string) => F.Future<unknown, About>
  /** Whether it lands in a static site. */
  readonly static?: boolean
}

const SITEMAP = '/sitemap.xml'

const isPage = <S>(route: Route<S>): boolean =>
  P.cases<Route<S>, boolean> ({
    page: P.K (true),
    endpoint: P.K (false),
  }) (route)

const saysWhere = <S>(route: Route<S>): boolean =>
  route.still.paths !== undefined

const capturing = <S>(route: Route<S>): boolean => R.hasCaptures (route.pattern)

const isNameable = <S>(route: Route<S>): boolean =>
  P.anyPass ([
    P.predicateNot (P.predicate (capturing<S>)),
    P.predicate (saysWhere<S>),
  ]) (route)

const listed = <S>(routes: Routes<S>): readonly Route<S>[] =>
  P.filter (P.allPass ([P.predicate (isPage<S>), P.predicate (isNameable<S>)])) (
    flat (routes),
  )

const addressesIn = <S>(
  route: Route<S>,
): F.Future<unknown, readonly string[]> => F.attemptP (() => addressesOf (route))

const flattened = (all: readonly (readonly string[])[]): readonly string[] =>
  P.join (all)

const addressesFor = <S>(
  routes: Routes<S>,
): F.Future<unknown, readonly string[]> =>
  P.map (flattened) (
    F.parallel (Number.POSITIVE_INFINITY) (
      P.map (addressesIn<S>) (listed<S> (routes)),
    ),
  )

const asPlace = (path: string) => (about: About): Place => ({
  loc: path,
  ...about,
})

const placeIn =
  (about: (path: string) => F.Future<unknown, About>) =>
  (path: string): F.Future<unknown, Place> => P.map (asPlace (path)) (about (path))

const asPlaces =
  (about: (path: string) => F.Future<unknown, About>) =>
  (paths: readonly string[]): F.Future<unknown, readonly Place[]> =>
    F.parallel (Number.POSITIVE_INFINITY) (P.map (placeIn (about)) (paths))

const placesIn =
  <S>(about: (path: string) => F.Future<unknown, About>) =>
  (routes: Routes<S>): F.Future<unknown, readonly Place[]> =>
    P.chain (asPlaces (about)) (addressesFor (routes))

const aboutIn = (place: Place): string =>
  someTags ([
    tagged<Date | string> ('lastmod', dated (asDay)) (place.lastmod),
    tagged<Changes> ('changefreq', P.I<Changes>) (place.changefreq),
    tagged<number> ('priority', (one: number) => one.toFixed (1)) (place.priority),
  ])

const asEntry = (origin: string) => (place: Place): string =>
  asText ([
    '<url>',
    tag ('loc') (addressIn (origin) (place.loc)),
    aboutIn (place),
    '</url>',
  ])

const asUrlset = (origin: string) => (places: readonly Place[]): string =>
  asText ([
    HEAD,
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    P.foldMap (P.Concat) (asEntry (origin)) (places),
    '</urlset>',
  ])

const noPlaces = F.resolve<unknown, readonly Place[]> ([])

const noAbout = F.resolve<unknown, About> ({})

const nothingAbout = (_: string): F.Future<unknown, About> => noAbout

const fromRoutesIn = <S>(
  options: SitemapOptions<S>,
): F.Future<unknown, readonly Place[]> =>
  P.maybe_ (
    () => noPlaces,
  ) (
    placesIn<S> (P.defaultTo (nothingAbout) (options.about)),
  ) (P.fromNullable (options.routes))

const alsoIn = <S>(
  options: SitemapOptions<S>,
): F.Future<unknown, readonly Place[]> =>
  P.maybe_ (
    () => noPlaces,
  ) (
    (build: () => F.Future<unknown, readonly Place[]>) => build (),
  ) (P.fromNullable (options.also))

const andAlso =
  (fromRoutes: readonly Place[]) =>
  (also: readonly Place[]): readonly Place[] => P.concat (fromRoutes) (also)

const placesFor = <S>(
  options: SitemapOptions<S>,
): F.Future<unknown, readonly Place[]> =>
  P.lift2 (andAlso) (fromRoutesIn (options)) (alsoIn (options))

/**
 * A sitemap read off the route table.
 * @example
 * ```ts
 * // sitemap :: SitemapOptions s -> Route s
 * const pages = [home, about, post]
 * export const routes = [...pages, sitemap ({ origin: 'https://x.dev', routes: pages })]
 * ```
 */
export function sitemap<S = unknown>(options: SitemapOptions<S>): Route<S> {
  return endpoint<S> ({
    pattern: P.defaultTo (SITEMAP) (options.pattern),
    static: options.static !== false,
    on: {
      GET: (): F.Future<unknown, Reply> =>
        P.map (P.pipe ([asUrlset (options.origin), xml])) (placesFor (options)),
    },
  })
}

/** One item in a feed. */
export type Item = {
  readonly title: string
  /** Where it lives — a path on this site, or a whole address. */
  readonly link: string
  /** What tells this item apart from every other, forever. */
  readonly id?: string
  readonly published?: Date | string
  readonly summary?: string
  readonly author?: string
}

/** What a feed says about itself, and what is in it. */
export type FeedOptions = {
  readonly origin: string
  readonly title: string
  readonly pattern?: string
  readonly description?: string
  /** The language tag — `ru`, `en-GB`. */
  readonly language?: string
  readonly items: () => F.Future<unknown, readonly Item[]>
  readonly static?: boolean
}

const FEED = '/feed.xml'

const aboutItem = (entry: Item): string =>
  someTags ([
    tagged<Date | string> ('pubDate', dated (asMoment)) (entry.published),
    tagged<string> ('description', P.I<string>) (entry.summary),
    tagged<string> ('author', P.I<string>) (entry.author),
  ])

const asGuid = (link: string) => (entry: Item): string =>
  `<guid isPermaLink="false">${escapeText (P.defaultTo (link) (entry.id))}</guid>`

const asItem = (origin: string) => (entry: Item): string => {
  const link = addressIn (origin) (entry.link)
  return asText ([
    '<item>',
    tag ('title') (entry.title),
    tag ('link') (link),
    asGuid (link) (entry),
    aboutItem (entry),
    '</item>',
  ])
}

const asSelf = (href: string): string =>
  `<atom:link href="${escapeAttribute (href)}" rel="self" ` +
  'type="application/rss+xml"/>'

const aboutFeed = (options: FeedOptions): string =>
  someTags ([
    tagged<string> ('language', P.I<string>) (options.language),
  ])

const asChannel = (options: FeedOptions) => (items: readonly Item[]): string =>
  asText ([
    HEAD,
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    tag ('title') (options.title),
    tag ('link') (options.origin),
    tag ('description') (P.defaultTo (options.title) (options.description)),
    aboutFeed (options),
    asSelf (absolute (options.origin) (P.defaultTo (FEED) (options.pattern))),
    P.foldMap (P.Concat) (asItem (options.origin)) (items),
    '</channel>',
    '</rss>',
  ])

/**
 * An RSS 2.0 feed.
 * @example
 * ```ts
 * // feed :: FeedOptions -> Route s
 * feed ({
 *   origin: 'https://x.dev',
 *   title: 'Notes',
 *   items: () => map ((all) => map (asItem) (all)) (Posts.all ()),
 * })
 * ```
 */
export function feed<S = unknown>(options: FeedOptions): Route<S> {
  return endpoint<S> ({
    pattern: P.defaultTo (FEED) (options.pattern),
    static: options.static !== false,
    on: {
      GET: (): F.Future<unknown, Reply> =>
        P.map (P.pipe ([asChannel (options), xml])) (options.items ()),
    },
  })
}

/** What crawlers are told. */
export type RobotsOptions = {
  readonly pattern?: string
  /** Whom the rules are for. */
  readonly agent?: string
  readonly allow?: readonly string[]
  readonly disallow?: readonly string[]
  /** Where the sitemap is, as a whole address. */
  readonly sitemap?: string
  readonly static?: boolean
}

const ROBOTS = '/robots.txt'

const ruling = (word: string) => (path: string): string => `${word}: ${path}`

const rulesIn = (word: string) => (paths: readonly string[] | undefined) =>
  P.map (ruling (word)) (P.defaultTo<readonly string[]> ([]) (paths))

const saysNothing = (options: RobotsOptions): boolean =>
  options.disallow === undefined && options.allow === undefined

const openly = (options: RobotsOptions): readonly string[] =>
  P.boolean<readonly string[]> ([]) (['Disallow:']) (saysNothing (options))

const sitemapIn = (options: RobotsOptions): readonly string[] =>
  P.maybe_ (P.K<readonly string[]> ([]))
           ((where: string) => ['', `Sitemap: ${where}`])
           (P.fromNullable (options.sitemap))

const linesIn = (options: RobotsOptions): readonly string[] =>
  P.join ([
    [`User-agent: ${P.defaultTo ('*') (options.agent)}`],
    rulesIn ('Disallow') (options.disallow),
    rulesIn ('Allow') (options.allow),
    openly (options),
    sitemapIn (options),
  ])

const asRobots = (options: RobotsOptions): string =>
  P.concat (P.joinWith ('\n') (linesIn (options))) ('\n')

/**
 * A `robots.txt`.
 * @example
 * ```ts
 * // robots :: RobotsOptions -> Route s
 * robots ({ disallow: ['/admin'], sitemap: 'https://x.dev/sitemap.xml' })
 * ```
 */
export function robots<S = unknown>(options: RobotsOptions = {}): Route<S> {
  const said = asRobots (options)
  return endpoint<S> ({
    pattern: P.defaultTo (ROBOTS) (options.pattern),
    static: options.static !== false,
    on: { GET: (): F.Future<unknown, Reply> => F.resolve (plain (said)) },
  })
}
