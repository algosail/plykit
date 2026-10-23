import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Config } from './app.ts'
import type { DirEntry } from './disk.ts'
import type { StaticOptions } from './static.ts'
import type { Route } from './types.ts'
import { app } from './app.ts'
import { chunkDir } from './build.ts'
import { addressesOf } from './data.ts'
import { copyFile, mkdir, readDir, within, writeText } from './disk.ts'
import { flat } from './router.ts'
import { directory, STATIC_BASE } from './static.ts'

/** Where the files go, and what goes beside them. */
export type SiteOptions = {
  /** The directory to write into, created if it is missing. */
  readonly out: URL | string
  /** Build the islands first, which is the default: one command should leave a directory that works. */
  readonly build?: boolean
  /** How a page's address becomes a file name. */
  readonly names?: 'index' | 'flat'
  /** The address asked for to produce `404.html` — a path no route claims, so that what comes back is the app's own refusal drawn by its own error view. */
  readonly missing?: string
}

/** One address, written. */
export type Written = {
  readonly path: string
  /** Where it landed, relative to `out`. */
  readonly file: string
  readonly bytes: number
}

/** One route that was asked for and could not be written, and why. */
export type Skipped = {
  readonly pattern: string
  readonly why: string
}

/** What a static build produced. */
export type Site = {
  readonly tag: 'site'
  readonly out: string
  readonly written: readonly Written[]
  readonly skipped: readonly Skipped[]
  /** The chunk and asset files copied in alongside the pages. */
  readonly beside: readonly string[]
}

const MISSING = '/_kit-missing'
const CHUNKS = /\.(js|css|map)$/

/** What one route, or one address, or the whole build came to. */
type Done = {
  readonly written: readonly Written[]
  readonly skipped: readonly Skipped[]
}

const Both: P.MonoidDict<P.Nullary<Done>> = {
  empty: (): Done => ({ written: [], skipped: [] }),
  concat: (a: Done, b: Done): Done => ({
    written: P.concat (a.written) (b.written),
    skipped: P.concat (a.skipped) (b.skipped),
  }),
}

const nothingDone: Done = Both.empty ()

const onlyWritten = (one: Written): Done => ({ written: [one], skipped: [] })

const onlySkipped = (one: Skipped): Done => ({ written: [], skipped: [one] })

const allDone = (all: readonly Done[]): Done => P.mconcat (Both) (all)

/** How a page's address becomes a file name. */
type Names = 'index' | 'flat'

const asFlat = (path: string): string => `${path.slice (1)}.html`

const asIndex = (path: string): string => `${path.slice (1)}/index.html`

const asDocument = (names: Names) => (path: string): string =>
  P.boolean (P.boolean (asIndex) (asFlat) (names === 'flat') (path)) ('index.html') (
    path === '/',
  )

const fileFor =
  (names: Names) => (route: Route<never>) => (path: string): string =>
    P.cases<Route<never>, string> ({
      endpoint: P.K (path.slice (1)),
      page: P.K (asDocument (names) (path)),
    }) (route)

const isEndpointWithoutGet = (route: Route<never>): boolean =>
  route.tag === 'endpoint' && route.on.GET === undefined

const alsoAnswers = (route: Route<never>): boolean =>
  route.tag === 'page' && P.sortedKeys (route.on).length > 0

const skippedIf = (yes: boolean) => (why: () => Skipped): P.Maybe<Skipped> =>
  P.map ((_: true) => why ()) (P.fromPredicate (P.isTrue) (yes))

const nothingToWrite = (route: Route<never>): P.Maybe<Skipped> =>
  skippedIf (isEndpointWithoutGet (route)) (() => ({
    pattern: route.pattern,
    why: 'no GET',
  }))

const onlyGetSurvives = (route: Route<never>): P.Maybe<Skipped> =>
  skippedIf (alsoAnswers (route)) (() => ({
    pattern: route.pattern,
    why: `only GET is written to files; ${
      P.joinWith (', ') (P.sortedKeys (route.on))
    } will not answer on a static site`,
  }))

const noteOn = (route: Route<never>): Done =>
  P.maybe_ (P.K (nothingDone)) (onlySkipped) (onlyGetSurvives (route))

/** Everything the writing needs, worked out once. */
type Writing = {
  readonly out: URL
  readonly names: Names
  readonly ask: (path: string) => F.Future<unknown, Response>
}

const refusedAt = (path: string) => (res: Response): F.Future<unknown, never> =>
  F.attemptP (async () => {
    await res.body?.cancel ()
    throw new Error (`staticSite: ${path} answered ${res.status}`)
  })

const okAt = (path: string) => (res: Response): F.Future<unknown, Response> =>
  P.boolean<F.Future<unknown, Response>> (refusedAt (path) (res)) (F.resolve (res)) (
    res.status === 200,
  )

const bodyOf = (res: Response): F.Future<unknown, string> =>
  F.attemptP (() => res.text ())

const puttingIn =
  (at: Writing) =>
  (file: string) =>
  (body: string): F.Future<unknown, number> =>
    F.attemptP (async () => {
      const to = new URL (file, at.out)
      await mkdir (new URL ('./', to), { recursive: true })
      await writeText (to, body)
      return new TextEncoder ().encode (body).length
    })

const writtenAt =
  (at: Writing) =>
  (route: Route<never>) =>
  (path: string): F.Future<unknown, Done> => {
    const file = fileFor (at.names) (route) (path)
    return P.map ((bytes: number) => onlyWritten ({ path, file, bytes })) (
      P.chain (puttingIn (at) (file)) (
        P.chain (bodyOf) (P.chain (okAt (path)) (at.ask (path))),
      ),
    )
  }

const addressesIn = <S>(
  route: Route<S>,
): F.Future<unknown, readonly string[]> => F.attemptP (() => addressesOf (route))

const writtenFor =
  (at: Writing) => (route: Route<never>): F.Future<unknown, Done> =>
    P.map (allDone) (
      P.chain ((paths: readonly string[]) =>
        F.parallel (1) (P.map (writtenAt (at) (route)) (paths)),
      ) (addressesIn (route)),
    )

const withNote = (route: Route<never>) => (one: Done): Done =>
  allDone ([noteOn (route), one])

const doneWith =
  (at: Writing) => (route: Route<never>): F.Future<unknown, Done> =>
    P.maybe_ (
      () => P.map (withNote (route)) (writtenFor (at) (route)),
    ) (
      (one: Skipped) => F.resolve (onlySkipped (one)),
    ) (nothingToWrite (route))

const isStill = (route: Route<never>): boolean => route.still.on

const stillIn = (routes: readonly Route<never>[]): readonly Route<never>[] =>
  P.filter (isStill) (routes)

const everythingIn =
  (at: Writing) => (routes: readonly Route<never>[]): F.Future<unknown, Done> =>
    P.map (allDone) (F.parallel (1) (P.map (doneWith (at)) (stillIn (routes))))

const pathOf = (pre: string) => (entry: DirEntry): string =>
  pre + entry.name

const keptOut = (skip: string | undefined) => (name: string): boolean =>
  skip === undefined || (name !== skip && !name.startsWith (`${skip}/`))

const isKept =
  (keep: (name: string) => boolean, skip: string | undefined, pre: string) =>
  (entry: DirEntry): boolean =>
    entry.isFile && keep (pathOf (pre) (entry)) && keptOut (skip) (pathOf (pre) (entry))

const goesDeeper =
  (skip: string | undefined, pre: string) => (entry: DirEntry): boolean =>
    entry.isDirectory && keptOut (skip) (pathOf (pre) (entry))

const copyingTo =
  (source: URL, to: URL) => (entry: DirEntry): F.Future<unknown, void> =>
    F.attemptP (() =>
      copyFile (new URL (entry.name, source), new URL (entry.name, to)),
    )

async function copyInto(
  from: string | URL,
  to: URL,
  keep: (name: string) => boolean,
  skip?: string,
  pre = '',
): Promise<readonly string[]> {
  const source = directory (from)
  const all = await readDir (source)
  const entries = P.filter (isKept (keep, skip, pre)) (all)
  await mkdir (to, { recursive: true })
  await F.promise (
    F.parallel (Number.POSITIVE_INFINITY) (
      P.map (copyingTo (source, to)) (entries),
    ),
  )
  const deeper = await Promise.all (
    P.map ((entry: DirEntry) =>
      copyInto (
        new URL (entry.name + '/', source),
        new URL (entry.name + '/', to),
        keep,
        skip,
        pathOf (pre) (entry) + '/',
      ),
    ) (P.filter (goesDeeper (skip, pre)) (all)),
  )
  return P.concat (P.map (pathOf (pre)) (entries)) (deeper.flat ())
}

const is404 = (res: Response): boolean => res.status === 404

const as404 = (bytes: number): Done =>
  onlyWritten ({ path: '404', file: '404.html', bytes })

const writingMissing =
  (at: Writing) => (res: Response): F.Future<unknown, Done> =>
    P.map (as404) (P.pipe ([bodyOf, P.chain (puttingIn (at) ('404.html'))]) (res))

const notMissing = (path: string) => (res: Response): F.Future<unknown, Done> =>
  F.resolve (onlySkipped ({
    pattern: path,
    why: `404.html was not written: the address answered ${res.status}`,
  }))

const missingIn = (at: Writing) => (path: string): F.Future<unknown, Done> =>
  P.chain (
    P.ifElse<Response> (is404) (writingMissing (at)) (
      notMissing (path),
    ),
  ) (at.ask (path))

const withMissing =
  (at: Writing) => (path: string) => (pages: Done): F.Future<unknown, Done> =>
    P.map (andThen (pages)) (missingIn (at) (path))

const writingAll =
  (at: Writing) =>
  (path: string) =>
  (routes: readonly Route<never>[]): F.Future<unknown, Done> =>
    P.chain (withMissing (at) (path)) (everythingIn (at) (routes))

/**
 * Writes the app out as files: every route that says `static: true`, the chunks its islands were built into, whatever it serves as assets, and its own refusal as `404.html`.
 * @example
 * ```ts
 * // staticSite :: Config s -> SiteOptions -> Promise Site
 * const done = await staticSite (config, { out: new URL ('./dist/', import.meta.url) })
 * console.log (siteReport (done))
 * ```
 */
export async function staticSite<S = unknown>(
  config: Config<S>,
  options: SiteOptions,
): Promise<Site> {
  const out = directory (options.out)
  await mkdir (out, { recursive: true })

  const answer = await app ({
    ...config,
    build: P.defaultTo (true) (options.build),
  })
  const at: Writing = {
    out,
    names: P.defaultTo<Names> ('index') (options.names),
    ask: (path: string) =>
      F.attemptP (() => answer (new Request (`http://kit.local${path}`))),
  }

  const routes = flat (config.routes) as readonly Route<never>[]
  const done = await F.promise<unknown, Done> (
    writingAll (at) (P.defaultTo (MISSING) (options.missing)) (routes),
  )

  return {
    tag: 'site',
    out: out.pathname,
    written: P.sortBy ((one: Written) => one.path) (done.written),
    skipped: done.skipped,
    beside: await besideFor (config, out),
  }
}

const andThen = (pages: Done) => (missing: Done): Done =>
  allDone ([pages, missing])

const besideBase = <S>(config: Config<S>): string =>
  P.defaultTo ('/_kit/') (config.base).replace (/^\//, '')

const besideFor = async <S>(
  config: Config<S>,
  out: URL,
): Promise<readonly string[]> => {
  const chunks = await chunkDir (config, false)
  return P.concat (await besideAssets (config, out, chunks)) (
    await copyInto (
      chunks,
      new URL (besideBase (config), out),
      (name: string) => CHUNKS.test (name),
    ),
  )
}

const keepAll = (_: string): boolean => true

function besideAssets<S>(
  config: Config<S>,
  out: URL,
  chunks: string,
): Promise<readonly string[]> {
  return P.maybe_ (
    () => Promise.resolve<readonly string[]> ([]),
  ) (
    (assets: StaticOptions) =>
      copyInto (
        assets.dir,
        new URL (P.defaultTo (STATIC_BASE) (assets.base).replace (/^\//, ''), out),
        P.defaultTo (keepAll) (assets.serves),
        within (assets.dir, chunks),
      ),
  ) (P.fromNullable (config.assets))
}

/**
 * What a static build produced, in a line or three — for the command that ran it to print, the same way `report` prints an island build.
 * @example
 * ```ts
 * console.log (siteReport (await staticSite (config, { out })))
 * // /                        14930 B
 * // /about                    9218 B
 * //
 * // pages: 2, 24148 B · files beside: 9
 * // written to /path/to/dist/
 * ```
 */
export function siteReport(done: Site): string {
  return P.joinWith ('\n') (
    P.join ([
      P.map (asLine) (done.written),
      [''],
      [totalOf (done)],
      P.map (asNote) (done.skipped),
      [`written to ${done.out}`],
    ]),
  )
}

const asLine = (one: Written): string => `${one.path.padEnd (24)} ${one.bytes} B`

const asNote = (one: Skipped): string => `${one.pattern}: ${one.why}`

const bytesIn = (all: readonly Written[]): number =>
  P.reduce ((sum: number, one: Written) => sum + one.bytes) (0) (all)

const totalOf = (done: Site): string =>
  `pages: ${done.written.length}, ${bytesIn (done.written)} B · ` +
  `files beside: ${done.beside.length}`
