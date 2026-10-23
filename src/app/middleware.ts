import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type {
  Answering,
  Context,
  Method,
  Middleware,
  Reply,
  Route,
  Routes,
  Sent,
} from './types.ts'
import * as Rp from './reply.ts'
import { flat } from './router.ts'
import { digest } from './sign.ts'

/**
 * Several middlewares as one.
 * @example
 * ```ts
 * // stack :: Array (Middleware s) -> Middleware s
 * const security = stack ([cors, noStore])
 * await app ({ routes, state, through: [logging, security], islands })
 * // => logging wraps cors wraps noStore wraps the app
 * ```
 */
export function stack<C extends Context = Context>(
  middlewares: readonly Middleware<C>[],
): Middleware<C> {
  return P.pipe (P.reverse (middlewares)) as Middleware<C>
}

/**
 * Narrows a middleware to the requests it is for.
 * @example
 * ```ts
 * // when :: (Context -> Boolean) -> Middleware s -> Middleware s
 * when ((ctx) => startsWith ('/api') (ctx.url.pathname)) (cors)
 * // => a middleware that only the API sees
 * ```
 */
export function when(
  claims: (ctx: Context<unknown>) => boolean,
): <C extends Context>(middleware: Middleware<C>) => Middleware<C> {
  return <C extends Context>(middleware: Middleware<C>): Middleware<C> =>
  (next: Answering<C>): Answering<C> =>
    P.ifElse<C> (claims) (middleware (next)) (
      next,
    )
}

const idOf = <C extends Context>(route: Route<C>): string => route.id

const idsIn = <C extends Context>(routes: Routes<C> | Route<C>): Set<string> =>
  P.setFromIterable (P.map (idOf<C>) (flat (routes)))

const isAmong = (claimed: Set<string>) => (ctx: Context<unknown>): boolean =>
  P.setMember (ctx.routeId) (claimed)

/**
 * Narrows a middleware to particular routes — the routes themselves, not a pattern spelled out a second time.
 * @example
 * ```ts
 * // only :: Routes s -> Middleware s -> Middleware s
 * only ([dashboard, settings]) (auth)
 * // => a middleware that those two routes answer through, and nobody else
 * only (checkout) (rateLimit)
 * // => the same for a single route, without a list around it
 * ```
 */
export function only<C extends Context = Context>(
  routes: Routes<C> | Route<C>,
): (middleware: Middleware<C>) => Middleware<C> {
  return P.pipe ([idsIn<C>, isAmong, when]) (routes)
}

/**
 * A middleware that changes the answer knowing what was asked.
 * @example
 * ```ts
 * // around :: (Context s -> Reply -> Reply) -> Middleware s
 * around ((ctx) => header ('x-path') (ctx.url.pathname))
 * // => a middleware that answers with the path it answered for
 * ```
 */
export function around<C extends Context = Context>(
  change: (ctx: C) => (reply: Reply) => Reply,
): Middleware<C> {
  return (next: Answering<C>): Answering<C> => (ctx: C) => {
    const onReply = change (ctx)
    return P.map (onReply) (next (ctx))
  }
}

/**
 * A middleware that changes the answer and nothing else.
 * @example
 * ```ts
 * // after :: (Reply -> Reply) -> Middleware s
 * after (headers ({ 'x-frame-options': 'DENY' }))
 * // => a middleware that says it on every answer
 * ```
 */
export function after<C extends Context = Context>(change: (reply: Reply) => Reply): Middleware<C> {
  return around<C> (P.K (change))
}

/**
 * A middleware that looks and changes nothing: it is handed the context on the way in and gives back what to do with the reply on the way out.
 * @example
 * ```ts
 * // watch :: (Context s -> Reply -> ()) -> Middleware s
 * watch ((ctx) => {
 *   const started = performance.now ()
 *   return (reply) => console.log (ctx.url.pathname, performance.now () - started)
 * })
 * // => a middleware that times every answer and changes none
 * ```
 */
export function watch<C extends Context = Context>(
  look: (ctx: C) => (reply: Reply) => void,
): Middleware<C> {
  return around<C> ((ctx: C) => P.tap (look (ctx)))
}

/**
 * A middleware that changes the context the rest of the app sees, and nothing else.
 * @example
 * ```ts
 * // before :: (Context s -> Context s) -> Middleware s
 * before ((ctx) => ({ ...ctx, state: { ...ctx.state, at: now () } }))
 * // => a middleware every load and view sees the result of
 * ```
 */
export function before<C extends Context = Context>(
  change: (ctx: C) => C,
): Middleware<C> {
  return (next: Answering<C>): Answering<C> => P.pipe ([change, next])
}

/** Who may call this from another site, and with what. */
export type CorsOptions = {
  /** Which origin is allowed. */
  readonly origin?: string
  readonly methods?: readonly Method[]
  readonly headers?: readonly string[]
  /** Whether the browser may send cookies. */
  readonly credentials?: boolean
  /** How long a preflight answer may be kept, in seconds. */
  readonly maxAge?: number
}

/** Nothing to say, said as headers: the empty record these fold into. */
const nothingSaid: Readonly<P.StrMap<string>> = {}

const listing = (names: readonly string[]): string => P.joinWith (', ') (names)

const credentialsIn = (
  options: CorsOptions,
): Readonly<P.StrMap<string>> =>
  P.boolean (nothingSaid) ({ 'access-control-allow-credentials': 'true' }) (
    options.credentials === true,
  )

const maxAgeIn = (options: CorsOptions): Readonly<P.StrMap<string>> =>
  P.maybe_ (
    P.K (nothingSaid),
  ) (
    (seconds: number) => ({ 'access-control-max-age': String (seconds) }),
  ) (P.fromNullable (options.maxAge))

const methodsIn = (options: CorsOptions): readonly string[] =>
  P.append<string> ('OPTIONS') (
    P.defaultTo<readonly Method[]> (['GET', 'POST']) (options.methods),
  )

const allowingOf = (options: CorsOptions): Readonly<P.StrMap<string>> =>
  P.mconcat (P.RightUnion<string> ()) ([
    {
      'access-control-allow-origin': P.defaultTo ('*') (options.origin),
      'access-control-allow-methods': listing (methodsIn (options)),
      'access-control-allow-headers': listing (
        P.defaultTo<readonly string[]> (['content-type']) (options.headers),
      ),
    },
    credentialsIn (options),
    maxAgeIn (options),
  ])

const isForEverybody = (options: CorsOptions): boolean =>
  options.origin === undefined || options.origin === '*'

const isPreflight = (ctx: Context<unknown>): boolean =>
  ctx.request.method === 'OPTIONS'

/**
 * Says who may call this from another origin, and answers the question the browser asks first.
 * @example
 * ```ts
 * // cors :: CorsOptions -> Middleware s
 * whenRequest ((ctx) => startsWith ('/api/') (ctx.url.pathname)) (cors ())
 * ```
 */
export function cors<C extends Context = Context>(options: CorsOptions = {}): Middleware<C> {
  const dressed: (reply: Reply) => Reply = P.pipe ([
    Rp.headers (allowingOf (options)),
    P.onlyIf (!isForEverybody (options)) (Rp.vary ('origin')),
  ])

  return (next: Answering<C>): Answering<C> =>
    P.ifElse<C> (isPreflight) (
      P.K (F.resolve (dressed (Rp.noContent ()))),
    ) ((ctx: C) => P.map (dressed) (next (ctx)))
}

const tagOf = (body: string): F.Future<unknown, string> =>
  P.map ((sum: string) => `"${sum.slice (0, 11)}"`) (digest (body))

/** A reply a tag can be made of: a page, drawn, that came out whole. */
type Drawn = Sent & { readonly body: string }

const isDrawn = (reply: Reply): reply is Drawn =>
  reply.tag === 'sent' && reply.status === 200 &&
  typeof reply.body === 'string'

const isAsking = (ctx: Context<unknown>): boolean =>
  ctx.request.method === 'GET' || ctx.request.method === 'HEAD'

const hasAlready = (ctx: Context<unknown>) => (tag: string): boolean =>
  ctx.request.headers.get ('if-none-match') === tag

const carriesCookie = (ctx: Context<unknown>): boolean =>
  ctx.request.headers.get ('cookie') !== null

const stamped = (tag: string): (reply: Sent) => Sent =>
  P.modify ('headers') (P.insert ('etag') (tag))

const emptied: (reply: Sent) => Sent = P.pipe ([
  P.set ('status') (304),
  P.set ('body') (null),
])

const answeredWith =
  (ctx: Context<unknown>) => (reply: Drawn) => (tag: string): Reply =>
    P.pipe ([
      stamped (tag),
      P.onlyIf (hasAlready (ctx) (tag)) (emptied),
      P.onlyIf (carriesCookie (ctx)) (Rp.vary ('cookie')<Sent>),
    ]) (reply)

/**
 * Answers a page the browser already has with 304 and no body.
 * @example
 * ```ts
 * // etag :: () -> Middleware s
 * app ({ routes, through: [etag (), ...through] })
 * ```
 */
export function etag<C extends Context = Context>(): Middleware<C> {
  const tagging =
    (ctx: Context<unknown>) => (reply: Reply): F.Future<unknown, Reply> =>
      P.maybe_ (
        P.K (F.resolve (reply)),
      ) (
        (drawn: Drawn) => P.map (answeredWith (ctx) (drawn)) (tagOf (drawn.body)),
      ) (P.fromPredicate (isDrawn) (reply))

  return (next: Answering<C>): Answering<C> =>
    P.ifElse<C> (isAsking) (
      (ctx: C) => P.chain (tagging (ctx)) (next (ctx)),
    ) (next)
}

/** What a page is allowed to load, by source. */
export type CspOptions = {
  /** The policy, directive by directive. */
  readonly directives?: Readonly<P.StrMap<string>>
  /** Report without enforcing — the header a rollout starts with. */
  readonly reportOnly?: boolean
}

const OWN: Readonly<P.StrMap<string>> = {
  'default-src': "'self'",
  'base-uri': "'self'",
  'frame-ancestors': "'none'",
  'object-src': "'none'",
}

const asDirective = (one: P.Pair<string, string>): string =>
  `${one.fst} ${one.snd}`

const policyOf: (said: Readonly<P.StrMap<string>>) => string = P.pipe ([
  P.sortedPairs,
  P.map (asDirective),
  P.joinWith ('; '),
])

const fieldOf: (reportOnly: boolean) => string = P.boolean (
  'content-security-policy',
) ('content-security-policy-report-only')

/**
 * Says what a page may load.
 * @example
 * ```ts
 * // csp :: CspOptions -> Middleware s
 * app ({ routes, through: [csp (), ...through] })
 * app ({ routes, through: [csp ({ directives: { 'img-src': "'self' data:" } })] })
 * ```
 */
export function csp<C extends Context = Context>(options: CspOptions = {}): Middleware<C> {
  const said = P.concat (OWN) (P.defaultTo (nothingSaid) (options.directives))
  return after (
    Rp.header (fieldOf (options.reportOnly === true)) (policyOf (said)),
  )
}

/** Which shape of path is the real one. */
export type SlashOptions = { readonly trailing?: boolean }

const isRoot = (path: string): boolean => path === '/'

const hasSlash = (path: string): boolean =>
  path.length > 1 && path.endsWith ('/')

const respelled = (path: string): string =>
  P.boolean (`${path}/`) (path.slice (0, -1)) (hasSlash (path))

const isSpelledRight = (wanted: boolean) => (ctx: Context<unknown>): boolean =>
  isRoot (ctx.url.pathname) || hasSlash (ctx.url.pathname) === wanted

/**
 * Sends every path to its one spelling, so `/blog` and `/blog/` are not two pages to a cache, a log or a search engine.
 * @example
 * ```ts
 * // trailingSlash :: SlashOptions -> Middleware s
 * app ({ routes, through: [trailingSlash ({ trailing: false })] })
 * ```
 */
export function trailingSlash<C extends Context = Context>(
  options: SlashOptions = {},
): Middleware<C> {
  const wanted = P.defaultTo (false) (options.trailing)
  const sendOn = (ctx: C): F.Future<unknown, Reply> =>
    F.resolve (
      Rp.redirect (`${respelled (ctx.url.pathname)}${ctx.url.search}`, 308),
    )

  return (next: Answering<C>): Answering<C> =>
    P.ifElse<C> (isSpelledRight (wanted)) (
      next,
    ) (sendOn)
}

/**
 * Answers instead of the route: the reply is the one given, `next` is never called, and nothing under this middleware runs.
 * @example
 * ```ts
 * // instead :: (Context s -> Reply) -> Middleware s
 * const ours = (ctx: Context<unknown>) =>
 *   fromMaybe (false) (map (elem (allowed)) (ctx.client))
 * app ({ routes, through: [when (not (ours)) (instead (() => failed (403) ('none')))] })
 * ```
 */
export function instead<C extends Context = Context>(
  reply: (ctx: C) => Reply,
): Middleware<C> {
  return (_next: Answering<C>): Answering<C> => P.pipe ([reply, F.resolve])
}
