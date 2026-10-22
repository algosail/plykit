import * as P from '@algosail/ply'
import * as D from '@algosail/plydom'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import * as S from '@algosail/plystream'
import type { Manifest } from './build.ts'
import type { ServerNode } from './node.ts'
import type {
  Answering,
  Arrival,
  Chrome,
  Context,
  ErrorView,
  Failed,
  Head,
  Json,
  Middleware,
  Reply,
  Route,
  Routes,
} from './types.ts'
import { collectStyles } from './css.ts'
import { liveClaimFor } from './events.ts'
import * as Html from './html.ts'
import * as Islands from './island.ts'
import * as Mw from './middleware.ts'
import { root, serverBackend } from './node.ts'
import * as Part from './partial.ts'
import * as Rp from './reply.ts'
import * as Resolve from './resolve.ts'
import * as Rt from './router.ts'
import * as Shell from './shell.ts'
import { HttpError, messageOf } from './types.ts'

/** What this request's state is made of, and when it has to be said. */
export type Prepare<S> = unknown extends S ? { readonly state?: never }
  : { readonly state: (request: Request) => F.Future<unknown, S> }

/** An answer worked out from the request and nothing else: a reply, or nothing to say about it. */
export type Ahead = (request: Request) => P.Maybe<Reply>

/** How to answer requests for an app. */
export type Options<S = unknown, E = unknown> = Prepare<S> & {
  readonly routes: Routes<S, E>
  /** Where each island's chunk is served from, as `build` or `discover` reports it. */
  readonly chunks?: Manifest
  /** The document's language. */
  readonly lang?: string | ((ctx: Context<S, E>) => string)
  /** The document's writing direction, said only where it is not the default. */
  readonly dir?:
    | 'ltr'
    | 'rtl'
    | 'auto'
    | ((ctx: Context<S, E>) => 'ltr' | 'rtl' | 'auto' | undefined)
  /** The `<style>` tags for the head, given the markup they are for. */
  readonly styles?: (markup: string) => string
  /** What a failure renders. */
  readonly error?: ErrorView<S, E>
  /** What every answer goes through. */
  readonly through?: readonly Middleware<S, E>[]
  /** Answers that need nothing but the request: each is handed one and says a reply or says nothing. */
  readonly ahead?: readonly Ahead[]
  /** What the app adds to every page's head, given the head that page asked for. */
  readonly head?: (head: Head) => Head
  /** Told about markup that will not do what it looks like it does: a construct a parser rewrites, an island that was placed but never built, an action aimed at a region with nothing on the page to intercept it. */
  readonly onHazard?: (hazards: readonly Html.Hazard[], url: URL) => void
  /** Module scripts every document carries, whatever its markup — for a chunk that starts itself and has no marker to be found by. */
  readonly always?: readonly string[]
}

/** A rendered page, before it becomes a reply. */
export type Rendered = {
  readonly body: string
  readonly status: number
  readonly hazards: readonly Html.Hazard[]
}

const plainly: ErrorView = (ctx) =>
  H.div ([
    H.h1 ([String (ctx.error.status)]),
    H.p ([ctx.error.message]),
  ])

const asAsked = <A, B>(said: B | ((a: A) => B)): (a: A) => B =>
  P.maybe_ (
    P.K<(a: A) => B> (P.K (said as B)),
  ) (
    (f: (a: A) => B) => f,
  ) (P.fromPredicate (P.isFunction) (said) as P.Maybe<(a: A) => B>)

const pageOf = <S, E>(resolved: Resolve.Resolved<S, E>): D.View =>
  resolved.route.view ({ ...resolved.ctx, data: resolved.data })

const outwards = (layouts: readonly Chrome<never>[]): readonly number[] =>
  P.reverse (P.range (0) (layouts.length))

const wrapping =
  <S, E>(resolved: Resolve.Resolved<S, E>) => (slot: D.View, at: number): D.View =>
    resolved.route.layouts[at].view ({
      ...resolved.ctx,
      data: P.defaultTo<Json> ({}) (resolved.layoutData[at]),
      slot,
    })

const inLayouts = <S, E>(resolved: Resolve.Resolved<S, E>): D.View =>
  P.reduce (wrapping (resolved)) (pageOf (resolved)) (
    outwards (resolved.route.layouts as readonly Chrome<never>[]),
  )

/** Markup, and the places in it a parser would rewrite. */
type Markup = {
  readonly body: string
  readonly hazards: readonly Html.Hazard[]
}

function render<A>(view: D.View, pick: (tree: ServerNode) => A): A {
  const previous = D.setBackend (serverBackend)
  const tree: ServerNode = root ()
  try {
    const mounted = D.mount (tree as unknown as Node) (view)
    try {
      return pick (tree)
    } finally {
      S.dispose (mounted)
    }
  } finally {
    D.setBackend (previous)
  }
}

const wholeOf = (tree: ServerNode): Markup => ({
  body: Html.serializeChildren (tree),
  hazards: Html.hazards (tree),
})

const toMarkup = (view: D.View): Markup => render (view, wholeOf)

/**
 * Renders a resolved page to markup, inside the layouts its route sits in.
 * @example
 * ```ts
 * // renderToString :: Resolved -> Rendered
 * renderToString (resolved).body
 * // => '<div class="app">…</div>'
 * ```
 */
export function renderToString<S, E = unknown>(resolved: Resolve.Resolved<S, E>): Rendered {
  const markup = toMarkup (inLayouts (resolved))
  return {
    body: markup.body,
    hazards: markup.hazards,
    status: resolved.status,
  }
}

/** Markup, and whether it is one region rather than the whole page. */
type Picked = Markup & { readonly part: boolean }

const asWhole = (tree: ServerNode): Picked => ({
  ...wholeOf (tree),
  part: false,
})

const asRegion = (node: ServerNode): Picked => ({
  body: Html.serializeNode (node),
  hazards: Html.hazards (node),
  part: true,
})

const regionIn =
  (request: Request) => (tree: ServerNode): P.Maybe<ServerNode> =>
    P.chain ((id: string) => Part.find (id) (tree)) (Part.asked (request))

const pickFor = (request: Request) => (tree: ServerNode): Picked =>
  P.maybe_ (() => asWhole (tree)) (asRegion) (regionIn (request) (tree))

const islandScripts =
  (manifest: Manifest) => (markup: string): readonly string[] =>
    P.filterMap ((name: string) => P.lookup (name) (manifest)) (
      Islands.used (markup),
    )

const AIMED = new RegExp (`${Part.INTO_ATTR}="([^"]*)"`, 'g')

/** A rendered page or region, and everything a rule below has to judge it. */
type Placed = {
  readonly markup: string
  readonly manifest: Manifest
  /** The islands its markup places. */
  readonly islands: readonly string[]
  /** The regions its actions aim at; empty for a region rendered alone. */
  readonly aims: readonly string[]
}

/** One way markup asks for something the browser will not get. */
type Inert = (at: Placed) => readonly Html.Hazard[]

const isBuilt = (manifest: Manifest) => (name: string): boolean =>
  P.has (name) (manifest)

const asUnbuilt = (name: string): Html.Hazard => ({
  path: `<!--kit:${name}-->`,
  problem:
    'this island was placed but not built — its markup stands and does ' +
    'nothing. Export it from the islands directory, or name it in ' +
    "`include` if it is one of kit's own",
})

const notBuilt: Inert = (at: Placed): readonly Html.Hazard[] =>
  P.map (asUnbuilt) (P.reject (isBuilt (at.manifest)) (at.islands))

const NO_NAVIGATION: Html.Hazard = {
  path: `[${Part.INTO_ATTR}]`,
  problem:
    'an action is aimed at a region, but this page has no `navigation` ' +
    'island to intercept it — the form will reload the page instead',
}

const aimsAtNothing = (at: Placed): boolean =>
  at.aims.length > 0 && !at.islands.includes ('navigation')

const noNavigation: Inert = (at: Placed): readonly Html.Hazard[] =>
  P.boolean<readonly Html.Hazard[]> ([]) ([NO_NAVIGATION]) (aimsAtNothing (at))

const isOnPage = (markup: string) => (name: string): boolean =>
  markup.includes (`${Part.PART_ATTR}="${name}"`)

const asAstray = (name: string): Html.Hazard => ({
  path: `[${Part.INTO_ATTR}="${name}"]`,
  problem: 'nothing on this page is named that — check the `part` this ' +
    'action is aimed at',
})

const noSuchRegion: Inert = (at: Placed): readonly Html.Hazard[] =>
  P.map (asAstray) (P.reject (isOnPage (at.markup)) (at.aims))

const inertRules: readonly Inert[] = [notBuilt, noNavigation, noSuchRegion]

const aimsIn = (markup: string, whole: boolean): readonly string[] =>
  P.boolean<readonly string[]> ([]) (P.justs (P.firstCaptures (AIMED) (markup))) (
    whole,
  )

const placedIn =
  (manifest: Manifest) => (markup: string, whole: boolean): Placed => ({
    markup,
    manifest,
    islands: Islands.used (markup),
    aims: aimsIn (markup, whole),
  })

const inertIn = (at: Placed): readonly Html.Hazard[] =>
  P.chain ((rule: Inert) => rule (at)) (inertRules)

const inertMarkup =
  (manifest: Manifest) =>
  (markup: string, whole: boolean): readonly Html.Hazard[] =>
    inertIn (placedIn (manifest) (markup, whole))

/** Everything an app decided once, so nothing works it out per request. */
type Serving<S, E> = {
  readonly table: Rt.Table<S, E>
  readonly langOf: (ctx: Context<S, E>) => string
  readonly dirOf: (ctx: Context<S, E>) => 'ltr' | 'rtl' | 'auto' | undefined
  readonly styles: (markup: string) => string
  readonly scripts: (markup: string) => readonly string[]
  readonly drawError: ErrorView<S, E>
  readonly dress: (head: Head) => Head
  readonly state: (request: Request) => F.Future<unknown, S>
  readonly inert: (markup: string, whole: boolean) => readonly Html.Hazard[]
  readonly told: (hazards: readonly Html.Hazard[], url: URL) => void
  readonly always: readonly string[]
  readonly ahead: readonly Ahead[]
  readonly wrapped: Middleware<S, E>
}

const nothingTold = (
  _hazards: readonly Html.Hazard[],
  _url: URL,
): void => {}

const noState = <S, E>(_request: Request): F.Future<unknown, S> =>
  F.resolve (undefined as S)

const declaredIn = <S, E>(
  options: Options<S, E>,
): ((request: Request) => F.Future<unknown, S>) | undefined =>
  (options as { readonly state?: (r: Request) => F.Future<unknown, S> }).state

/** One request and the app answering it, before anything has been built. */
type Asking<S, E> = {
  readonly app: Serving<S, E>
  readonly request: Request
  readonly from: Arrival<E>
}

/** The same, once the state is built and the route is found. */
type Aiming<S, E> = Asking<S, E> & { readonly aimed: Resolve.Aimed<S, E> }

const askingOf =
  <S, E>(app: Serving<S, E>) => (request: Request, from?: Arrival<E>): Asking<S, E> => ({
    app,
    request,
    from: from ?? {},
  })

const aiming = <S, E>(one: Asking<S, E>) => (state: S): Aiming<S, E> => ({
  ...one,
  aimed: Resolve.aim (one.app.table) (state) (one.request, one.from),
})

const servingOf = <S, E>(options: Options<S, E>): Serving<S, E> => ({
  table: Rt.table (options.routes),
  langOf: asAsked<Context<S, E>, string> (
    P.defaultTo<string | ((ctx: Context<S, E>) => string)> ('en') (options.lang),
  ),
  dirOf: asAsked<Context<S, E>, 'ltr' | 'rtl' | 'auto' | undefined> (options.dir),
  styles: P.defaultTo (collectStyles) (options.styles),
  scripts: islandScripts (P.defaultTo<Manifest> ({}) (options.chunks)),
  drawError: P.defaultTo<ErrorView<S, E>> (plainly) (options.error),
  dress: P.defaultTo (P.I<Head>) (options.head),
  state: P.defaultTo (noState<S, E>) (declaredIn (options)),
  inert: inertMarkup (P.defaultTo<Manifest> ({}) (options.chunks)),
  told: P.defaultTo (nothingTold) (options.onHazard),
  always: P.defaultTo<readonly string[]> ([]) (options.always),
  ahead: P.defaultTo<readonly Ahead[]> ([]) (options.ahead),
  wrapped: Mw.stack (P.defaultTo<readonly Middleware<S, E>[]> ([]) (options.through)),
})

const sending = (markup: string) => (status: number): Reply =>
  Rp.status (status) (Rp.vary (Part.PART_HEADER) (Rp.html (markup)))

const scriptsFor = <S, E>(at: Serving<S, E>) => (body: string): readonly string[] =>
  P.concat (at.scripts (body)) (at.always)

const document =
  <S, E>(at: Serving<S, E>) =>
  (ctx: Context<S, E>) =>
  (head: Head) =>
  (markup: Markup): (status: number) => Reply =>
    sending (Shell.document ({
      head: at.dress (head),
      body: markup.body,
      styles: at.styles (markup.body),
      lang: at.langOf (ctx),
      dir: at.dirOf (ctx),
      scripts: scriptsFor (at) (markup.body),
    }))

const fragment =
  <S, E>(at: Serving<S, E>) => (markup: Markup): (status: number) => Reply =>
    sending (
      P.mconcat (P.Concat) ([
        at.styles (markup.body),
        Shell.scriptTags (at.scripts (markup.body)),
        markup.body,
      ]),
    )

const hazardsIn =
  <S, E>(at: Serving<S, E>) => (picked: Picked): readonly Html.Hazard[] =>
    P.concat (picked.hazards) (at.inert (picked.body, !picked.part))

const telling =
  <S, E>(at: Serving<S, E>) =>
  (resolved: Resolve.Resolved<S, E>) =>
  (said: readonly Html.Hazard[]): void =>
    void P.unless<readonly Html.Hazard[]> (P.isEmpty) (
      (all: readonly Html.Hazard[]) => {
        at.told (all, resolved.ctx.url)
        return all
      },
    ) (said)

const headFor = <S, E>(resolved: Resolve.Resolved<S, E>): Head =>
  resolved.route.head ({ ...resolved.ctx, data: resolved.data })

const asDocument =
  <S, E>(at: Serving<S, E>) =>
  (resolved: Resolve.Resolved<S, E>) =>
  (picked: Picked): Reply =>
    document (at) (resolved.ctx) (headFor (resolved)) (picked) (resolved.status)

const asFragment =
  <S, E>(at: Serving<S, E>) =>
  (resolved: Resolve.Resolved<S, E>) =>
  (picked: Picked): Reply => fragment (at) (picked) (resolved.status)

const drawn = <S, E>(at: Serving<S, E>) => (resolved: Resolve.Resolved<S, E>): Reply => {
  const picked = render (
    inLayouts (resolved),
    pickFor (resolved.ctx.request),
  )
  telling (at) (resolved) (hazardsIn (at) (picked))
  return P.boolean<(one: Picked) => Reply> (asDocument (at) (resolved)) (
    asFragment (at) (resolved),
  ) (picked.part) (picked)
}

const apology =
  <S, E>(at: Serving<S, E>) => (ctx: Context<S, E>) => (refusal: Failed): Reply =>
    Rp.onto (refusal) (
      document (at) (ctx) ({
        title: P.just (String (refusal.error.status)),
        meta: [],
      }) (toMarkup (at.drawError ({ ...ctx, error: refusal.error }))) (
        refusal.error.status,
      ),
    )

const wantsPage = <S, E>(aimed: Resolve.Aimed<S, E>): boolean =>
  P.maybe_ (() => true) ((one: Route<S, E>) => one.tag === 'page') (aimed.route)

const isRefusal = (reply: Reply): reply is Failed => reply.tag === 'failure'

const asApology =
  <S, E>(at: Serving<S, E>) => (ctx: Context<S, E>) => (reply: Reply): Reply =>
    P.maybe_ (P.K (reply)) (apology (at) (ctx)) (
      P.fromPredicate (isRefusal) (reply),
    )

const asPage = <S, E>(one: Aiming<S, E>): (reply: Reply) => Reply =>
  P.boolean<(reply: Reply) => Reply> (P.I<Reply>) (
    asApology (one.app) (one.aimed.ctx),
  ) (wantsPage (one.aimed))

const bareContext = <S, E>(one: Asking<S, E>): Context<S, E> =>
  Resolve.contextOf<S, E> (one.request, undefined as S, one.from, {}, '')

const unprepared = <S, E>(one: Asking<S, E>) => (err: unknown): Reply => {
  const bare = bareContext (one)
  const error = new HttpError (500, messageOf (err))
  return document (one.app) (bare) ({ title: P.just ('500'), meta: [] }) (
    toMarkup (plainly ({ ...bare, error })),
  ) (500)
}

const answered = <S, E>(app: Serving<S, E>) => (outcome: Resolve.Outcome<S, E>): Reply =>
  P.cases<Resolve.Outcome<S, E>, Reply> ({
    resolved: (one) => drawn (app) (one.resolved),
    replied: (one) => one.reply,
  }) (outcome)

const encasing = <A, B>(f: (a: A) => B) => (a: A): F.Future<unknown, B> =>
  F.attempt (() => f (a))

const answering = <S, E>(one: Aiming<S, E>): Answering<S, E> =>
  one.app.wrapped ((ctx: Context<S, E>) =>
    P.chain (encasing (answered (one.app))) (Resolve.run (one.aimed.route) (ctx)),
  )

const paged = <S, E>(one: Aiming<S, E>): F.Future<unknown, Reply> =>
  P.map (asPage (one)) (answering (one) (one.aimed.ctx))

const orPlainly = <S, E>(
  one: Aiming<S, E>,
): (both: P.Either<unknown, Reply>) => Reply =>
  P.either (unprepared (one)) (P.I<Reply>)

const drawing = <S, E>(one: Aiming<S, E>): F.Future<unknown, Reply> =>
  P.map (orPlainly (one)) (
    F.coalesce (P.left<unknown, Reply>) (P.right<unknown, Reply>) (paged (one)),
  )

const drawingFor = <S, E>(
  one: Asking<S, E>,
): (state: S) => F.Future<unknown, Reply> => P.pipe ([aiming (one), drawing])

const asUnprepared =
  <S, E>(one: Asking<S, E>) => (err: unknown): F.Future<unknown, Reply> =>
    F.resolve (unprepared (one) (err))

const prepared = <S, E>(one: Asking<S, E>): F.Future<unknown, Reply> =>
  P.chain (P.either (asUnprepared (one)) (drawingFor (one))) (
    F.coalesce (P.left<unknown, S>) (P.right<unknown, S>) (
      one.app.state (one.request),
    ),
  )

const asking = <S, E>(one: Asking<S, E>) => (way: Ahead): P.Maybe<Reply> =>
  way (one.request)

const replying = <S, E>(one: Asking<S, E>): F.Future<unknown, Reply> =>
  P.maybe_ (() => prepared (one)) ((reply: Reply) =>
    F.resolve<unknown, Reply> (reply),
  ) (P.findMap (asking (one)) (one.app.ahead))

/**
 * Builds what an app answers with, as a value: a task of a reply.
 * @example
 * ```ts
 * // answer :: Options -> Request -> Task Reply
 * await run (answer ({ routes }) (new Request ('http://x/')))
 * // => { tag: 'sent', status: 200, headers: { … }, body: '<!doctype html>…' }
 * ```
 */
export function answer<S = unknown, E = unknown>(
  options: Options<S, E>,
): (request: Request, from?: Arrival<E>) => F.Future<unknown, Reply> {
  const asking = askingOf (servingOf (options))
  return (request: Request, from?: Arrival<E>): F.Future<unknown, Reply> =>
    replying (asking (request, from))
}

const asBroken = (err: unknown): Response =>
  new Response (JSON.stringify ({ error: messageOf (err) }), {
    status: 500,
    headers: { 'content-type': 'application/json' },
  })

export const sendingOut: (reply: Reply) => Response = P.pipe ([
  P.encase (Rp.toResponse),
  P.either (asBroken) (P.I<Response>),
])

/**
 * Builds a request handler for an app: `answer`, started, with its reply turned into a Response.
 * @example
 * ```ts
 * // handler :: Options -> Request -> Promise Response
 * listen (handler ({ routes: group (shell) ([home, about]) }))
 * ```
 */
export function handler<S = unknown, E = unknown>(
  options: Options<S, E>,
): (request: Request, from?: Arrival<E>) => Promise<Response> {
  const claim = liveClaimFor (Rt.flat (options.routes))
  const answers = answer (options)
  return (request: Request, from?: Arrival<E>): Promise<Response> =>
    P.maybe_ (
      () => F.promise (P.map (sendingOut) (answers (request, from))),
    ) ((res: Response) => Promise.resolve (res)) (claim (request))
}
