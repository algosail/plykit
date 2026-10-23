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
export type Row<S = unknown, E = unknown> = {
  readonly route: Route<S, E>
  readonly pattern: R.Pattern
}

/** A route table, ordered most specific first. */
export type Table<S = unknown, E = unknown> = {
  readonly tag: 'table'
  readonly rows: readonly Row<S, E>[]
}

/** A path resolved to the route that claims it and the captures it made. */
export type Match<S = unknown, E = unknown> = {
  readonly route: Route<S, E>
  readonly params: Params
}

/** Everything a page needs, before the data type is erased. */
export type PageSpec<D extends Json, S = unknown, E = unknown> = {
  readonly pattern: string
  /** What this page needs before it can be drawn. */
  readonly load?: Load<D, S, E>
  readonly view: PageView<D, S, E>
  readonly head?: PageHead<D, S, E>
  /** What answers the methods a page does not. */
  readonly on?: PageHandlers<D, S, E>
  /** Whether this page can be written out as a file — see `staticSite`. */
  readonly static?: boolean
  /** The addresses to write, for a pattern that has captures. */
  readonly paths?: () => F.Future<unknown, readonly Params[]>
}

/** Everything an endpoint needs: a path, and what answers on it. */
export type EndpointSpec<S = unknown, E = unknown> = {
  readonly pattern: string
  readonly on: Handlers<S, E>
  /** Whether this endpoint can be written out as a file — see `staticSite`. */
  readonly static?: boolean
  /** The addresses to write, for a pattern that has captures. */
  readonly paths?: () => F.Future<unknown, readonly Params[]>
}

/** What a page's view and head are handed, once the data type is known. */
type Given<D extends Json, S, E> = Context<S, E> & { readonly data: D }

/** The same, with the slot a layout draws around. */
type Framed<D extends Json, S, E> = Given<D, S, E> & { readonly slot: Child }

const narrowed = <D extends Json, C extends { readonly data: Json }>(
  ctx: C,
): Omit<C, 'data'> & { readonly data: D } => ({ ...ctx, data: ctx.data as D })

const widened = <D extends Json, C extends { readonly data: Json }, B>(
  f: (ctx: Omit<C, 'data'> & { readonly data: D }) => B,
): (ctx: C) => B =>
(ctx: C): B => f (narrowed<D, C> (ctx))

const noLoad = <D extends Json>(): F.Future<unknown, Loaded<D>> =>
  F.resolve (data ({} as D))

const headOf = <D extends Json, S, E>(
  own: PageHead<D, S, E> | undefined,
): PageHead<Json, S, E> | undefined =>
  own === undefined
    ? undefined
    : widened<D, Given<Json, S, E>, HeadPatch> (own)

const chromeOf = <D extends Json, S, E>(spec: LayoutSpec<D, S, E>): Chrome<S, E> => {
  const chrome: Chrome<S, E> = {
    load: P.defaultTo<Load<Json, S, E>> (noLoad) (spec.load),
    view: widened<D, Framed<Json, S, E>, View> (spec.view),
  }
  const head = headOf<D, S, E> (spec.head)
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
export function page<D extends Json, S = unknown, E = unknown>(
  spec: PageSpec<D, S, E>,
): PageRoute<Json, S, E> {
  return {
    tag: 'page',
    id: spec.pattern,
    pattern: spec.pattern,
    on: P.defaultTo<PageHandlers<Json, S, E>> ({}) (spec.on),
    still: stillnessOf (spec),
    load: P.defaultTo<Load<Json, S, E>> (noLoad) (spec.load),
    layouts: [],
    view: widened<D, Given<Json, S, E>, View> (spec.view),
    head: headOf<D, S, E> (spec.head),
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
export function endpoint<S = unknown, E = unknown>(spec: EndpointSpec<S, E>): Endpoint<S, E> {
  return {
    tag: 'endpoint',
    id: spec.pattern,
    pattern: spec.pattern,
    on: spec.on,
    still: stillnessOf (spec),
  }
}

const wrapped = <S, E>(chrome: Chrome<S, E>): (route: Route<S, E>) => Route<S, E> =>
  P.cases<Route<S, E>, Route<S, E>> ({
    endpoint: P.I<Endpoint<S, E>>,
    page: (one: PageRoute<Json, S, E>): Route<S, E> => ({
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
export function layout<D extends Json, S = unknown, E = unknown>(
  spec: LayoutSpec<D, S, E>,
): Layout<S, E> {
  const around = wrapped<S, E> (chromeOf (spec))

  return (routes: Routes<S, E>): Route<S, E>[] => P.map (around) (flat (routes))
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
export function flat<S, E = unknown>(routes: Routes<S, E> | Route<S, E>): readonly Route<S, E>[] {
  return [routes].flat (2)
}

const rowOf = <S, E>(route: Route<S, E>): Row<S, E> => ({
  route,
  pattern: R.parsePattern (route.pattern),
})

const byPattern = <S, E>(a: Row<S, E>, b: Row<S, E>): P.Ordering =>
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
export function table<S = unknown, E = unknown>(routes: Routes<S, E>): Table<S, E> {
  return {
    tag: 'table',
    rows: P.sortWith (byPattern<S, E>) (P.map (rowOf<S, E>) (flat (routes))),
  }
}

const matchOf = <S, E>(path: string) => (row: Row<S, E>): P.Maybe<Match<S, E>> =>
  P.map ((params: Params): Match<S, E> => ({ route: row.route, params })) (
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
export function lookup<S, E = unknown>(t: Table<S, E>): (path: string) => P.Maybe<Match<S, E>> {
  return (path: string): P.Maybe<Match<S, E>> =>
    P.findMap (matchOf<S, E> (path)) (t.rows)
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
