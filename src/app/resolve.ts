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
export type Resolved<C extends Context = Context> = {
  readonly route: PageRoute<C, Json>
  readonly ctx: C
  readonly data: Json
  /** What each layout read, outermost first — one entry per layout. */
  readonly layoutData: readonly Json[]
  readonly status: number
}

/** Where a request is pointed, and at what — before anything has run. */
export type Aimed<C extends Context = Context> = {
  readonly ctx: C
  readonly route: P.Maybe<Route<C>>
}

/** The two ways answering can end: a page still to be drawn, or a reply that is already what goes on the wire. */
export type Outcome<C extends Context = Context> =
  | { readonly tag: 'resolved'; readonly resolved: Resolved<C> }
  | { readonly tag: 'replied'; readonly reply: Reply }

const RENDERED = ['GET', 'HEAD']

const replied = <C extends Context>(reply: Reply): Outcome<C> => ({ tag: 'replied', reply })

const refused = <C extends Context>(error: HttpError): Outcome<C> =>
  replied ({ tag: 'failure', error, headers: {}, cookies: [] })

const isHttpError = (err: unknown): err is HttpError => err instanceof HttpError

const asHttpError = (err: unknown): HttpError =>
  P.maybe_ (
    () => new HttpError (500, messageOf (err)),
  ) (
    P.I<HttpError>,
  ) (P.fromPredicate (isHttpError) (err))

/** A request and the route that claims it. */
type Asked<C extends Context, R = Route<C>> = {
  readonly ctx: C
  readonly route: R
}

/** The same, narrowed to the one kind of route that draws. */
type Page<C extends Context> = Asked<C, PageRoute<C, Json>>

const asPage =
  <C extends Context>(ctx: C) => (route: PageRoute<C, Json>): Page<C> => ({
    ctx,
    route,
  })

const HEAD_THEN_GET = ['HEAD', 'GET']

const triedBy = <C extends Context>(at: Asked<C>): readonly string[] =>
  P.boolean<readonly string[]> ([at.ctx.request.method]) (HEAD_THEN_GET) (
    at.ctx.request.method === 'HEAD' && at.route.tag === 'page',
  )

const handlerIn = <C extends Context>(at: Asked<C>): P.Maybe<PageHandler<C, Json>> =>
  P.findMap ((method: string) =>
    P.lookup (method) (at.route.on as Readonly<P.StrMap<PageHandler<C, Json>>>),
  ) (triedBy (at))

const renderedBy = <C extends Context>(route: Route<C>): readonly string[] =>
  P.cases<Route<C>, readonly string[]> ({
    page: P.K (RENDERED),
    endpoint: P.K<readonly string[]> ([]),
  }) (route)

const allows = <C extends Context>(route: Route<C>): readonly string[] =>
  P.sort (P.nub (P.concat (P.sortedKeys (route.on)) (renderedBy (route))))

/** What a page read, and what the chrome around it read — apart. */
type Read = {
  readonly layouts: readonly Loaded<Json>[]
  readonly page: Loaded<Json>
}

const layoutLoads = <C extends Context>(
  at: Page<C>,
): readonly F.Future<unknown, Loaded<Json>>[] =>
  P.map ((one: Chrome<C>) => one.load (at.ctx)) (at.route.layouts)

const loadLayouts = <C extends Context>(
  at: Page<C>,
): F.Future<unknown, readonly Loaded<Json>[]> =>
  F.parallel (Number.POSITIVE_INFINITY) (layoutLoads (at))

const loadAll = <C extends Context>(at: Page<C>): F.Future<unknown, Read> =>
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

const asResolved = <C extends Context>(at: Page<C>) => (read: Read): Outcome<C> => ({
  tag: 'resolved',
  resolved: {
    route: at.route,
    ctx: at.ctx,
    data: dataOf (read.page),
    layoutData: P.map (dataOf) (read.layouts),
    status: statusOf (read.page),
  },
})

const drawn = <C extends Context>(at: Page<C>) => (read: Read): Outcome<C> =>
  P.maybe_ (
    () => asResolved (at) (read),
  ) (
    replied<C>,
  ) (refusalIn (everythingIn (read)))

const asRefused = <C extends Context>(err: unknown): F.Future<unknown, Outcome<C>> =>
  F.resolve (refused<C> (asHttpError (err)))

const attempted = <A>(
  produce: () => F.Future<unknown, A>,
): F.Future<unknown, P.Either<unknown, A>> =>
  F.coalesce (P.left<unknown, A>) (P.right<unknown, A>) (
    F.attemptP (() => F.promise (produce ())),
  )

const outcomeOf = <A, C extends Context>(
  onOk: (a: A) => F.Future<unknown, Outcome<C>>,
): (produce: () => F.Future<unknown, A>) => F.Future<unknown, Outcome<C>> =>
  P.pipe (attempted, P.chain (P.either (asRefused<C>) (onOk)))

const notAllowed = <C extends Context>(at: Asked<C>): F.Future<unknown, Outcome<C>> =>
  F.resolve (replied<C> (
    Rp.headers ({ allow: P.joinWith (', ') (allows (at.route)) }) (
      Rp.failed (405) (
        `${at.ctx.request.method} not allowed at ${at.route.pattern}`,
      ),
    ),
  ))

const drawing = <C extends Context>(at: Page<C>): F.Future<unknown, Outcome<C>> =>
  outcomeOf ((read: Read) => F.resolve (drawn (at) (read))) (() => loadAll (at))

const unhandled = <C extends Context>(at: Asked<C>): F.Future<unknown, Outcome<C>> =>
  P.cases<Route<C>, F.Future<unknown, Outcome<C>>> ({
    page: P.pipe (
      asPage (at.ctx),
      P.boolean<(one: Page<C>) => F.Future<unknown, Outcome<C>>> (notAllowed) (
        drawing,
      ) (
        P.elem (at.ctx.request.method) (RENDERED),
      ),
    ),
    endpoint: () => notAllowed (at),
  }) (at.route)

const asReplied = <C extends Context>(one: Reply): F.Future<unknown, Outcome<C>> =>
  F.resolve (replied<C> (one))

const drawnWith =
  <C extends Context>(said: Loaded<Json>) => (at: Page<C>): F.Future<unknown, Outcome<C>> =>
    P.map ((layouts: readonly Loaded<Json>[]) =>
      drawn (at) ({ layouts, page: said }),
    ) (loadLayouts (at))

const noPageToDraw = <C extends Context>(): F.Future<unknown, Outcome<C>> =>
  F.resolve (refused<C> (
    new HttpError (500, 'an endpoint answered with page data'),
  ))

const fromSaid = <C extends Context>(
  at: Asked<C>,
): (said: Reply | Loaded<Json>) => F.Future<unknown, Outcome<C>> =>
  P.cases<Reply | Loaded<Json>, F.Future<unknown, Outcome<C>>> ({
    sent: asReplied,
    redirect: asReplied,
    failure: asReplied,
    data: (said) =>
      P.cases<Route<C>, F.Future<unknown, Outcome<C>>> ({
        page: P.pipe (asPage (at.ctx), drawnWith (said)),
        endpoint: noPageToDraw<C>,
      }) (at.route),
  })

const viaHandler =
  <C extends Context>(at: Asked<C>) =>
  (handler: PageHandler<C, Json>): F.Future<unknown, Outcome<C>> =>
    outcomeOf (fromSaid (at)) (() => handler (at.ctx))

const forRoute = <C extends Context>(at: Asked<C>): F.Future<unknown, Outcome<C>> =>
  P.maybe_ (() => unhandled (at)) (viaHandler (at)) (handlerIn (at))

const paramsOf = <C extends Context>(hit: P.Maybe<Rt.Match<C>>): Params =>
  P.maybe_ (P.K<Params> ({})) ((one: Rt.Match<C>) => one.params) (hit)

const routeIdOf = <C extends Context>(hit: P.Maybe<Rt.Match<C>>): string =>
  P.maybe_ (P.K ('')) ((one: Rt.Match<C>) => one.route.id) (hit)

/**
 * The context a route sees: the request, its state, and what the host passed along.
 * @example
 * ```ts
 * contextOf (request, state, arrival, { slug: 'hello' }, '/blog/:slug')
 * ```
 */
export const contextOf = <C extends Context>(
  request: Request,
  state: C['state'],
  from: Arrival<C['env']> | undefined,
  params: Params,
  routeId: string,
): C => ({
  url: new URL (request.url),
  params,
  request,
  routeId,
  state,
  env: (from?.env ?? undefined) as C['env'],
  live: from?.live ?? localLive,
  client: P.fromNullable (from?.remoteAddr?.hostname),
} as C)

/**
 * Points a request at a route: builds the context every function will be handed and says what claims the path, if anything does.
 * @example
 * ```ts
 * // aim :: Table s -> s -> Request -> Aimed s
 * aim (routes) (state) (new Request ('http://x/blog/hello')).ctx.params
 * // => { slug: 'hello' }
 * ```
 */
export function aim<C extends Context = Context>(
  table: Rt.Table<C>,
): (state: C['state']) => (request: Request, from?: Arrival<C['env']>) => Aimed<C> {
  return (state: C['state']) =>
  (request: Request, from?: Arrival<C['env']>): Aimed<C> => {
    const hit = Rt.lookup (table) (new URL (request.url).pathname)
    return {
      ctx: contextOf (request, state, from, paramsOf (hit), routeIdOf (hit)),
      route: P.map ((one: Rt.Match<C>) => one.route) (hit),
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
export function run<C extends Context = Context>(
  route: P.Maybe<Route<C>>,
): (ctx: C) => F.Future<unknown, Outcome<C>> {
  return (ctx: C): F.Future<unknown, Outcome<C>> =>
    P.maybe_ (
      () =>
        F.resolve (refused<C> (
          new HttpError (404, `no route matches ${ctx.url.pathname}`),
        )),
    ) (
      (one: Route<C>) => forRoute ({ ctx, route: one }),
    ) (route)
}
