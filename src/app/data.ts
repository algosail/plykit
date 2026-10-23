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

const hasCaptures = <S, E>(route: Route<S, E>): boolean =>
  R.hasCaptures (route.pattern)

const whyNoPaths = <S, E>(route: Route<S, E>) => (): string =>
  `${route.pattern} — static: true, but the template has captures; ` +
  'paths says where the addresses come from'

const pathsOf = <S, E>(
  route: Route<S, E>,
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

const addressesFor = <S, E>(
  route: Route<S, E>,
): (all: readonly Params[]) => readonly string[] =>
  P.map (asAddress (route.pattern) (href (route.pattern)))

const capturedBy = <S, E>(route: Route<S, E>): F.Future<unknown, readonly string[]> =>
  P.map (addressesFor (route)) (pathsOf (route) ())

const itsPattern = <S, E>(route: Route<S, E>): F.Future<unknown, readonly string[]> =>
  F.resolve<unknown, readonly string[]> ([route.pattern])

const addressesIn = <S, E>(
  route: Route<S, E>,
): F.Future<unknown, readonly string[]> =>
  P.ifElse<Route<S, E>> (hasCaptures) (
    capturedBy,
  ) (
    itsPattern,
  ) (route)

/** Every address a static route stands for — its pattern, or what `paths` says. */
export const addressesOf = <S, E = unknown>(
  route: Route<S, E>,
): Promise<readonly string[]> => F.promise (addressesIn (route))

const isStill = <S, E>(route: Route<S, E>): route is PageRoute<Json, S, E> =>
  route.still.on && route.tag === 'page'

/** Pages whose data may be read ahead of time. */
export function stillPages<S, E = unknown>(
  routes: Routes<S, E>,
): readonly PageRoute<Json, S, E>[] {
  return P.filterMap (P.fromPredicate (isStill<S, E>)) (flat (routes))
}

/** What a build has to hand to read one address the way a server would. */
type Preparing<S, E> = {
  readonly point: (
    state: S,
  ) => (request: Request) => { readonly ctx: Context<S, E> }
  readonly state?: (request: Request) => F.Future<unknown, S>
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
  <S, E>(at: Preparing<S, E>) => (request: Request): F.Future<unknown, S> =>
    P.maybe_ (
      () => F.resolve (undefined as S),
    ) (
      P.T (request)<F.Future<unknown, S>>,
    ) (P.fromNullable (at.state))

const contextAt =
  <S, E>(at: Preparing<S, E>) => (request: Request) => (state: S): Context<S, E> =>
    at.point (state) (request).ctx

const loadedIn =
  <S, E>(at: Preparing<S, E>) =>
  (route: PageRoute<Json, S, E>) =>
  (request: Request): F.Future<unknown, Loaded<Json>> =>
    P.chain (P.pipe ([contextAt (at) (request), route.load])) (stateFor (at) (request))

const visiting =
  <S, E>(at: Preparing<S, E>) =>
  (route: PageRoute<Json, S, E>) =>
  (path: string): F.Future<unknown, Visit> =>
    P.map (asVisit (path)) (loadedIn (at) (route) (asRequest (path)))

const visitsTo =
  <S, E>(at: Preparing<S, E>) =>
  (route: PageRoute<Json, S, E>): F.Future<unknown, readonly Visit[]> =>
    P.chain ((paths: readonly string[]) =>
      F.parallel (1) (P.map (visiting (at) (route)) (paths)),
    ) (addressesIn (route))

const flattened = (all: readonly (readonly Visit[])[]): readonly Visit[] =>
  P.join (all)

const visitsIn = <S, E>(at: Preparing<S, E>) =>
(
  routes: readonly PageRoute<Json, S, E>[],
): F.Future<unknown, readonly Visit[]> =>
  P.map (flattened) (F.parallel (1) (P.map (visitsTo (at)) (routes)))

const sortedOut = (one: Visit): P.Either<string, P.Pair<string, Json>> =>
  P.cases<Loaded<Json>, P.Either<string, P.Pair<string, Json>>> ({
    data: (said) => P.right (P.pair (one.path, said.data)),
    redirect: P.K (P.left<string, P.Pair<string, Json>> (one.path)),
    failure: P.K (P.left<string, P.Pair<string, Json>> (one.path)),
  }) (one.said)

const patternOf = <S, E>(route: PageRoute<Json, S, E>): string => route.pattern

/**
 * Reads every static page's data, once, and hands back what it read by address.
 * @example
 * ```ts
 * // prepare :: Routes s -> Prepare s -> Promise Prepared
 * const ready = await prepare (config.routes, config)
 * ready.data['/blog/hello']
 * ```
 */
export async function prepare<S = unknown, E = unknown>(
  routes: Routes<S, E>,
  options: { readonly state?: (request: Request) => F.Future<unknown, S> } = {},
): Promise<Prepared> {
  const still = stillPages (routes)
  const at: Preparing<S, E> = { point: aim (table (routes)), state: options.state }
  const [refused, kept] = P.partitionMap (sortedOut) (
    await F.promise (visitsIn (at) (still)),
  )
  return {
    data: P.fromPairs (kept),
    routes: P.map (patternOf<S, E>) (still),
    refused,
  }
}

const asLoaded = (found: Json): F.Future<unknown, Loaded<Json>> =>
  F.resolve ({ tag: 'data', data: found, status: 200 })

const loadingFrom =
  <S, E>(data: Prebuilt) =>
  (own: Load<Json, S, E>) =>
  (ctx: Context<S, E>): F.Future<unknown, Loaded<Json>> =>
    P.maybe_ (() => own (ctx)) (asLoaded) (P.lookup (ctx.url.pathname) (data))

const swapped = <S, E>(
  data: Prebuilt,
): (route: PageRoute<Json, S, E>) => PageRoute<Json, S, E> =>
(route) => ({ ...route, load: loadingFrom<S, E> (data) (route.load) })

const prebuiltIn = <S, E>(data: Prebuilt) => (route: Route<S, E>): Route<S, E> =>
  P.cases<Route<S, E>, Route<S, E>> ({
    endpoint: P.I<Endpoint<S, E>>,
    page: (one) => P.onlyIf (one.still.on) (swapped<S, E> (data)) (one),
  }) (route)

/**
 * Routes that read what a build already read.
 * @example
 * ```ts
 * // prebuilt :: Prebuilt -> Routes s -> Array (Route s)
 * app ({ ...config, routes: prebuilt (read) (config.routes) })
 * ```
 */
export const prebuilt = <S = unknown, E = unknown>(
  data: Prebuilt,
): (routes: Routes<S, E>) => readonly Route<S, E>[] =>
  P.pipe ([flat, P.map (prebuiltIn<S, E> (data))])
