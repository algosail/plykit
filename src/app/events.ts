import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import * as S from '@algosail/plystream'
import type { Context, Live, Reply, Route, ServerEvent } from './types.ts'
import * as Rp from './reply.ts'
import { endpoint } from './router.ts'
import { LIVE_PATH, PART_EVENT, RELOAD_EVENT, RELOAD_PATH } from './types.ts'

export type { ServerEvent }

/** How to keep the connection open. */
export type EventOptions = {
  /** A comment sent every so many milliseconds so that whatever sits between the app and the browser does not decide the connection is idle. */
  readonly heartbeat?: number
}

export { PART_EVENT }

const bytes = new TextEncoder ()

const BEAT = 15_000

const PING = ': ping\n\n'

const fieldOf =
  (name: string) => (value: string | number | undefined): P.Maybe<string> =>
    P.map ((one: string | number) => `${name}: ${one}`) (P.fromNullable (value))

const metaIn = (one: ServerEvent): readonly string[] =>
  P.justs ([
    fieldOf ('event') (one.event),
    fieldOf ('id') (one.id),
    fieldOf ('retry') (one.retry),
  ])

const dataIn = (one: ServerEvent): readonly string[] =>
  P.map ((line: string) => `data: ${line}`) (
    one.data === '' ? [''] : P.lines (one.data),
  )

/**
 * One event as the wire carries it.
 * @example
 * ```ts
 * serializeEvent ({ event: 'kit-part', data: 'comments' })
 * // => 'event: kit-part\ndata: comments\n\n'
 * ```
 */
export function serializeEvent(one: ServerEvent): string {
  return P.concat (
    P.joinWith ('\n') (P.concat (metaIn (one)) (dataIn (one))),
  ) ('\n\n')
}

/**
 * Says a region is stale.
 * @example
 * ```ts
 * announce (stalePart ('comments'))
 * ```
 */
export function stalePart(id: string): ServerEvent {
  return { event: PART_EVENT, data: id }
}

const isBlank = (said: string): boolean => said === ''

/**
 * Which event the browser last saw, when it is reconnecting.
 * @example
 * ```ts
 * lastEventId (ctx.request) // => just ('184')
 * ```
 */
export function lastEventId(request: Request): P.Maybe<string> {
  return P.reject (isBlank) (
    P.fromNullable (request.headers.get ('last-event-id')),
  )
}

/** Somewhere to write text, and the two ways it stops: shut, which means stop trying, and close, which also tells the reader there will be no more. */
type Wire = {
  readonly write: (text: string) => void
  readonly shut: () => void
  readonly close: () => void
}

type Controller = ReadableStreamDefaultController<Uint8Array>

const enqueueTo = (controller: Controller) => (text: string): void =>
  controller.enqueue (bytes.encode (text))

const wireTo = (controller: Controller): Wire => {
  let open = true
  const send = enqueueTo (controller)
  return {
    write: (text: string): void => {
      if (!open) return
      open = P.isJust (P.maybeEncase (send) (text))
    },
    shut: (): void => {
      open = false
    },
    close: (): void =>
      void P.maybeEncase ((c: Controller) => c.close ()) (controller),
  }
}

const isPositive = (ms: number): boolean => ms > 0

const beatOf = (options: EventOptions): number =>
  P.defaultTo (BEAT) (options.heartbeat)

/** Whatever the runtime calls a running timer. */
type Ticker = ReturnType<typeof setInterval>

const beating = (beat: number) => (tick: () => void): P.Maybe<Ticker> =>
  P.map ((ms: number) => setInterval (tick, ms)) (
    P.fromPredicate (isPositive) (beat),
  )

const stopBeating = (ticker: P.Maybe<Ticker>): void =>
  void P.forEach ((id: Ticker) => clearInterval (id)) (ticker)

const quieting = (wire: Wire) => (ticker: P.Maybe<Ticker>) => (): void => {
  wire.shut ()
  stopBeating (ticker)
}

const sinkTo = (wire: Wire) => (quiet: () => void): S.Sink<ServerEvent> => ({
  event: (_t: S.Time, one: ServerEvent): void =>
    wire.write (serializeEvent (one)),
  end: (): void => {
    quiet ()
    wire.close ()
  },
})

const streaming = (
  source: S.Stream<ServerEvent>,
  beat: number,
): ReadableStream<Uint8Array> => {
  let finish = (): void => {}

  return new ReadableStream<Uint8Array> ({
    start(controller: Controller) {
      const wire = wireTo (controller)
      const ticker = beating (beat) (() => wire.write (PING))
      const quiet = quieting (wire) (ticker)
      const listening = source.run (sinkTo (wire) (quiet))
      finish = (): void => {
        quiet ()
        S.dispose (listening)
      }
    },

    cancel() {
      finish ()
    },
  })
}

const asEventReply = (body: ReadableStream<Uint8Array>): Reply =>
  Rp.headers ({
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
  }) (Rp.body ('text/event-stream; charset=utf-8') (body))

/**
 * An answer that stays open, sending whatever the stream sends.
 * @example
 * ```ts
 * // eventStream :: Stream ServerEvent -> Reply
 * const [changes, announce] = Stream.bus ()
 * endpoint ({ pattern: '/live', on: { GET: () => Task.of (eventStream (changes)) } })
 * ```
 */
export function eventStream(
  source: S.Stream<ServerEvent>,
  options: EventOptions = {},
): Reply {
  return asEventReply (streaming (source, beatOf (options)))
}

/** A channel and the route that hands it out. */
export type Channel<C extends Context = Context> = {
  /** Put this in the app's routes; it answers with the stream. */
  readonly route: Route<C>
  /** Say a region is out of date to everyone watching it. */
  readonly stale: (region: string) => void
  /** Say something else — an event of the app's own naming. */
  readonly send: (event: ServerEvent) => void
}

/** What a browser that was away missed, given the last event it saw. */
type Replay = (since: P.Maybe<string>) => S.Stream<ServerEvent>

/** How a channel is built: how to hold it open, where it answers, and what a reconnecting browser has missed. */
type ChannelOptions = EventOptions & {
  /** Where this channel answers. Not `/live`: that path is the free channel. */
  readonly path: string
  readonly replay?: Replay
}

const whyPath = (path: string): string =>
  path === LIVE_PATH
    ? 'channel: /live belongs to the free channel. Pass another path.'
    : 'channel: pass the path this channel answers on.'

const pathOf = (options: ChannelOptions): string => {
  const path = options.path
  if (path === '' || path === LIVE_PATH) throw new Error (whyPath (path))
  return path
}

const caughtUp =
  (options: ChannelOptions) =>
  (events: S.Stream<ServerEvent>) =>
  (request: Request): S.Stream<ServerEvent> =>
    P.maybe_ (() => events) ((back: Replay) =>
      P.concat (back (lastEventId (request))) (events),
    ) (P.fromNullable (options.replay))

/**
 * A live channel: the bus, the route that serves it, and the two ways to say something on it.
 * @example
 * ```ts
 * // channel :: Options -> Channel s
 * export const updates = channel<App> ({ path: '/updates' })
 * // in the routes: [...pages, updates.route]
 * // in a handler, after writing: updates.stale (`comments-${slug}`)
 * ```
 */
export function channel<C extends Context = Context>(
  options: ChannelOptions,
): Channel<C> {
  const path = pathOf (options)
  const [events, announce] = S.bus<ServerEvent> ()
  const since = caughtUp (options) (events)
  return {
    route: endpoint<C> ({
      pattern: path,
      on: {
        GET: (ctx: C) =>
          F.resolve (eventStream (since (ctx.request), options)),
      },
    }),
    stale: P.pipe ([stalePart, announce]),
    send: announce,
  }
}

const [events, tell] = S.bus<ServerEvent> ()

/**
 * The free channel of this process, used when the host did not hand one over.
 * @example
 * ```ts
 * localLive.send (stalePart ('comments'))
 * ```
 */
export const localLive: Live = { send: tell }

/**
 * One free-channel event as a JSON text frame.
 * @example
 * ```ts
 * frameOf ({ event: 'kit-part', data: 'comments' })
 * // => '{"event":"kit-part","data":"comments"}'
 * ```
 */
export function frameOf(one: ServerEvent): string {
  return JSON.stringify (one)
}

/**
 * Subscribes `send` to the free channel until the function it returns runs.
 * @example
 * ```ts
 * const stop = attachLive ((text) => socket.send (text))
 * stop ()
 * ```
 */
export const attachLive = (send: (text: string) => void): (() => void) => {
  let gone = false
  const reading = events.run ({
    event: (_time: S.Time, one: ServerEvent): void => {
      if (gone) return
      void P.maybeEncase (send) (frameOf (one))
    },
    end: (): void => {},
  })
  return (): void => {
    if (gone) return
    gone = true
    S.dispose (reading)
  }
}

const SOCKET = 'websocket'

const CLAIM = 'kit-socket'

/**
 * Whether this request is a WebSocket upgrade.
 * @example
 * ```ts
 * wantsUpgrade (request)
 * // => true
 * ```
 */
export const wantsUpgrade = (request: Request): boolean => {
  const header = request.headers.get ('upgrade')
  return request.method === 'GET' &&
    header !== null &&
    header.toLowerCase () === SOCKET
}

/**
 * Whether this request asks for the free-channel socket.
 * @example
 * ```ts
 * asksForLiveSocket (new Request ('http://x/live', { headers: { upgrade: 'websocket' } }))
 * // => true
 * ```
 */
export const asksForLiveSocket = (request: Request): boolean =>
  wantsUpgrade (request) && new URL (request.url).pathname === LIVE_PATH

const required = (): Reply =>
  Rp.headers ({ upgrade: SOCKET }) (Rp.status (426) (Rp.noContent ()))

const greeted =
  <C extends Context>(_ctx: C): F.Future<unknown, Reply> =>
    F.resolve (required ())

/**
 * The route of the free channel. An ordinary GET is 426. The socket itself is the host's.
 * @example
 * ```ts
 * handler ({ routes: [...pages, liveRoute ()] })
 * ```
 */
export const liveRoute = <C extends Context = Context>(): Route<C> => ({
  ...endpoint<C> ({
    pattern: LIVE_PATH,
    on: { GET: greeted },
  }),
  socket: 'live',
})

/**
 * Whether `route` is a free-channel route `liveRoute` returned.
 * @example
 * ```ts
 * isLiveRoute (liveRoute ())
 * // => true
 * ```
 */
export const isLiveRoute = (route: object): boolean =>
  'socket' in route &&
  (route as { readonly socket?: string }).socket === 'live'

const markedLive = (): Response =>
  new Response (null, {
    status: 204,
    headers: { [CLAIM]: '1', upgrade: SOCKET },
  })

/**
 * What `listen` should take as the free-channel socket, when this request is that upgrade and a free-channel route is mounted.
 * @example
 * ```ts
 * liveClaimFor ([liveRoute ()]) (request)
 * ```
 */
export const liveClaimFor =
  (routes: readonly object[]) =>
  (request: Request): P.Maybe<Response> =>
    P.any (isLiveRoute) (routes) && asksForLiveSocket (request)
      ? P.just (markedLive ())
      : P.nothing<Response> ()

/**
 * Whether `response` is the mark `liveClaimFor` returns.
 * @example
 * ```ts
 * isLiveClaim (response)
 * ```
 */
export const isLiveClaim = (response: Response): boolean =>
  response.headers.get (CLAIM) === '1'

/**
 * Says a region is out of date to everyone watching it.
 * @example
 * ```ts
 * // stale :: Context -> String -> void
 * stale (ctx) (`comments-${ctx.params.slug}`)
 * ```
 */
export const stale =
  (ctx: { readonly live: Live }) => (region: string): void => {
    ctx.live.send (stalePart (region))
  }

/**
 * The same channel, for something of the app's own naming — a counter, a status, anything the browser listens for by name.
 * @example
 * ```ts
 * announce (ctx) ({ event: 'price', data: '42' })
 * ```
 */
export const announce =
  (ctx: { readonly live: Live }) => (event: ServerEvent): void => {
    ctx.live.send (event)
  }

const RUN = `${Date.now ().toString (36)}-${Math.random ().toString (36).slice (2)}`

const saying = (one: ServerEvent): S.Stream<ServerEvent> =>
  P.concat (S.wrap (one)) (S.never<ServerEvent> ())

/**
 * The route the reload client listens on: it says which run of the server this is and then keeps quiet, so the connection lasts as long as the process does and ends when it does.
 * @example
 * ```ts
 * // reloadRoute :: () -> Route s
 * handler ({ routes: [...pages, reloadRoute ()] })
 * ```
 */
export const reloadRoute = <C extends Context = Context>(): Route<C> =>
  endpoint<C> ({
    pattern: RELOAD_PATH,
    on: {
      GET: () =>
        F.resolve (
          eventStream (saying ({ data: RUN, event: RELOAD_EVENT, retry: 500 })),
        ),
    },
  })
