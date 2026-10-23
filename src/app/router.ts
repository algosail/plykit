import type { Child, View } from '@algosail/plydom'
import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type {
  Chrome,
  Context,
  Endpoint,
  Handlers,
  HeadPatch,
  Json,
  Layout,
  LayoutSpec,
  Load,
  Loaded,
  PageHandlers,
  PageHead,
  PageRoute,
  PageView,
  Params,
  Route,
  Routes,
  Still,
} from './types.ts'
import { data } from './reply.ts'
import * as R from './route.ts'

/** A route with its pattern already parsed: one row of the table. */
export type Row<C extends Context = Context> = {
  readonly route: Route<C>
  readonly pattern: R.Pattern
}

/** A route table, ordered most specific first. */
export type Table<C extends Context = Context> = {
  readonly tag: 'table'
  readonly rows: readonly Row<C>[]
}

/** A path resolved to the route that claims it and the captures it made. */
export type Match<C extends Context = Context> = {
  readonly route: Route<C>
  readonly params: Params
}

/** Everything a page needs, before the data type is erased. */
export type PageSpec<C extends Context = Context, D extends Json = Json> = {
  readonly pattern: string
  /** What this page needs before it can be drawn. */
  readonly load?: Load<C, D>
  readonly view: PageView<C, D>
  readonly head?: PageHead<C, D>
  /** What answers the methods a page does not. */
  readonly on?: PageHandlers<C, D>
  /** Whether this page can be written out as a file — see `staticSite`. */
  readonly static?: boolean
  /** The addresses to write, for a pattern that has captures. */
  readonly paths?: () => F.Future<unknown, readonly Params[]>
}

/** Everything an endpoint needs: a path, and what answers on it. */
export type EndpointSpec<C extends Context = Context> = {
  readonly pattern: string
  readonly on: Handlers<C>
  /** Whether this endpoint can be written out as a file — see `staticSite`. */
  readonly static?: boolean
  /** The addresses to write, for a pattern that has captures. */
  readonly paths?: () => F.Future<unknown, readonly Params[]>
}

/** The data a page stored is `Json` once the route is built. The view still sees its own `D`. */
const asJson =
  <D extends Json, A, B>(f: (ctx: A & { readonly data: D }) => B) =>
  (ctx: A & { readonly data: Json }): B =>
    f ({ ...ctx, data: ctx.data as D })

const noLoad = <D extends Json>(): F.Future<unknown, Loaded<D>> =>
  F.resolve (data ({} as D))

const headOf = <D extends Json, C extends Context>(
  own: PageHead<C, D> | undefined,
): PageHead<C, Json> | undefined =>
  own === undefined
    ? undefined
    : asJson<D, C, HeadPatch> (own)

const chromeOf = <D extends Json, C extends Context>(spec: LayoutSpec<C, D>): Chrome<C> => {
  const chrome: Chrome<C> = {
    load: P.defaultTo<Load<C, Json>> (noLoad) (spec.load),
    view: asJson<D, C & { readonly slot: Child }, View> (spec.view),
  }
  const head = headOf<D, C> (spec.head)
  return head === undefined ? chrome : { ...chrome, head }
}

const stillnessOf = (spec: {
  readonly static?: boolean
  readonly paths?: () => F.Future<unknown, readonly Params[]>
}): Still => ({ on: spec.static === true, paths: spec.paths })

/**
 * Builds one page.
 * @example
 * ```ts
 * // page :: PageSpec d -> PageRoute
 * page ({ pattern: '/', load: () => of (ok ({})), view: () => h1 (['hi']) })
 * // => PageRoute
 * ```
 */
export function page<C extends Context = Context, D extends Json = Json>(
  spec: PageSpec<C, D>,
): PageRoute<C, Json> {
  return {
    tag: 'page',
    id: spec.pattern,
    pattern: spec.pattern,
    on: P.defaultTo<PageHandlers<C, Json>> ({}) (spec.on),
    still: stillnessOf (spec),
    load: P.defaultTo<Load<C, Json>> (noLoad) (spec.load),
    layouts: [],
    view: asJson<D, C, View> (spec.view),
    head: headOf<D, C> (spec.head),
  }
}

/**
 * Builds one endpoint: a path that answers with data and renders nothing.
 * @example
 * ```ts
 * // endpoint :: EndpointSpec -> Endpoint
 * endpoint ({ pattern: '/api/posts', on: { GET: () => map (json) (all ()) } })
 * // => Endpoint
 * ```
 */
export function endpoint<C extends Context = Context>(spec: EndpointSpec<C>): Endpoint<C> {
  return {
    tag: 'endpoint',
    id: spec.pattern,
    pattern: spec.pattern,
    on: spec.on,
    still: stillnessOf (spec),
  }
}

const wrapped = <C extends Context>(chrome: Chrome<C>): (route: Route<C>) => Route<C> =>
  P.cases<Route<C>, Route<C>> ({
    endpoint: P.I<Endpoint<C>>,
    page: (one: PageRoute<C, Json>): Route<C> => ({
      ...one,
      layouts: P.prepend (chrome) (one.layouts),
    }),
  })

/**
 * Builds one layout and hands back what applies it: the markup around a page, what that markup reads, and the function that puts it around routes.
 * @example
 * ```ts
 * // layout :: LayoutSpec d -> Array Route -> Array Route
 * const site = layout ({ view: (ctx) => div ([nav, main ([ctx.slot])]) })
 * site ([home, ...docs ([intro, guide])])
 * // home draws site (home); intro draws site (docs (intro))
 * ```
 */
export function layout<C extends Context = Context, D extends Json = Json>(
  spec: LayoutSpec<C, D>,
): Layout<C> {
  const around = wrapped<C> (chromeOf (spec))

  return (routes: Routes<C>): Route<C>[] => P.map (around) (flat (routes))
}

/**
 * Routes, however they were written, as one flat list.
 * @example
 * ```ts
 * // flat :: Routes s | Route s -> Array Route
 * flat ([home, docs ([intro, guide]), api]).length
 * // => 4
 * flat (home).length
 * // => 1
 * ```
 */
export function flat<C extends Context = Context>(routes: Routes<C> | Route<C>): readonly Route<C>[] {
  return [routes].flat (2)
}

const rowOf = <C extends Context>(route: Route<C>): Row<C> => ({
  route,
  pattern: R.parsePattern (route.pattern),
})

const byPattern = <C extends Context>(a: Row<C>, b: Row<C>): P.Ordering =>
  R.compare (a.pattern) (b.pattern)

/**
 * Compiles routes into a table, ordered so the first match is the right one.
 * @example
 * ```ts
 * // table :: Array Route -> Table
 * table ([blogSlug, blogNew]).rows[0].route.pattern
 * // => '/blog/new'
 * ```
 */
export function table<C extends Context = Context>(routes: Routes<C>): Table<C> {
  return {
    tag: 'table',
    rows: P.sortWith (byPattern<C>) (P.map (rowOf<C>) (flat (routes))),
  }
}

const matchOf = <C extends Context>(path: string) => (row: Row<C>): P.Maybe<Match<C>> =>
  P.map ((params: Params): Match<C> => ({ route: row.route, params })) (
    R.match (row.pattern) (path),
  )

/**
 * Finds the route that claims this path, with whatever it captured.
 * @example
 * ```ts
 * // lookup :: Table -> String -> Maybe Match
 * lookup (routes) ('/blog/hello')
 * // => just({ route: blogSlug, params: { slug: 'hello' } })
 * lookup (routes) ('/nope')
 * // => nothing()
 * ```
 */
export function lookup<C extends Context = Context>(t: Table<C>): (path: string) => P.Maybe<Match<C>> {
  return (path: string): P.Maybe<Match<C>> =>
    P.findMap (matchOf<C> (path)) (t.rows)
}

const escapedPath = (value: string): string =>
  P.joinWith ('/') (P.map (encodeURIComponent) (P.splitOn ('/') (value)))

const isEmpty = (s: string): boolean => s === ''

const notEmpty = (s: string): boolean => !isEmpty (s)

const asPath = (parts: readonly string[]): string =>
  '/' + P.joinWith ('/') (P.reject (isEmpty) (parts))

const textOf = (params: Params): (seg: R.Segment) => P.Maybe<string> =>
  R.segment<P.Maybe<string>> ({
    static: (one) => P.just (one.value),
    param: (one) =>
      P.map (encodeURIComponent) (
        P.chain (P.fromPredicate (notEmpty)) (P.lookup (one.name) (params)),
      ),
    rest: (one) => P.map (escapedPath) (P.lookup (one.name) (params)),
  })

/**
 * Fills a pattern back in from params, so links can be built from the same pattern the router matches rather than from a hand-written string.
 * @example
 * ```ts
 * // href :: String -> Params -> Maybe String
 * href ('/blog/:slug') ({ slug: 'hello' })
 * // => just('/blog/hello')
 * href ('/blog/:slug') ({ slug: 'yes' })
 * // => just('/blog/yes')
 * href ('/files/:path{.+}') ({ path: 'a/b' })
 * // => just('/files/a/b')
 * href ('/blog/:slug') ({})
 * // => nothing()
 * href ('/blog/:slug') ({ slug: '' })
 * // => nothing()
 * ```
 */
export function href(pattern: string): (params: Params) => P.Maybe<string> {
  const parsed = R.parsePattern (pattern)
  return (params: Params): P.Maybe<string> =>
    P.map (asPath) (P.traverse (P.Maybe) (textOf (params)) (parsed))
}
