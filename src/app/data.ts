import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type {
  Context,
  Endpoint,
  Json,
  Load,
  Loaded,
  PageRoute,
  Params,
  Route,
  Routes,
} from './types.ts'
import { aim } from './resolve.ts'
import * as R from './route.ts'
import { flat, href, table } from './router.ts'

/** The file a build leaves beside the chunks, holding what the loads read. */
export const DATA = 'kit-data.json'

/** What was read at build time, by address. */
export type Prebuilt = Readonly<P.StrMap<Json>>

/** What a data build produced. */
export type Prepared = {
  readonly data: Prebuilt
  /** Routes it read for, and addresses it read — for the build to report. */
  readonly routes: readonly string[]
  /** Addresses whose load refused: they stay live, and the build says so. */
  readonly refused: readonly string[]
}

const refuse = (said: string): never => {
  throw new Error (said)
}

const demanded = <A>(why: () => string): (m: P.Maybe<A>) => A =>
  P.maybe_<A> (() => refuse (why ())) (P.I<A>)

const hasCaptures = <C extends Context>(route: Route<C>): boolean =>
  R.hasCaptures (route.pattern)

const whyNoPaths = <C extends Context>(route: Route<C>) => (): string =>
  `${route.pattern} — static: true, but the template has captures; ` +
  'paths says where the addresses come from'

const pathsOf = <C extends Context>(
  route: Route<C>,
): () => F.Future<unknown, readonly Params[]> =>
  demanded<() => F.Future<unknown, readonly Params[]>> (whyNoPaths (route)) (
    P.fromNullable (route.still.paths),
  )

const whyNoAddress = (pattern: string) => (params: Params) => (): string =>
  `${pattern} — ${JSON.stringify (params)} does not build an address`

const asAddress =
  (pattern: string) =>
  (build: (params: Params) => P.Maybe<string>) =>
  (params: Params): string =>
    demanded<string> (whyNoAddress (pattern) (params)) (build (params))

const addressesFor = <C extends Context>(
  route: Route<C>,
): (all: readonly Params[]) => readonly string[] =>
  P.map (asAddress (route.pattern) (href (route.pattern)))

const capturedBy = <C extends Context>(route: Route<C>): F.Future<unknown, readonly string[]> =>
  P.map (addressesFor (route)) (pathsOf (route) ())

const itsPattern = <C extends Context>(route: Route<C>): F.Future<unknown, readonly string[]> =>
  F.resolve<unknown, readonly string[]> ([route.pattern])

const addressesIn = <C extends Context>(
  route: Route<C>,
): F.Future<unknown, readonly string[]> =>
  P.ifElse<Route<C>> (hasCaptures) (
    capturedBy,
  ) (
    itsPattern,
  ) (route)

/** Every address a static route stands for — its pattern, or what `paths` says. */
export const addressesOf = <C extends Context = Context>(
  route: Route<C>,
): Promise<readonly string[]> => F.promise (addressesIn (route))

const isStill = <C extends Context>(route: Route<C>): route is PageRoute<C, Json> =>
  route.still.on && route.tag === 'page'

/** Pages whose data may be read ahead of time. */
export function stillPages<C extends Context = Context>(
  routes: Routes<C>,
): readonly PageRoute<C, Json>[] {
  return P.filterMap (P.fromPredicate (isStill<C>)) (flat (routes))
}

/** What a build has to hand to read one address the way a server would. */
type Preparing<C extends Context> = {
  readonly point: (
    state: C['state'],
  ) => (request: Request) => { readonly ctx: C }
  readonly state?: (request: Request) => F.Future<unknown, C['state']>
}

/** One address, and what its load answered there. */
type Visit = {
  readonly path: string
  readonly said: Loaded<Json>
}

const asRequest = (path: string): Request =>
  new Request (`http://kit.local${path}`)

const asVisit = (path: string) => (said: Loaded<Json>): Visit => ({
  path,
  said,
})

const stateFor =
  <C extends Context>(at: Preparing<C>) => (request: Request): F.Future<unknown, C['state']> =>
    P.maybe_ (
      () => F.resolve (undefined as C['state']),
    ) (
      P.T (request)<F.Future<unknown, C['state']>>,
    ) (P.fromNullable (at.state))

const contextAt =
  <C extends Context>(at: Preparing<C>) => (request: Request) => (state: C['state']): C =>
    at.point (state) (request).ctx

const loadedIn =
  <C extends Context>(at: Preparing<C>) =>
  (route: PageRoute<C, Json>) =>
  (request: Request): F.Future<unknown, Loaded<Json>> =>
    P.chain (P.pipe (contextAt (at) (request), route.load)) (stateFor (at) (request))

const visiting =
  <C extends Context>(at: Preparing<C>) =>
  (route: PageRoute<C, Json>) =>
  (path: string): F.Future<unknown, Visit> =>
    P.map (asVisit (path)) (loadedIn (at) (route) (asRequest (path)))

const visitsTo =
  <C extends Context>(at: Preparing<C>) =>
  (route: PageRoute<C, Json>): F.Future<unknown, readonly Visit[]> =>
    P.chain ((paths: readonly string[]) =>
      F.parallel (1) (P.map (visiting (at) (route)) (paths)),
    ) (addressesIn (route))

const flattened = (all: readonly (readonly Visit[])[]): readonly Visit[] =>
  P.join (all)

const visitsIn = <C extends Context>(at: Preparing<C>) =>
(
  routes: readonly PageRoute<C, Json>[],
): F.Future<unknown, readonly Visit[]> =>
  P.map (flattened) (F.parallel (1) (P.map (visitsTo (at)) (routes)))

const sortedOut = (one: Visit): P.Either<string, P.Pair<string, Json>> =>
  P.cases<Loaded<Json>, P.Either<string, P.Pair<string, Json>>> ({
    data: (said) => P.right (P.pair (one.path, said.data)),
    redirect: P.K (P.left<string, P.Pair<string, Json>> (one.path)),
    failure: P.K (P.left<string, P.Pair<string, Json>> (one.path)),
  }) (one.said)

const patternOf = <C extends Context>(route: PageRoute<C, Json>): string => route.pattern

/**
 * Reads every static page's data, once, and hands back what it read by address.
 * @example
 * ```ts
 * // prepare :: Routes s -> Prepare s -> Promise Prepared
 * const ready = await prepare (config.routes, config)
 * ready.data['/blog/hello']
 * ```
 */
export async function prepare<C extends Context = Context>(
  routes: Routes<C>,
  options: { readonly state?: (request: Request) => F.Future<unknown, C['state']> } = {},
): Promise<Prepared> {
  const still = stillPages (routes)
  const at: Preparing<C> = { point: aim (table (routes)), state: options.state }
  const [refused, kept] = P.partitionMap (sortedOut) (
    await F.promise (visitsIn (at) (still)),
  )
  return {
    data: P.fromPairs (kept),
    routes: P.map (patternOf<C>) (still),
    refused,
  }
}

const asLoaded = (found: Json): F.Future<unknown, Loaded<Json>> =>
  F.resolve ({ tag: 'data', data: found, status: 200 })

const loadingFrom =
  <C extends Context>(data: Prebuilt) =>
  (own: Load<C, Json>) =>
  (ctx: C): F.Future<unknown, Loaded<Json>> =>
    P.maybe_ (() => own (ctx)) (asLoaded) (P.lookup (ctx.url.pathname) (data))

const swapped = <C extends Context>(
  data: Prebuilt,
): (route: PageRoute<C, Json>) => PageRoute<C, Json> =>
(route) => ({ ...route, load: loadingFrom<C> (data) (route.load) })

const prebuiltIn = <C extends Context>(data: Prebuilt) => (route: Route<C>): Route<C> =>
  P.cases<Route<C>, Route<C>> ({
    endpoint: P.I<Endpoint<C>>,
    page: (one) => P.onlyIf (one.still.on) (swapped<C> (data)) (one),
  }) (route)

/**
 * Routes that read what a build already read.
 * @example
 * ```ts
 * // prebuilt :: Prebuilt -> Routes s -> Array (Route s)
 * app ({ ...config, routes: prebuilt (read) (config.routes) })
 * ```
 */
export const prebuilt = <C extends Context = Context>(
  data: Prebuilt,
): (routes: Routes<C>) => readonly Route<C>[] =>
  P.pipe (flat, P.map (prebuiltIn<C> (data)))
