import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Config } from './app.ts'
import type { KitIsland, Manifest, Sheet } from './build.ts'
import type { Prebuilt } from './data.ts'
import type { ServerEvent } from './events.ts'
import type { Options as HandlerOptions } from './server.ts'
import type { Arrival, Live, Route } from './types.ts'
import { asksForLiveSocket, attachLive, frameOf, isLiveRoute, wantsUpgrade } from './events.ts'
import { socketResponse } from './reply.ts'
import { answered, drawingOf, routesFrom } from './stand.ts'

const CHUNK_BASE = '/_kit/'

const FILE_BASE = '/static/'

/** The one Durable Object every isolate shares. */
const LIVE_NAME = 'kit'

const SOCKET = 'websocket'

/** What a build wrote, carried into the Worker as a module rather than read off a disk the isolate does not have. */
export type WorkerRecord = {
  readonly manifest: Manifest
  /** Where the stylesheet is served from, or `null` when the build wrote none. */
  readonly styles: string | null
  readonly styleIds: readonly string[]
  /** What the static loads read, or nothing where the build read none. */
  readonly data?: Prebuilt | null
}

/** What `worker` adds to the app. */
export type WorkerOptions = {
  readonly record: WorkerRecord
}

/** The asset binding. */
export type AssetBinding = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

/** An id `idFromName` handed back. */
export type LiveId = unknown

/** The `KIT_LIVE` binding: one namespace, one object named {@link LIVE_NAME}. */
export type LiveNamespace = {
  idFromName(name: string): LiveId
  get(id: LiveId): {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  }
}

/** The bindings kit itself reads. */
export type WorkerBindings = {
  readonly ASSETS?: AssetBinding
  readonly KIT_LIVE?: LiveNamespace
}

/** The slice of the platform's context kit uses: finishing work after the reply. */
export type WorkerContext = {
  waitUntil(promise: Promise<unknown>): void
}

/** What a Worker entry exports as its default. */
export type WorkerHandler<E> = {
  fetch(request: Request, env: E, ctx: WorkerContext): Promise<Response>
}

/** What the platform passes a Durable Object. */
export type DurableObjectState = {
  readonly id?: unknown
  readonly storage?: unknown
  acceptWebSocket(ws: WebSocket): void
  getWebSockets(): readonly WebSocket[]
}

type Paired = {
  readonly 0: WebSocket
  readonly 1: WebSocket
}

type Accepted = WebSocket & { accept(): void }

const isServerEvent = (value: unknown): value is ServerEvent =>
  P.isStrMap (value) && P.isString (value.data)

const parsed = (request: Request): F.Future<unknown, P.Maybe<unknown>> =>
  P.map (P.eitherToMaybe<unknown, unknown>) (
    F.coalesce (P.left<unknown, unknown>) (P.right<unknown, unknown>) (
      F.attemptP (() => request.json () as Promise<unknown>),
    ),
  )

const required = (): Response =>
  new Response (null, { status: 426, headers: { upgrade: SOCKET } })

const pairCtor = (): P.Maybe<new () => Paired> =>
  P.fromNullable (
    (globalThis as { WebSocketPair?: new () => Paired }).WebSocketPair,
  )

const paired = (): Paired => {
  const Ctor = P.maybeToNullable (pairCtor ())
  if (Ctor === null) throw new Error ('kit: WebSocketPair is missing')
  return new Ctor ()
}

const told = (text: string) => (socket: WebSocket): void => {
  void P.maybeEncase ((one: WebSocket) => one.send (text)) (socket)
}

/**
 * The Durable Object `stale` and `announce` publish to. `/live` attaches a hibernating WebSocket here.
 * @example
 * ```ts
 * export { KitLive } from '@algosail/plykit/workers'
 * ```
 */
export class KitLive {
  private readonly state: DurableObjectState

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state
  }

  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request (input, init)
    if (request.method === 'POST') return this.posted (request)
    if (wantsUpgrade (request)) return Promise.resolve (this.opened ())
    return Promise.resolve (required ())
  }

  // Push-only. The platform answers Close, and a client frame is ignored.
  webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): void {}

  webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): void {}

  webSocketError(_ws: WebSocket, _error: unknown): void {}

  private opened(): Response {
    const pair = paired ()
    this.state.acceptWebSocket (pair[1])
    return socketResponse (101, { upgrade: SOCKET }, pair[0])
  }

  private publish(one: ServerEvent): void {
    const text = frameOf (one)
    P.forEach (told (text)) (this.state.getWebSockets ())
  }

  private taking(value: P.Maybe<unknown>): Response {
    const event = P.chain (P.fromPredicate (isServerEvent)) (value)
    return P.maybe_ (() => new Response (null, { status: 400 })) (
      (one: ServerEvent) => {
        this.publish (one)
        return new Response (null, { status: 204 })
      },
    ) (event)
  }

  private posted(request: Request): Promise<Response> {
    return F.promise (
      P.map ((value: P.Maybe<unknown>) => this.taking (value)) (
        parsed (request),
      ),
    )
  }
}

const sheetIn = (record: WorkerRecord): Sheet => ({
  styles: P.fromNullable (record.styles),
  styleIds: record.styleIds,
})

const dataIn = (record: WorkerRecord): P.Maybe<Prebuilt> =>
  P.fromNullable (record.data ?? undefined)

const withSlash = (base: string): string =>
  P.endsWith ('/') (base) ? base : `${base}/`

const basesIn = <S, E>(config: Config<S, E>): readonly string[] =>
  P.concat ([withSlash (P.defaultTo (CHUNK_BASE) (config.base))]) (
    config.assets === undefined
      ? []
      : [withSlash (P.defaultTo (FILE_BASE) (config.assets.base))],
  )

const under = (bases: readonly string[]) => (path: string): boolean =>
  P.any ((base: string) => P.startsWith (base) (path)) (bases)

const asksForFile = (request: Request): boolean =>
  request.method === 'GET' || request.method === 'HEAD'

const fromAssets =
  (bases: readonly string[]) =>
  (env: WorkerBindings) =>
  (request: Request): F.Future<unknown, P.Maybe<Response>> => {
    const assets = env.ASSETS
    if (assets === undefined || !asksForFile (request)) {
      return F.resolve (P.nothing<Response> ())
    }
    if (!under (bases) (new URL (request.url).pathname)) {
      return F.resolve (P.nothing<Response> ())
    }
    return P.map (P.just<Response>) (F.attemptP (() => assets.fetch (request)))
  }

const arrivalOf = <E>(request: Request): Arrival<E> =>
  P.maybe_<Arrival<E>> (P.K ({})) ((hostname: string): Arrival<E> => ({
    remoteAddr: { hostname },
  })) (P.fromNullable (request.headers.get ('cf-connecting-ip')))

const stubOf = (ns: LiveNamespace) => ns.get (ns.idFromName (LIVE_NAME))

const relayTo = (ns: LiveNamespace, ctx: WorkerContext): Live => ({
  send: (event): void => {
    ctx.waitUntil (stubOf (ns).fetch ('https://kit-live/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify (event),
    }))
  },
})

const adopted = (server: Accepted): void => {
  server.accept ()
  const stop = attachLive ((text: string): void => {
    told (text) (server)
  })
  const leave = (): void => stop ()
  server.addEventListener ('close', leave)
  server.addEventListener ('error', leave)
}

const inProcess = (): P.Maybe<Response> =>
  P.map ((Ctor: new () => Paired) => {
    const pair = new Ctor ()
    adopted (pair[1] as Accepted)
    return socketResponse (101, { upgrade: SOCKET }, pair[0])
  }) (pairCtor ())

const handling = <S, E>(
  config: Config<S, E>,
  record: WorkerRecord,
  routes: readonly Route<S, E>[],
) =>
  answered (drawingOf ({
    options: config as HandlerOptions<S, E> & {
      readonly include?: readonly KitIsland[]
    },
    manifest: record.manifest,
    sheet: sheetIn (record),
    routes,
  }))

const orDrawn =
  (draw: () => Promise<Response>) =>
  (asset: P.Maybe<Response>): Promise<Response> =>
    P.maybe_ (draw) ((res: Response) => Promise.resolve (res)) (asset)

/**
 * The app as a Worker.
 * @example
 * ```ts
 * // worker.ts
 * import { KitLive, worker } from '@algosail/plykit/workers'
 * import application from './app.ts'
 * import record from './dist/record.json' with { type: 'json' }
 *
 * export { KitLive }
 * export default worker (application, { record })
 * ```
 */
export function worker<S, E = unknown>(
  config: Config<S, E>,
  options: WorkerOptions,
): WorkerHandler<E & WorkerBindings> {
  const routes = routesFrom (config) (dataIn (options.record))
  const ownsLive = P.any (isLiveRoute) (routes)
  const handle = handling (config, options.record, routes)
  const assets = fromAssets (basesIn (config))
  const orSocket =
    (env: WorkerBindings) =>
    (request: Request) =>
    (draw: () => Promise<Response>): Promise<Response> => {
      if (!ownsLive || !asksForLiveSocket (request)) return draw ()
      const ns = env.KIT_LIVE
      if (ns !== undefined) return stubOf (ns).fetch (request)
      return P.maybe_ (draw) ((res: Response) => Promise.resolve (res)) (
        inProcess (),
      )
    }
  return {
    fetch: (
      request: Request,
      env: E & WorkerBindings,
      ctx: WorkerContext,
    ): Promise<Response> =>
      F.promise (
        P.chain ((asset: P.Maybe<Response>) =>
          F.attemptP (() => {
            const live = env.KIT_LIVE === undefined
              ? undefined
              : relayTo (env.KIT_LIVE, ctx)
            const draw = (): Promise<Response> =>
              handle (request, { ...arrivalOf<E> (request), env, live })
            return orDrawn (() => orSocket (env) (request) (draw)) (asset)
          }),
        ) (assets (env) (request)),
      ),
  }
}
