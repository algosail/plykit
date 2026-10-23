import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type {
  Arrival,
  Chrome,
  Context,
  Json,
  Loaded,
  PageHandler,
  PageRoute,
  Params,
  Reply,
  Route,
} from './types.ts'
import { localLive } from './events.ts'
import * as Rp from './reply.ts'
import * as Rt from './router.ts'
import { HttpError, messageOf } from './types.ts'

/** A page, what it loaded, and the request it answers. */
export type Resolved<S = unknown, E = unknown> = {
  readonly route: PageRoute<Json, S, E>
  readonly ctx: Context<S, E>
  readonly data: Json
  /** What each layout read, outermost first — one entry per layout. */
  readonly layoutData: readonly Json[]
  readonly status: number
}

/** Where a request is pointed, and at what — before anything has run. */
export type Aimed<S = unknown, E = unknown> = {
  readonly ctx: Context<S, E>
  readonly route: P.Maybe<Route<S, E>>
}

/** The two ways answering can end: a page still to be drawn, or a reply that is already what goes on the wire. */
export type Outcome<S = unknown, E = unknown> =
  | { readonly tag: 'resolved'; readonly resolved: Resolved<S, E> }
  | { readonly tag: 'replied'; readonly reply: Reply }

const RENDERED = ['GET', 'HEAD']

const replied = <S, E>(reply: Reply): Outcome<S, E> => ({ tag: 'replied', reply })

const refused = <S, E>(error: HttpError): Outcome<S, E> =>
  replied ({ tag: 'failure', error, headers: {}, cookies: [] })

const isHttpError = (err: unknown): err is HttpError => err instanceof HttpError

const asHttpError = (err: unknown): HttpError =>
  P.maybe_ (
    () => new HttpError (500, messageOf (err)),
  ) (
    P.I<HttpError>,
  ) (P.fromPredicate (isHttpError) (err))

/** A request and the route that claims it. */
type Asked<S, E, R = Route<S, E>> = {
  readonly ctx: Context<S, E>
  readonly route: R
}

/** The same, narrowed to the one kind of route that draws. */
type Page<S, E> = Asked<S, E, PageRoute<Json, S, E>>

const asPage =
  <S, E>(ctx: Context<S, E>) => (route: PageRoute<Json, S, E>): Page<S, E> => ({
    ctx,
    route,
  })

const HEAD_THEN_GET = ['HEAD', 'GET']

const triedBy = <S, E>(at: Asked<S, E>): readonly string[] =>
  P.boolean<readonly string[]> ([at.ctx.request.method]) (HEAD_THEN_GET) (
    at.ctx.request.method === 'HEAD' && at.route.tag === 'page',
  )

const handlerIn = <S, E>(at: Asked<S, E>): P.Maybe<PageHandler<Json, S, E>> =>
  P.findMap ((method: string) =>
    P.lookup (method) (at.route.on as Readonly<P.StrMap<PageHandler<Json, S, E>>>),
  ) (triedBy (at))

const renderedBy = <S, E>(route: Route<S, E>): readonly string[] =>
  P.cases<Route<S, E>, readonly string[]> ({
    page: P.K (RENDERED),
    endpoint: P.K<readonly string[]> ([]),
  }) (route)

const allows = <S, E>(route: Route<S, E>): readonly string[] =>
  P.sort (P.nub (P.concat (P.sortedKeys (route.on)) (renderedBy (route))))

/** What a page read, and what the chrome around it read — apart. */
type Read = {
  readonly layouts: readonly Loaded<Json>[]
  readonly page: Loaded<Json>
}

const layoutLoads = <S, E>(
  at: Page<S, E>,
): readonly F.Future<unknown, Loaded<Json>>[] =>
  P.map ((one: Chrome<S, E>) => one.load (at.ctx)) (at.route.layouts)

const loadLayouts = <S, E>(
  at: Page<S, E>,
): F.Future<unknown, readonly Loaded<Json>[]> =>
  F.parallel (Number.POSITIVE_INFINITY) (layoutLoads (at))

const loadAll = <S, E>(at: Page<S, E>): F.Future<unknown, Read> =>
  P.ap (
    P.map ((layouts: readonly Loaded<Json>[]) => (page: Loaded<Json>): Read => ({
      layouts,
      page,
    })) (loadLayouts (at)),
  ) (at.route.load (at.ctx))

const everythingIn = (read: Read): readonly Loaded<Json>[] =>
  P.append (read.page) (read.layouts)

const asRefusal = (one: Reply): P.Maybe<Reply> => P.just (one)

const refusalIn = P.findMap (
  P.cases<Loaded<Json>, P.Maybe<Reply>> ({
    data: P.K (P.nothing<Reply> ()),
    redirect: asRefusal,
    failure: asRefusal,
  }),
)

const dataOf = P.cases<Loaded<Json>, Json> ({
  data: (one) => one.data,
  redirect: P.K<Json> ({}),
  failure: P.K<Json> ({}),
})

const statusOf = P.cases<Loaded<Json>, number> ({
  data: (one) => one.status,
  redirect: P.K (200),
  failure: P.K (200),
})

const asResolved = <S, E>(at: Page<S, E>) => (read: Read): Outcome<S, E> => ({
  tag: 'resolved',
  resolved: {
    route: at.route,
    ctx: at.ctx,
    data: dataOf (read.page),
    layoutData: P.map (dataOf) (read.layouts),
    status: statusOf (read.page),
  },
})

const drawn = <S, E>(at: Page<S, E>) => (read: Read): Outcome<S, E> =>
  P.maybe_ (
    () => asResolved (at) (read),
  ) (
    replied<S, E>,
  ) (refusalIn (everythingIn (read)))

const asRefused = <S, E>(err: unknown): F.Future<unknown, Outcome<S, E>> =>
  F.resolve (refused<S, E> (asHttpError (err)))

const attempted = <A>(
  produce: () => F.Future<unknown, A>,
): F.Future<unknown, P.Either<unknown, A>> =>
  F.coalesce (P.left<unknown, A>) (P.right<unknown, A>) (
    F.attemptP (() => F.promise (produce ())),
  )

const outcomeOf = <A, S, E>(
  onOk: (a: A) => F.Future<unknown, Outcome<S, E>>,
): (produce: () => F.Future<unknown, A>) => F.Future<unknown, Outcome<S, E>> =>
  P.pipe ([attempted, P.chain (P.either (asRefused<S, E>) (onOk))])

const notAllowed = <S, E>(at: Asked<S, E>): F.Future<unknown, Outcome<S, E>> =>
  F.resolve (replied<S, E> (
    Rp.headers ({ allow: P.joinWith (', ') (allows (at.route)) }) (
      Rp.failed (405) (
        `${at.ctx.request.method} not allowed at ${at.route.pattern}`,
      ),
    ),
  ))

const drawing = <S, E>(at: Page<S, E>): F.Future<unknown, Outcome<S, E>> =>
  outcomeOf ((read: Read) => F.resolve (drawn (at) (read))) (() => loadAll (at))

const unhandled = <S, E>(at: Asked<S, E>): F.Future<unknown, Outcome<S, E>> =>
  P.cases<Route<S, E>, F.Future<unknown, Outcome<S, E>>> ({
    page: P.pipe ([
      asPage (at.ctx),
      P.boolean<(one: Page<S, E>) => F.Future<unknown, Outcome<S, E>>> (notAllowed) (
        drawing,
      ) (
        P.elem (at.ctx.request.method) (RENDERED),
      ),
    ]),
    endpoint: () => notAllowed (at),
  }) (at.route)

const asReplied = <S, E>(one: Reply): F.Future<unknown, Outcome<S, E>> =>
  F.resolve (replied<S, E> (one))

const drawnWith =
  <S, E>(said: Loaded<Json>) => (at: Page<S, E>): F.Future<unknown, Outcome<S, E>> =>
    P.map ((layouts: readonly Loaded<Json>[]) =>
      drawn (at) ({ layouts, page: said }),
    ) (loadLayouts (at))

const noPageToDraw = <S, E>(): F.Future<unknown, Outcome<S, E>> =>
  F.resolve (refused<S, E> (
    new HttpError (500, 'an endpoint answered with page data'),
  ))

const fromSaid = <S, E>(
  at: Asked<S, E>,
): (said: Reply | Loaded<Json>) => F.Future<unknown, Outcome<S, E>> =>
  P.cases<Reply | Loaded<Json>, F.Future<unknown, Outcome<S, E>>> ({
    sent: asReplied,
    redirect: asReplied,
    failure: asReplied,
    data: (said) =>
      P.cases<Route<S, E>, F.Future<unknown, Outcome<S, E>>> ({
        page: P.pipe ([asPage (at.ctx), drawnWith (said)]),
        endpoint: noPageToDraw<S, E>,
      }) (at.route),
  })

const viaHandler =
  <S, E>(at: Asked<S, E>) =>
  (handler: PageHandler<Json, S, E>): F.Future<unknown, Outcome<S, E>> =>
    outcomeOf (fromSaid (at)) (() => handler (at.ctx))

const forRoute = <S, E>(at: Asked<S, E>): F.Future<unknown, Outcome<S, E>> =>
  P.maybe_ (() => unhandled (at)) (viaHandler (at)) (handlerIn (at))

const paramsOf = <S, E>(hit: P.Maybe<Rt.Match<S, E>>): Params =>
  P.maybe_ (P.K<Params> ({})) ((one: Rt.Match<S, E>) => one.params) (hit)

const routeIdOf = <S, E>(hit: P.Maybe<Rt.Match<S, E>>): string =>
  P.maybe_ (P.K ('')) ((one: Rt.Match<S, E>) => one.route.id) (hit)

/**
 * The context a route sees: the request, its state, and what the host passed along.
 * @example
 * ```ts
 * contextOf (request, state, arrival, { slug: 'hello' }, '/blog/:slug')
 * ```
 */
export const contextOf = <S, E>(
  request: Request,
  state: S,
  from: Arrival<E> | undefined,
  params: Params,
  routeId: string,
): Context<S, E> => ({
  url: new URL (request.url),
  params,
  request,
  routeId,
  state,
  env: (from?.env ?? undefined) as E,
  live: from?.live ?? localLive,
  client: P.fromNullable (from?.remoteAddr?.hostname),
})

/**
 * Points a request at a route: builds the context every function will be handed and says what claims the path, if anything does.
 * @example
 * ```ts
 * // aim :: Table s -> s -> Request -> Aimed s
 * aim (routes) (state) (new Request ('http://x/blog/hello')).ctx.params
 * // => { slug: 'hello' }
 * ```
 */
export function aim<S, E = unknown>(
  table: Rt.Table<S, E>,
): (state: S) => (request: Request, from?: Arrival<E>) => Aimed<S, E> {
  return (state: S) =>
  (request: Request, from?: Arrival<E>): Aimed<S, E> => {
    const hit = Rt.lookup (table) (new URL (request.url).pathname)
    return {
      ctx: contextOf (request, state, from, paramsOf (hit), routeIdOf (hit)),
      route: P.map ((one: Rt.Match<S, E>) => one.route) (hit),
    }
  }
}

/**
 * Asks a route to answer the request its context describes: whichever of its functions claims the method runs, and what comes back is a page to draw or a reply.
 * @example
 * ```ts
 * // run :: Maybe (Route s) -> Context s -> Task (Outcome s)
 * await run (aimed.route) (aimed.ctx)
 * // => { tag: 'resolved', resolved: { … } }
 * ```
 */
export function run<S, E = unknown>(
  route: P.Maybe<Route<S, E>>,
): (ctx: Context<S, E>) => F.Future<unknown, Outcome<S, E>> {
  return (ctx: Context<S, E>): F.Future<unknown, Outcome<S, E>> =>
    P.maybe_ (
      () =>
        F.resolve (refused<S, E> (
          new HttpError (404, `no route matches ${ctx.url.pathname}`),
        )),
    ) (
      (one: Route<S, E>) => forRoute ({ ctx, route: one }),
    ) (route)
}
