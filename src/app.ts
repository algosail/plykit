import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type {
  Options as BuildOptions,
  Built,
  KitIsland,
  Manifest,
  Sheet,
  Where,
} from './build.ts'
import type { Prebuilt } from './data.ts'
import type { Options as HandlerOptions } from './server.ts'
import type { Draws } from './stand.ts'
import type { StaticOptions } from './static.ts'
import type { Arrival, Middleware, Reply, Route } from './types.ts'
import {
  build,
  chunkDir,
  discover,
  lastSheet,
  PUBLIC_PREFIX,
  sheetOf,
} from './build.ts'
import { liveClaimFor } from './events.ts'
import { readPrebuilt } from './read.ts'
import { sendingOut } from './server.ts'
import { drawingOf, routesFrom } from './stand.ts'
import { files, forever } from './static.ts'

type Given<S, E> = Omit<HandlerOptions<S, E>, 'chunks' | 'through'>

/** How to run an app. */
export type Options<S = unknown, E = unknown> = Given<S, E> & {
  /** What every page and every endpoint goes through — the list `answer` takes, in the same order: the first is the outermost. */
  readonly through?: readonly Middleware<S, E>[]
  /** Where the island chunks are written. */
  readonly outDir?: URL | string
  /** The URL prefix the chunks are served under. */
  readonly base?: string
  /** Build the islands at start-up, which is the default and is what `dev` does. */
  readonly build?: boolean
  readonly minify?: boolean
  /** A directory of files to serve beside the pages — pictures, fonts, a favicon. */
  readonly assets?: StaticOptions
  /** kit's own islands this app wants: `['navigation', 'live']`. */
  readonly include?: readonly KitIsland[]
  /** Whether to answer a static page from what a build read, instead of reading it again. */
  readonly prebuilt?: boolean
}

const BASE = '/_kit/'

const CHUNK = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\.(js|css|map)$/

const isChunk: (name: string) => boolean = P.test (CHUNK)

const chunkCache: (name: string) => string = P.K (forever ())

/** What a start-up settled about the islands, whether it built them or read off what a build left behind: which chunk each island is in, where the stylesheet is, and what of the environment could not be put in. */
type Made = {
  readonly manifest: Manifest
  readonly sheet: Sheet
  /** Names an island reads that a build could not inline. */
  readonly unread: readonly string[]
}

const sayUnread = (name: string): void =>
  console.warn (
    `[kit] island reads ${name} — in the browser \`process.env\` is not the server environment; ` +
      `a public name starts with \`${PUBLIC_PREFIX}\``,
  )

const tellingUnread = (made: Made): unknown => P.forEach (sayUnread) (made.unread)

const warned: (made: Made) => Made = P.tap (tellingUnread)

const asBuilt = (built: Built): Made => ({
  manifest: built.manifest,
  sheet: sheetOf (built),
  unread: built.env.left,
})

const asFound = (manifest: Manifest) => (sheet: Sheet): Made => ({
  manifest,
  sheet,
  unread: [],
})

/** The options, and the two things every step below needs worked out from them. */
type Placed<S, E> = {
  readonly options: Options<S, E>
  readonly base: string
  readonly outDir: string
}

const builds = <S, E>(options: Options<S, E>): boolean => options.build !== false

const whereIn = <S, E>(at: Placed<S, E>): Where => ({
  outDir: at.outDir,
  base: at.base,
  include: at.options.include,
})

const buildingIn = <S, E>(at: Placed<S, E>): BuildOptions<S> => ({
  ...whereIn (at),
  outDir: at.outDir,
  minify: at.options.minify,
  extract: at.options.styles === undefined,
})

const asPlaced = <S, E>(options: Options<S, E>) => (outDir: string): Placed<S, E> => ({
  options,
  base: P.defaultTo (BASE) (options.base),
  outDir,
})

const placing = <S, E>(options: Options<S, E>): F.Future<unknown, Placed<S, E>> =>
  P.map (asPlaced (options)) (
    F.attemptP (() => chunkDir (options, builds (options))),
  )

const building = <S, E>(at: Placed<S, E>): F.Future<unknown, Made> =>
  P.map (asBuilt) (F.attemptP (() => build (buildingIn (at))))

const finding = <S, E>(at: Placed<S, E>): F.Future<unknown, Made> =>
  P.lift2 (asFound) (F.attemptP (() => discover (whereIn (at)))) (
    lastSheet (at.outDir, at.base),
  )

const eitherWay = <S, E>(at: Placed<S, E>): F.Future<unknown, Made> =>
  P.boolean (finding (at)) (building (at)) (builds (at.options))

const madeIn = <S, E>(at: Placed<S, E>): F.Future<unknown, Made> =>
  P.map (warned) (eitherWay (at))

/** The same, once the islands are built or found. */
type Making<S, E> = Placed<S, E> & { readonly made: Made }

const withMade = <S, E>(at: Placed<S, E>) => (made: Made): Making<S, E> => ({
  ...at,
  made,
})

const making = <S, E>(at: Placed<S, E>): F.Future<unknown, Making<S, E>> =>
  P.map (withMade (at)) (madeIn (at))

const nothingRead: F.Future<unknown, P.Maybe<Prebuilt>> = F.resolve (
  P.nothing<Prebuilt> (),
)

const reads = <S, E>(options: Options<S, E>): boolean => options.prebuilt !== false

const reading = <S, E>(at: Making<S, E>): F.Future<unknown, P.Maybe<Prebuilt>> =>
  F.attemptP (() => readPrebuilt (at.outDir))

const readIn = <S, E>(at: Making<S, E>): F.Future<unknown, P.Maybe<Prebuilt>> =>
  P.boolean (nothingRead) (reading (at)) (reads (at.options))

const routesIn = <S, E>(at: Making<S, E>): F.Future<unknown, readonly Route<S, E>[]> =>
  P.map (routesFrom (at.options)) (readIn (at))

/** Everything the app settled, and the routes it answers with. */
type Standing<S, E> = Making<S, E> & { readonly routes: readonly Route<S, E>[] }

const withRoutes =
  <S, E>(at: Making<S, E>) => (routes: readonly Route<S, E>[]): Standing<S, E> => ({
    ...at,
    routes,
  })

const standing = <S, E>(at: Making<S, E>): F.Future<unknown, Standing<S, E>> =>
  P.map (withRoutes (at)) (routesIn (at))

const started = <S, E>(options: Options<S, E>): F.Future<unknown, Standing<S, E>> =>
  P.pipe ([placing<S, E>, P.chain (making<S, E>), P.chain (standing<S, E>)]) (options)

/** Something that may have an answer for a request, and may not. */
type Serves = (request: Request) => F.Future<unknown, P.Maybe<Reply>>

const drawing = <S, E>(at: Standing<S, E>): Draws<E> =>
  drawingOf ({
    options: at.options as HandlerOptions<S, E> & {
      readonly include?: readonly KitIsland[]
    },
    manifest: at.made.manifest,
    sheet: at.made.sheet,
    routes: at.routes,
  })

const chunksIn = <S, E>(at: Standing<S, E>): StaticOptions => ({
  dir: at.outDir,
  base: at.base,
  cache: chunkCache,
  serves: isChunk,
})

const assetsIn = <S, E>(at: Standing<S, E>): readonly StaticOptions[] =>
  P.toArray (P.fromNullable (at.options.assets))

const dirsIn = <S, E>(at: Standing<S, E>): readonly StaticOptions[] =>
  P.append (chunksIn (at)) (assetsIn (at))

const asSent = (reply: Reply): F.Future<unknown, Reply> => F.resolve (reply)

const drawingOn =
  <E>(rest: Draws<E>) =>
  (request: Request, from?: Arrival<E>) =>
  (): F.Future<unknown, Reply> => rest (request, from)

const sending = <E>(rest: Draws<E>) =>
(
  request: Request,
  from?: Arrival<E>,
): (found: P.Maybe<Reply>) => F.Future<unknown, Reply> =>
  P.maybe_ (drawingOn (rest) (request, from)) (asSent)

const orDrawn =
  <E>(way: Serves, rest: Draws<E>): Draws<E> =>
  (request: Request, from?: Arrival<E>): F.Future<unknown, Reply> =>
    P.chain (sending (rest) (request, from)) (way (request))

const waysIn = <S, E>(at: Standing<S, E>): readonly Serves[] =>
  P.map (files) (dirsIn (at))

const answering = <S, E>(at: Standing<S, E>): Draws<E> =>
  P.foldr (orDrawn<E>) (drawing (at)) (waysIn (at))

const asResponse = (
  drawn: F.Future<unknown, Reply>,
): F.Future<unknown, Response> => P.map (sendingOut) (drawn)

const responding = <S, E>(
  at: Standing<S, E>,
): (request: Request, from?: Arrival<E>) => Promise<Response> => {
  const drawn = answering (at)
  const claim = liveClaimFor (at.routes)
  return (request: Request, from?: Arrival<E>): Promise<Response> =>
    P.maybe_ (
      () => F.promise (asResponse (drawn (request, from))),
    ) ((res: Response) => Promise.resolve (res)) (claim (request))
}

/** How an app is written down: exactly the options `app` takes. */
export type Config<S = unknown, E = unknown> = Options<S, E>

/**
 * Builds the app's islands, then answers requests: a file, a chunk from the build, or a rendered page.
 * @example
 * ```ts
 * // app :: Options -> Promise (Request -> Promise Response)
 * listen (await app ({
 *   routes,
 * }))
 * ```
 */
export async function app<S = unknown, E = unknown>(
  options: Options<S, E>,
): Promise<(request: Request, from?: Arrival<E>) => Promise<Response>> {
  return responding (await F.promise (started (options)))
}

const tookSince = (started: number): string =>
  ` in ${Math.round (performance.now () - started)}ms`

const sayAnswer =
  (request: Request) => (began: number) => (res: Response): Response => {
    console.log (
      `${request.method} ${new URL (request.url).pathname} → ${res.status}` +
        tookSince (began),
    )
    return res
  }

const logging =
  <E>(answers: (request: Request, from?: Arrival<E>) => Promise<Response>) =>
  async (request: Request, from?: Arrival<E>): Promise<Response> =>
    sayAnswer (request) (performance.now ()) (await answers (request, from))

const withReload = <S, E>(config: Config<S, E>): readonly KitIsland[] =>
  P.pipe ([
    P.defaultTo<readonly KitIsland[]> ([]),
    P.append<KitIsland> ('reload'),
    P.nub<KitIsland>,
  ]) (config.include)

/**
 * The app as it runs where a build has already written the chunks: no bundler and no writing.
 * @example
 * ```ts
 * // server.ts
 * import app from './app.ts'
 * await listen (await serve (app))
 * ```
 */
export async function serve<S = unknown, E = unknown>(
  config: Config<S, E>,
): Promise<(request: Request, from?: Arrival<E>) => Promise<Response>> {
  return await app ({ ...config, build: false } as Options<S, E>)
}

/**
 * The same app, built at start-up, logging every answer, and reloading the page when it restarts.
 * @example
 * ```ts
 * // dev.ts
 * import app from './app.ts'
 * await listen (await dev (app))
 * ```
 */
export async function dev<S = unknown, E = unknown>(
  config: Config<S, E>,
): Promise<(request: Request, from?: Arrival<E>) => Promise<Response>> {
  return logging (
    await app ({
      ...config,
      build: true,
      minify: false,
      prebuilt: false,
      include: withReload (config),
    } as Options<S, E>),
  )
}
