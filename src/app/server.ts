import * as P from '@algosail/ply'
import * as D from '@algosail/plydom'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import * as S from '@algosail/plystream'
import type { Manifest } from '../build/build.ts'
import type { ServerNode } from '../document/node.ts'
import type {
  Answering,
  Arrival,
  Context,
  DocumentHead,
  ErrorView,
  Failed,
  Head,
  HeadPatch,
  Json,
  Middleware,
  Reply,
  Route,
  Routes,
} from './types.ts'
import { collectStyles } from '../document/css.ts'
import * as Html from '../document/html.ts'
import { root, serverBackend } from '../document/node.ts'
import * as Part from '../document/partial.ts'
import * as Shell from '../document/shell.ts'
import * as Islands from '../islands/island.ts'
import { liveClaimFor } from './events.ts'
import * as Mw from './middleware.ts'
import * as Rp from './reply.ts'
import * as Resolve from './resolve.ts'
import * as Rt from './router.ts'
import { HttpError, messageOf } from './types.ts'

/** What this request's state is made of, and when it has to be said. */
export type Prepare<C extends Context> = unknown extends C['state'] ? { readonly state?: never }
  : { readonly state: (request: Request) => F.Future<unknown, C['state']> }

/** An answer worked out from the request and nothing else: a reply, or nothing to say about it. */
export type Ahead = (request: Request) => P.Maybe<Reply>

/** How to answer requests for an app. */
export type Options<C extends Context = Context> = Prepare<C> & {
  readonly routes: Routes<C>
  /** Where each island's chunk is served from, as `build` or `discover` reports it. */
  readonly chunks?: Manifest
  /** The document's language. */
  readonly lang?: string | ((ctx: C) => string)
  /** The document's writing direction, said only where it is not the default. */
  readonly dir?:
    | 'ltr'
    | 'rtl'
    | 'auto'
    | ((ctx: C) => 'ltr' | 'rtl' | 'auto' | undefined)
  /** The `<style>` tags for the head, given the markup they are for. */
  readonly styles?: (markup: string) => string
  /** What a failure renders. */
  readonly error?: ErrorView<C>
  /** What every answer goes through. */
  readonly through?: readonly Middleware<C>[]
  /** Answers that need nothing but the request: each is handed one and says a reply or says nothing. */
  readonly ahead?: readonly Ahead[]
  /** Default document head. A layout or a page replaces any field it sets. */
  readonly head?: DocumentHead
  /** Kit's stylesheet. Prepended after the head is settled, so a replaced `link` list keeps it. */
  readonly styleLink?: Readonly<P.StrMap<string>>
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

const pageOf = <C extends Context>(resolved: Resolve.Resolved<C>): D.View =>
  resolved.route.view ({ ...resolved.ctx, data: resolved.data })

const outwards = (count: number): readonly number[] =>
  P.reverse (P.range (0) (count))

const wrapping =
  <C extends Context>(resolved: Resolve.Resolved<C>) => (slot: D.View, at: number): D.View =>
    resolved.route.layouts[at].view ({
      ...resolved.ctx,
      data: P.defaultTo<Json> ({}) (resolved.layoutData[at]),
      slot,
    })

const inLayouts = <C extends Context>(resolved: Resolve.Resolved<C>): D.View =>
  P.reduce (wrapping (resolved)) (pageOf (resolved)) (
    outwards (resolved.route.layouts.length),
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
export function renderToString<C extends Context = Context>(resolved: Resolve.Resolved<C>): Rendered {
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
type Serving<C extends Context> = {
  readonly table: Rt.Table<C>
  readonly langOf: (ctx: C) => string
  readonly dirOf: (ctx: C) => 'ltr' | 'rtl' | 'auto' | undefined
  readonly styles: (markup: string) => string
  readonly scripts: (markup: string) => readonly string[]
  readonly drawError: ErrorView<C>
  readonly root: Head
  readonly dress: (head: Head) => Head
  readonly state: (request: Request) => F.Future<unknown, C['state']>
  readonly inert: (markup: string, whole: boolean) => readonly Html.Hazard[]
  readonly told: (hazards: readonly Html.Hazard[], url: URL) => void
  readonly always: readonly string[]
  readonly ahead: readonly Ahead[]
  readonly wrapped: Middleware<C>
}

const nothingTold = (
  _hazards: readonly Html.Hazard[],
  _url: URL,
): void => {}

const noState = <C extends Context>(_request: Request): F.Future<unknown, C['state']> =>
  F.resolve (undefined as C['state'])

const declaredIn = <C extends Context>(
  options: Options<C>,
): ((request: Request) => F.Future<unknown, C['state']>) | undefined =>
  (options as { readonly state?: (r: Request) => F.Future<unknown, C['state']> }).state

/** One request and the app answering it, before anything has been built. */
type Asking<C extends Context> = {
  readonly app: Serving<C>
  readonly request: Request
  readonly from: Arrival<C['env']>
}

/** The same, once the state is built and the route is found. */
type Aiming<C extends Context> = Asking<C> & { readonly aimed: Resolve.Aimed<C> }

const askingOf =
  <C extends Context>(app: Serving<C>) => (request: Request, from?: Arrival<C['env']>): Asking<C> => ({
    app,
    request,
    from: from ?? {},
  })

const aiming = <C extends Context>(one: Asking<C>) => (state: C['state']): Aiming<C> => ({
  ...one,
  aimed: Resolve.aim (one.app.table) (state) (one.request, one.from),
})

const tagsOf = <A>(tags: readonly A[] | undefined): readonly A[] =>
  P.defaultTo<readonly A[]> ([]) (tags)

/** A set field replaces the one outside it. An omitted field stays, and `P.nothing()` counts as set. */
const over = (base: Head) => (patch: HeadPatch | undefined): Head =>
  patch === undefined
    ? base
    : {
        title: patch.title !== undefined ? patch.title : base.title,
        meta: patch.meta !== undefined ? patch.meta : base.meta,
        link: patch.link !== undefined ? patch.link : base.link,
      }

/** The application's head. An omitted title is an empty one. */
const rootOf = (doc: DocumentHead | undefined): Head => ({
  title: doc?.title ?? P.nothing (),
  meta: doc?.meta,
  link: doc?.link,
})

/** Kit's stylesheet leads whatever links the page settled on. */
const dressOf =
  (styleLink: Readonly<P.StrMap<string>> | undefined) => (head: Head): Head =>
    styleLink === undefined
      ? head
      : { ...head, link: P.prepend (styleLink) (tagsOf (head.link)) }

const servingOf = <C extends Context>(options: Options<C>): Serving<C> => ({
  table: Rt.table (options.routes),
  langOf: asAsked<C, string> (
    P.defaultTo<string | ((ctx: C) => string)> ('en') (options.lang),
  ),
  dirOf: asAsked<C, 'ltr' | 'rtl' | 'auto' | undefined> (options.dir),
  styles: P.defaultTo (collectStyles) (options.styles),
  scripts: islandScripts (P.defaultTo<Manifest> ({}) (options.chunks)),
  drawError: P.defaultTo<ErrorView<C>> (plainly) (options.error),
  root: rootOf (options.head),
  dress: dressOf (options.styleLink),
  state: P.defaultTo (noState<C>) (declaredIn (options)),
  inert: inertMarkup (P.defaultTo<Manifest> ({}) (options.chunks)),
  told: P.defaultTo (nothingTold) (options.onHazard),
  always: P.defaultTo<readonly string[]> ([]) (options.always),
  ahead: P.defaultTo<readonly Ahead[]> ([]) (options.ahead),
  wrapped: Mw.stack (P.defaultTo<readonly Middleware<C>[]> ([]) (options.through)),
})

const sending = (markup: string) => (status: number): Reply =>
  Rp.status (status) (Rp.vary (Part.PART_HEADER) (Rp.html (markup)))

const scriptsFor = <C extends Context>(at: Serving<C>) => (body: string): readonly string[] =>
  P.concat (at.scripts (body)) (at.always)

const document =
  <C extends Context>(at: Serving<C>) =>
  (ctx: C) =>
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
  <C extends Context>(at: Serving<C>) => (markup: Markup): (status: number) => Reply =>
    sending (
      P.mconcat (P.Concat) ([
        at.styles (markup.body),
        Shell.scriptTags (at.scripts (markup.body)),
        markup.body,
      ]),
    )

const hazardsIn =
  <C extends Context>(at: Serving<C>) => (picked: Picked): readonly Html.Hazard[] =>
    P.concat (picked.hazards) (at.inert (picked.body, !picked.part))

const telling =
  <C extends Context>(at: Serving<C>) =>
  (resolved: Resolve.Resolved<C>) =>
  (said: readonly Html.Hazard[]): void =>
    void P.unless<readonly Html.Hazard[]> (P.isEmpty) (
      (all: readonly Html.Hazard[]) => {
        at.told (all, resolved.ctx.url)
        return all
      },
    ) (said)

const layoutHead =
  <C extends Context>(resolved: Resolve.Resolved<C>) => (head: Head, index: number): Head =>
    over (head) (
      resolved.route.layouts[index].head?. ({
        ...resolved.ctx,
        data: P.defaultTo<Json> ({}) (resolved.layoutData[index]),
      }),
    )

/** The root, then each layout from the outside in, then the page. */
const headFor =
  <C extends Context>(at: Serving<C>) => (resolved: Resolve.Resolved<C>): Head =>
    over (
      P.reduce (layoutHead (resolved)) (at.root) (
        P.range (0) (resolved.route.layouts.length),
      ),
    ) (resolved.route.head?. ({ ...resolved.ctx, data: resolved.data }))

const asDocument =
  <C extends Context>(at: Serving<C>) =>
  (resolved: Resolve.Resolved<C>) =>
  (picked: Picked): Reply =>
    document (at) (resolved.ctx) (headFor (at) (resolved)) (picked) (resolved.status)

const asFragment =
  <C extends Context>(at: Serving<C>) =>
  (resolved: Resolve.Resolved<C>) =>
  (picked: Picked): Reply => fragment (at) (picked) (resolved.status)

const drawn = <C extends Context>(at: Serving<C>) => (resolved: Resolve.Resolved<C>): Reply => {
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
  <C extends Context>(at: Serving<C>) => (ctx: C) => (refusal: Failed): Reply =>
    Rp.onto (refusal) (
      document (at) (ctx) (
        over (at.root) ({ title: P.just (String (refusal.error.status)) }),
      ) (toMarkup (at.drawError ({ ...ctx, error: refusal.error }))) (
        refusal.error.status,
      ),
    )

const wantsPage = <C extends Context>(aimed: Resolve.Aimed<C>): boolean =>
  P.maybe_ (() => true) ((one: Route<C>) => one.tag === 'page') (aimed.route)

const isRefusal = (reply: Reply): reply is Failed => reply.tag === 'failure'

const asApology =
  <C extends Context>(at: Serving<C>) => (ctx: C) => (reply: Reply): Reply =>
    P.maybe_ (P.K (reply)) (apology (at) (ctx)) (
      P.fromPredicate (isRefusal) (reply),
    )

const asPage = <C extends Context>(one: Aiming<C>): (reply: Reply) => Reply =>
  P.boolean<(reply: Reply) => Reply> (P.I<Reply>) (
    asApology (one.app) (one.aimed.ctx),
  ) (wantsPage (one.aimed))

const bareContext = <C extends Context>(one: Asking<C>): C =>
  Resolve.contextOf<C> (one.request, undefined as C['state'], one.from, {}, '')

const unprepared = <C extends Context>(one: Asking<C>) => (err: unknown): Reply => {
  const bare = bareContext (one)
  const error = new HttpError (500, messageOf (err))
  return document (one.app) (bare) (
    over (one.app.root) ({ title: P.just ('500') }),
  ) (toMarkup (plainly ({ ...bare, error }))) (500)
}

const answered = <C extends Context>(app: Serving<C>) => (outcome: Resolve.Outcome<C>): Reply =>
  P.cases<Resolve.Outcome<C>, Reply> ({
    resolved: (one) => drawn (app) (one.resolved),
    replied: (one) => one.reply,
  }) (outcome)

const encasing = <A, B>(f: (a: A) => B) => (a: A): F.Future<unknown, B> =>
  F.attempt (() => f (a))

const answering = <C extends Context>(one: Aiming<C>): Answering<C> =>
  one.app.wrapped ((ctx: C) =>
    P.chain (encasing (answered (one.app))) (Resolve.run (one.aimed.route) (ctx)),
  )

const paged = <C extends Context>(one: Aiming<C>): F.Future<unknown, Reply> =>
  P.map (asPage (one)) (answering (one) (one.aimed.ctx))

const orPlainly = <C extends Context>(
  one: Aiming<C>,
): (both: P.Either<unknown, Reply>) => Reply =>
  P.either (unprepared (one)) (P.I<Reply>)

const drawing = <C extends Context>(one: Aiming<C>): F.Future<unknown, Reply> =>
  P.map (orPlainly (one)) (
    F.coalesce (P.left<unknown, Reply>) (P.right<unknown, Reply>) (paged (one)),
  )

const drawingFor = <C extends Context>(
  one: Asking<C>,
): (state: C['state']) => F.Future<unknown, Reply> => P.pipe (aiming (one), drawing)

const asUnprepared =
  <C extends Context>(one: Asking<C>) => (err: unknown): F.Future<unknown, Reply> =>
    F.resolve (unprepared (one) (err))

const prepared = <C extends Context>(one: Asking<C>): F.Future<unknown, Reply> =>
  P.chain (P.either (asUnprepared (one)) (drawingFor (one))) (
    F.coalesce (P.left<unknown, C['state']>) (P.right<unknown, C['state']>) (
      one.app.state (one.request),
    ),
  )

const asking = <C extends Context>(one: Asking<C>) => (way: Ahead): P.Maybe<Reply> =>
  way (one.request)

const replying = <C extends Context>(one: Asking<C>): F.Future<unknown, Reply> =>
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
export function answer<C extends Context = Context>(
  options: Options<C>,
): (request: Request, from?: Arrival<C['env']>) => F.Future<unknown, Reply> {
  const asking = askingOf (servingOf (options))
  return (request: Request, from?: Arrival<C['env']>): F.Future<unknown, Reply> =>
    replying (asking (request, from))
}

const asBroken = (err: unknown): Response =>
  new Response (JSON.stringify ({ error: messageOf (err) }), {
    status: 500,
    headers: { 'content-type': 'application/json' },
  })

export const sendingOut: (reply: Reply) => Response = P.pipe (
  P.encase (Rp.toResponse),
  P.either (asBroken) (P.I<Response>),
)

/**
 * Builds a request handler for an app: `answer`, started, with its reply turned into a Response.
 * @example
 * ```ts
 * // handler :: Options -> Request -> Promise Response
 * listen (handler ({ routes: group (shell) ([home, about]) }))
 * ```
 */
export function handler<C extends Context = Context>(
  options: Options<C>,
): (request: Request, from?: Arrival<C['env']>) => Promise<Response> {
  const claim = liveClaimFor (Rt.flat (options.routes))
  const answers = answer (options)
  return (request: Request, from?: Arrival<C['env']>): Promise<Response> =>
    P.maybe_ (
      () => F.promise (P.map (sendingOut) (answers (request, from))),
    ) ((res: Response) => Promise.resolve (res)) (claim (request))
}
