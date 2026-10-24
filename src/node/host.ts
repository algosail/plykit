import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Config, Options } from '../app/config.ts'
import type { Prebuilt } from '../app/data.ts'
import type { Options as HandlerOptions } from '../app/server.ts'
import type { Draws } from '../app/stand.ts'
import type { Arrival, Context, Reply, Route } from '../app/types.ts'
import type {
  Options as BuildOptions,
  Built,
  KitIsland,
  Manifest,
  Sheet,
  Where,
} from '../build/build.ts'
import type { StaticOptions } from '../fs/static.ts'
import { liveClaimFor } from '../app/events.ts'
import { CHUNK_BASE } from '../app/prefixes.ts'
import { sendingOut } from '../app/server.ts'
import { drawingOf, routesFrom } from '../app/stand.ts'
import {
  build,
  chunkDir,
  discover,
  lastSheet,
  PUBLIC_PREFIX,
  sheetOf,
} from '../build/build.ts'
import { readPrebuilt } from '../build/read.ts'
import { files, forever } from '../fs/static.ts'

const BASE = CHUNK_BASE

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
type Placed<C extends Context> = {
  readonly options: Options<C>
  readonly base: string
  readonly outDir: string
}

const builds = <C extends Context>(options: Options<C>): boolean => options.build !== false

const whereIn = <C extends Context>(at: Placed<C>): Where => ({
  outDir: at.outDir,
  base: at.base,
  include: at.options.include,
})

const buildingIn = <C extends Context>(at: Placed<C>): BuildOptions<C> => ({
  ...whereIn (at),
  outDir: at.outDir,
  minify: at.options.minify,
  extract: at.options.styles === undefined,
})

const asPlaced = <C extends Context>(options: Options<C>) => (outDir: string): Placed<C> => ({
  options,
  base: P.defaultTo (BASE) (options.base),
  outDir,
})

const placing = <C extends Context>(options: Options<C>): F.Future<unknown, Placed<C>> =>
  P.map (asPlaced (options)) (
    F.attemptP (() => chunkDir (options, builds (options))),
  )

const building = <C extends Context>(at: Placed<C>): F.Future<unknown, Made> =>
  P.map (asBuilt) (F.attemptP (() => build (buildingIn (at))))

const finding = <C extends Context>(at: Placed<C>): F.Future<unknown, Made> =>
  P.lift2 (asFound) (F.attemptP (() => discover (whereIn (at)))) (
    lastSheet (at.outDir, at.base),
  )

const eitherWay = <C extends Context>(at: Placed<C>): F.Future<unknown, Made> =>
  P.boolean (finding (at)) (building (at)) (builds (at.options))

const madeIn = <C extends Context>(at: Placed<C>): F.Future<unknown, Made> =>
  P.map (warned) (eitherWay (at))

/** The same, once the islands are built or found. */
type Making<C extends Context> = Placed<C> & { readonly made: Made }

const withMade = <C extends Context>(at: Placed<C>) => (made: Made): Making<C> => ({
  ...at,
  made,
})

const making = <C extends Context>(at: Placed<C>): F.Future<unknown, Making<C>> =>
  P.map (withMade (at)) (madeIn (at))

const nothingRead: F.Future<unknown, P.Maybe<Prebuilt>> = F.resolve (
  P.nothing<Prebuilt> (),
)

const reads = <C extends Context>(options: Options<C>): boolean => options.prebuilt !== false

const reading = <C extends Context>(at: Making<C>): F.Future<unknown, P.Maybe<Prebuilt>> =>
  F.attemptP (() => readPrebuilt (at.outDir))

const readIn = <C extends Context>(at: Making<C>): F.Future<unknown, P.Maybe<Prebuilt>> =>
  P.boolean (nothingRead) (reading (at)) (reads (at.options))

const routesIn = <C extends Context>(at: Making<C>): F.Future<unknown, readonly Route<C>[]> =>
  P.map (routesFrom (at.options)) (readIn (at))

/** Everything the app settled, and the routes it answers with. */
type Standing<C extends Context> = Making<C> & { readonly routes: readonly Route<C>[] }

const withRoutes =
  <C extends Context>(at: Making<C>) => (routes: readonly Route<C>[]): Standing<C> => ({
    ...at,
    routes,
  })

const standing = <C extends Context>(at: Making<C>): F.Future<unknown, Standing<C>> =>
  P.map (withRoutes (at)) (routesIn (at))

const started = <C extends Context>(options: Options<C>): F.Future<unknown, Standing<C>> =>
  P.pipe (placing<C>, P.chain (making<C>), P.chain (standing<C>)) (options)

/** Something that may have an answer for a request, and may not. */
type Serves = (request: Request) => F.Future<unknown, P.Maybe<Reply>>

const drawing = <C extends Context>(at: Standing<C>): Draws<C['env']> =>
  drawingOf ({
    options: at.options as HandlerOptions<C> & {
      readonly include?: readonly KitIsland[]
    },
    manifest: at.made.manifest,
    sheet: at.made.sheet,
    routes: at.routes,
  })

const chunksIn = <C extends Context>(at: Standing<C>): StaticOptions => ({
  dir: at.outDir,
  base: at.base,
  cache: chunkCache,
  serves: isChunk,
})

const assetsIn = <C extends Context>(at: Standing<C>): readonly StaticOptions[] =>
  P.toArray (P.fromNullable (at.options.assets))

const dirsIn = <C extends Context>(at: Standing<C>): readonly StaticOptions[] =>
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

const waysIn = <C extends Context>(at: Standing<C>): readonly Serves[] =>
  P.map (files) (dirsIn (at))

const answering = <C extends Context>(at: Standing<C>): Draws<C['env']> =>
  P.foldr (orDrawn<C['env']>) (drawing (at)) (waysIn (at))

const asResponse = (
  drawn: F.Future<unknown, Reply>,
): F.Future<unknown, Response> => P.map (sendingOut) (drawn)

const responding = <C extends Context>(
  at: Standing<C>,
): (request: Request, from?: Arrival<C['env']>) => Promise<Response> => {
  const drawn = answering (at)
  const claim = liveClaimFor (at.routes)
  return (request: Request, from?: Arrival<C['env']>): Promise<Response> =>
    P.maybe_ (
      () => F.promise (asResponse (drawn (request, from))),
    ) ((res: Response) => Promise.resolve (res)) (claim (request))
}

/**
 * Builds the app's islands, then answers requests: a file, a chunk from the build, or a rendered page.
 * @example
 * ```ts
 * import { app, listen } from '@algosail/plykit/node'
 * await listen (await app ({
 *   routes,
 * }))
 * ```
 */
export async function app<C extends Context = Context>(
  options: Options<C>,
): Promise<(request: Request, from?: Arrival<C['env']>) => Promise<Response>> {
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

const withReload = <C extends Context>(config: Config<C>): readonly KitIsland[] =>
  P.pipe (
    P.defaultTo<readonly KitIsland[]> ([]),
    P.append<KitIsland> ('reload'),
    P.nub<KitIsland>,
  ) (config.include)

/**
 * The app as it runs where a build has already written the chunks: no bundler and no writing.
 * @example
 * ```ts
 * import { listen, serve } from '@algosail/plykit/node'
 * import application from './app.ts'
 * await listen (await serve (application))
 * ```
 */
export async function serve<C extends Context = Context>(
  config: Config<C>,
): Promise<(request: Request, from?: Arrival<C['env']>) => Promise<Response>> {
  return await app ({ ...config, build: false } as Options<C>)
}

/**
 * The same app, built at start-up, logging every answer, and reloading the page when it restarts.
 * @example
 * ```ts
 * import { dev, listen } from '@algosail/plykit/node'
 * import application from './app.ts'
 * await listen (await dev (application))
 * ```
 */
export async function dev<C extends Context = Context>(
  config: Config<C>,
): Promise<(request: Request, from?: Arrival<C['env']>) => Promise<Response>> {
  return logging (
    await app ({
      ...config,
      build: true,
      minify: false,
      prebuilt: false,
      include: withReload (config),
    } as Options<C>),
  )
}
