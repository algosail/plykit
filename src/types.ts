import type * as D from '@algosail/plydom'
import type * as F from '@algosail/plyfuture'
import * as P from '@algosail/ply'
import type { Cookie } from './cookie.ts'

/** JSON as a closed type. */
export type JsonObject = { readonly [k: string]: Json }
export type JsonArray = readonly Json[]
export type Json = null | boolean | number | string | JsonArray | JsonObject

/** The dynamic segments a route pattern captured, keyed by name. */
export type Params = Readonly<P.StrMap<string>>

/**
 * The id of the page's root element.
 * @example
 * ```ts
 * `<div id="${ROOT_ID}">${body}</div>`
 * ```
 */
export const ROOT_ID = 'kit-root'

/**
 * The header a client names a region of a page in, and the attributes that mark one and aim an action at it.
 * @example
 * ```ts
 * `<ul ${PART_ATTR}="comments">` + ' asked for by ' + PART_HEADER
 * ```
 */
export const PART_HEADER = 'kit-part'
export const PART_ATTR = 'data-kit-part'
export const INTO_ATTR = 'data-kit-into'
export const MODE_ATTR = 'data-kit-mode'

/** What an answer does to the region it is aimed at. */
export type PartMode = 'replace' | 'append' | 'prepend'

/** What a region's name may be: it arrives in a header, so it is checked. */
export const PART_NAME = /^[A-Za-z0-9_-]{1,64}$/

/**
 * The event a server sends to say a region went stale, and where the browser listens for it by default.
 * @example
 * ```ts
 * `<!-- the server: -->` + PART_EVENT + ' → the client refreshes that region'
 * ```
 */
export const PART_EVENT = 'kit-part'
export const LIVE_PATH = '/live'

/** Where the dev server says which run of itself it is. */
export const RELOAD_PATH = '/_kit-reload'

/** The event that carries it. */
export const RELOAD_EVENT = 'kit-run'

/**
 * Whether this page can listen to the server at all.
 * @example
 * ```ts
 * // canListen :: () -> Boolean
 * each (begin) (fromPredicate (isTrue) (canListen ()))
 * ```
 */
export const canListen = (): boolean =>
  typeof document !== 'undefined' && typeof EventSource !== 'undefined'

/** A failure that carries an HTTP status. */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super (message)
    this.name = 'HttpError'
    this.status = status
  }
}

const isError = (err: unknown): err is Error => err instanceof Error

const saidBy = (one: Error): string => one.message

const asPrinted = (err: unknown) => (): string => String (err)

/**
 * What a thrown thing has to say for itself.
 * @example
 * ```ts
 * // messageOf :: unknown -> String
 * messageOf (new Error ('no')) // => 'no'
 * messageOf ('no') // => 'no'
 * ```
 */
export const messageOf = (err: unknown): string =>
  P.maybe_ (asPrinted (err)) (saidBy) (P.fromPredicate (isError) (err))

/** The methods a route can answer. */
export type Method =
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'

/** The redirect statuses `Response.redirect` accepts; 200 throws a RangeError. */
export type RedirectStatus = 301 | 302 | 303 | 307 | 308

/** One event, as both channels spell it. `data` is required. */
export type ServerEvent = {
  readonly data: string
  /** The name a listener listens for. */
  readonly event?: string
  /** Comes back in `last-event-id` when the browser reconnects. */
  readonly id?: string
  /** How long the browser should wait before reconnecting, in milliseconds. */
  readonly retry?: number
}

/** The same event, as `stale` and `announce` send it. */
export type LiveEvent = ServerEvent

/**
 * Where `stale` and `announce` write for this request.
 * @example
 * ```ts
 * stale (ctx) ('comments')
 * ```
 */
export type Live = {
  readonly send: (event: LiveEvent) => void
}

/** Everything a request carries, and the one thing every function a route has is given. */
export type Context<S = unknown, E = unknown> = {
  /** Where the request is pointed. */
  readonly url: URL
  /** What the route's pattern captured, decoded. */
  readonly params: Params
  /** What arrived. */
  readonly request: Request
  /** Which route claimed the path, by its pattern; empty when none did. */
  readonly routeId: string
  /** What the app prepared for this request, before any route saw it. */
  readonly state: S
  /** The platform's bindings. `state` does not see them: it runs before this context exists. */
  readonly env: E
  /** The free channel for this request. */
  readonly live: Live
  /** Who the server is talking to, as the connection says: an address, when there is one to have. */
  readonly client: P.Maybe<string>
}

/** What the server knows about the connection a request arrived on: the second argument a listener hands a handler. */
export type Arrival<E = unknown> = {
  readonly remoteAddr?: { readonly hostname?: string }
  /** The platform's bindings, when the host has a platform. */
  readonly env?: E
  /** The free channel, when the host has its own. Otherwise the process channel is used. */
  readonly live?: Live
}

/** What a page contributes to the document head. */
export type Head = {
  readonly title: P.Maybe<string>
  /** `<meta>` tags. */
  readonly meta?: readonly Readonly<P.StrMap<string>>[]
  /** `<link>` tags, attribute by attribute — `rel`, `href` and whatever else that `rel` takes. */
  readonly link?: readonly Readonly<P.StrMap<string>>[]
}

/** What a route renders, given what its load produced. */
export type PageView<D extends Json, S = unknown, E = unknown> = (
  ctx: Context<S, E> & { readonly data: D },
) => D.View

/** What a page puts in the document head, given the same context its view gets. */
export type PageHead<D extends Json, S = unknown, E = unknown> = (
  ctx: Context<S, E> & { readonly data: D },
) => Head

/** What a failure renders. */
export type ErrorView<S = unknown, E = unknown> = (
  ctx: Context<S, E> & { readonly error: HttpError },
) => D.View

/** The chrome a page is drawn inside, as a page carries it: what it reads and what it draws. */
export type Chrome<S = unknown, E = unknown> = {
  readonly load: Load<Json, S, E>
  readonly view: (
    ctx: Context<S, E> & { readonly data: Json; readonly slot: D.Child },
  ) => D.View
}

/** Everything a layout needs: the markup around a page, and what that markup reads. */
export type LayoutSpec<D extends Json = Json, S = unknown, E = unknown> = {
  readonly load?: Load<D, S, E>
  readonly view: (
    ctx: Context<S, E> & { readonly data: D; readonly slot: D.Child },
  ) => D.View
}

/** A layout, ready to use: it takes the routes it is for and hands them back wrapped. */
export type Layout<S = unknown, E = unknown> = (
  routes: Routes<S, E>,
) => Route<S, E>[]

/** A body on its way out, with the status, headers and cookies it goes under. */
export type Sent = {
  readonly tag: 'sent'
  readonly status: number
  readonly headers: Readonly<P.StrMap<string>>
  readonly cookies: readonly Cookie[]
  readonly body: BodyInit | null
}

/** Where a request is sent instead of being answered here. */
export type Redirected = {
  readonly tag: 'redirect'
  readonly status: RedirectStatus
  readonly location: string
  readonly headers: Readonly<P.StrMap<string>>
  readonly cookies: readonly Cookie[]
}

/** A request that was refused, and the status saying why. */
export type Failed = {
  readonly tag: 'failure'
  readonly error: HttpError
  readonly headers: Readonly<P.StrMap<string>>
  readonly cookies: readonly Cookie[]
}

/** The three ways a load can end. */
export type Loaded<D extends Json> =
  | { readonly tag: 'data'; readonly data: D; readonly status: number }
  | Redirected
  | Failed

/** The three ways a handler can end, and two of them are the same three a load has. */
export type Reply = Sent | Redirected | Failed

/** Whatever `status`, `headers`, `cookie` and `onto` can be put on: a reply on its way to the wire, or a load's answer on its way to a view. */
export type Answer = Loaded<Json> | Reply

/** A load function: an event in, a task of an outcome out. */
export type Load<D extends Json, S = unknown, E = unknown> = (
  ctx: Context<S, E>,
) => F.Future<unknown, Loaded<D>>

/** What answers one method at one path. */
export type Handler<S = unknown, E = unknown> = (
  ctx: Context<S, E>,
) => F.Future<unknown, Reply>

/** A route's handlers, by method. */
export type Handlers<S = unknown, E = unknown> = {
  readonly [M in Method]?: Handler<S, E>
}

/** A page's handler. */
export type PageHandler<D extends Json, S = unknown, E = unknown> = (
  ctx: Context<S, E>,
) => F.Future<unknown, Reply | Loaded<D>>

/** A page's handlers, by method. */
export type PageHandlers<D extends Json = Json, S = unknown, E = unknown> = {
  readonly [M in Method]?: PageHandler<D, S, E>
}

/** Answering one request, whole: the context in, the reply out. */
export type Answering<S = unknown, E = unknown> = (
  ctx: Context<S, E>,
) => F.Future<unknown, Reply>

/** A middleware that hands down a different state than it was asked for: given something that answers from an `S2`, it answers from an `S1`. */
export type Wrapping<S1, S2 = S1, E = unknown> = (
  next: Answering<S2, E>,
) => Answering<S1, E>

/** Something wrapped around the answering of a request. */
export type Middleware<S = unknown, E = unknown> = Wrapping<S, S, E>

/** Whether a route can be written out as files, and at which addresses. */
export type Still = {
  readonly on: boolean
  readonly paths?: () => F.Future<unknown, readonly Params[]>
}

/** A path that renders markup, and whatever handlers answer beside it. */
export type PageRoute<D extends Json = Json, S = unknown, E = unknown> = {
  readonly tag: 'page'
  readonly id: string
  readonly pattern: string
  readonly on: PageHandlers<D, S, E>
  readonly load: Load<D, S, E>
  readonly view: PageView<D, S, E>
  readonly head: PageHead<D, S, E>
  /** The layouts this page sits in, outermost first. */
  readonly layouts: readonly Chrome<S, E>[]
  readonly still: Still
}

/** A path that answers with data and renders nothing. */
export type Endpoint<S = unknown, E = unknown> = {
  readonly tag: 'endpoint'
  readonly id: string
  readonly pattern: string
  readonly on: Handlers<S, E>
  readonly still: Still
  /** `'live'` when `liveRoute` built this endpoint. */
  readonly socket?: 'live'
}

/** One claim on a path. */
export type Route<S = unknown, E = unknown> =
  | PageRoute<Json, S, E>
  | Endpoint<S, E>

/** A list of routes in which what another layout produced may sit as it is. */
export type Routes<S = unknown, E = unknown> = readonly (
  | Route<S, E>
  | readonly Route<S, E>[]
)[]
