import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import * as esbuild from 'esbuild'
import type { Prepared } from './data.ts'
import type { DirEntry } from './disk.ts'
import type { Declared } from './island.ts'
import type { Routes } from './types.ts'
import { styleIds, styleSheet } from './css.ts'
import { DATA, prepare } from './data.ts'
import {
  mkdir,
  mkdtemp,
  readDir,
  readText,
  realpath,
  rename,
  rm,
  writeText,
} from './disk.ts'
import { replaceBlocks } from './extract.ts'
import { declared } from './island.ts'
import { aliasPlugin } from './scripts/alias-plugin.ts'
import { digest } from './sign.ts'

const refuse = (said: string): never => {
  throw new Error (said)
}

/** Where the browser finds each island's entry chunk, keyed by island name. */
export type Manifest = Readonly<P.StrMap<string>>

/** kit's own islands, which an app opts into by name rather than by re-exporting them from a file of its own. */
const sourceExt = import.meta.url.endsWith ('.ts') ? '.ts' : '.js'

const moduleUrl = (name: string): string =>
  new URL (`./${name}${sourceExt}`, import.meta.url).href

export const KIT_ISLANDS: { readonly [K in KitIsland]: string } = {
  navigation: moduleUrl ('navigate'),
  live: moduleUrl ('live'),
  reload: moduleUrl ('reload'),
}

/** One of kit's own islands, by name. */
export type KitIsland = 'navigation' | 'live' | 'reload'

/** The prefix that makes an environment variable public. */
export const PUBLIC_PREFIX = 'KIT_PUBLIC_'

const READ =
  /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\2\s*\])/g

/** What the build put into the chunks, and what it could not. */
export type Inlined = {
  /** Public names it found and substituted, with the value each one had. */
  readonly put: Readonly<P.StrMap<string | null>>
  /** Names without the prefix — these stay as reads and break in the browser. */
  readonly left: readonly string[]
}

const readEnv = (name: string): string | undefined => process.env[name]

const valueOf = (name: string): P.Maybe<string> =>
  P.chain ((said: string | undefined) => P.fromNullable (said)) (
    P.eitherToMaybe<unknown, string | undefined> (P.encase (readEnv) (name)),
  )

const isPublic = P.startsWith (PUBLIC_PREFIX)

const nameOfRead = (one: P.Matched): P.Maybe<string> =>
  P.alt (one.groups[0] ?? P.nothing<string> ()) (
    one.groups[2] ?? P.nothing<string> (),
  )

const namesIn = (source: string): readonly string[] =>
  P.nub (P.justs (P.map (nameOfRead) (P.matchAll (READ) (source))))

const Inlining: P.MonoidDict<P.Nullary<Inlined>> = {
  empty: (): Inlined => ({ put: {}, left: [] }),
  concat: (a: Inlined, b: Inlined): Inlined => ({
    put: P.concat (a.put) (b.put),
    left: P.concat (a.left) (b.left),
  }),
}

const asPut = (name: string): Inlined => ({
  put: P.singleton (name, P.fromMaybe<string | null> (null) (valueOf (name))),
  left: [],
})

const asLeft = (name: string): Inlined => ({ put: {}, left: [name] })

const seenOf: (name: string) => Inlined = P.ifElse<string> (isPublic) (
  asPut,
) (asLeft)

const seenIn = (source: string): Inlined =>
  P.mconcat (Inlining) (P.map (seenOf) (namesIn (source)))

const asLiteral = (value: string | null): string =>
  P.maybe_ (P.K ('void 0')) ((one: string) => JSON.stringify (one)) (
    P.fromNullable (value),
  )

const substituting =
  (seen: Inlined) =>
  (whole: string, dot: string, _quote: string, bracket: string): string =>
    P.maybe_ (P.K (whole)) (asLiteral) (
      P.lookup (dot || bracket) (seen.put),
    )

const savingTo =
  (path: string, source: string) =>
  (swapped: string): F.Future<unknown, void> =>
    P.boolean<F.Future<unknown, void>> (
      F.attemptP (() => writeText (path, swapped)),
    ) (F.resolve (undefined)) (swapped === source)

const inliningIn =
  (path: string) => (source: string): F.Future<unknown, Inlined> => {
    const seen = seenIn (source)
    return P.voidRight (seen) (
      savingTo (path, source) (source.replace (READ, substituting (seen))),
    )
  }

const inliningAt = (path: string): F.Future<unknown, Inlined> =>
  P.chain (inliningIn (path)) (F.attemptP (() => readText (path)))

const isChunk = P.endsWith ('.js')

const tidied = (seen: Inlined): Inlined => ({
  put: seen.put,
  left: P.sort (P.nub (seen.left)),
})

const chunkPaths = (outDir: string) => (files: readonly string[]) =>
  P.map ((name: string) => `${outDir}/${name}`) (P.filter (isChunk) (files))

/** Puts the public values into the chunks the bundler just wrote, and says which reads it had to leave alone. */
const gatheredSeen = (all: readonly Inlined[]): Inlined => tidied (allSeen (all))

const inlinePublic =
  (outDir: string) => (files: readonly string[]): F.Future<unknown, Inlined> =>
    P.map (gatheredSeen) (
      F.parallel (Number.POSITIVE_INFINITY) (
        P.map (inliningAt) (
          chunkPaths (outDir) (files),
        ),
      ),
    )

const allSeen = (all: readonly Inlined[]): Inlined => P.mconcat (Inlining) (all)

/** Where the chunks are served from, and which of kit's islands to include. */
export type Where = {
  /** Where a build left its chunks. */
  readonly outDir?: URL | string
  /** The URL prefix the chunks are served under. */
  readonly base?: string
  /** kit's own islands to build alongside the app's: `['navigation', 'live']`. */
  readonly include?: readonly KitIsland[]
}

/** What to build, and where to put it. */
export type Options<S = unknown> = Where & {
  /** The directory the chunks are written into, created if it is missing. */
  /** Whether to minify the chunks. */
  readonly minify?: boolean
  /** Whether to work the style blocks out here and put the class names into the chunks, instead of leaving the text for the browser to work out. */
  readonly extract?: boolean
  /** The app's routes. */
  readonly routes?: Routes<S>
  /** The app's state, for the loads above. */
  readonly state?: (request: Request) => F.Future<unknown, S>
}

/** What something weighs, as written and as it goes over the wire. */
export type Bytes = { readonly raw: number; readonly gzip: number }

/** What a build produced. */
export type Built = {
  readonly tag: 'built'
  readonly manifest: Manifest
  /** Where the app's stylesheet is served from, or `null` if nothing was registered. */
  readonly styles: string | null
  /** The ids of the blocks in that stylesheet, for the page that links it. */
  readonly styleIds: readonly string[]
  /** How big the stylesheet is, as written and as it goes over the wire. */
  readonly styleBytes: Bytes
  /** What each island costs a page that places it: its own entry chunk and every chunk under that one, summed. */
  readonly islandBytes: Readonly<P.StrMap<Bytes>>
  /** Every file this build wrote: one `<name>.js` per island, the `chunk-*.js` they share, and the stylesheet. */
  readonly files: readonly string[]
  /** What of the environment went into those chunks, and what could not. */
  readonly env: Inlined
  /** What the static pages' loads read, or nothing where none were given. */
  readonly data: P.Maybe<Prepared>
}

/** Where chunks go when `outDir` is not set. It sits at the application root, and it is not part of `assets`. */
export const KIT_DIR = '.kit'

/** Where a build leaves its own inventory, so the next one can clear it. */
export const RECORD = 'kit-build.json'

const BASE = '/_kit/'

type Found = Declared

const RUNTIME = moduleUrl ('island')

const entrySource = (found: Found): string =>
  P.joinWith ('\n') ([
    `import { hydrateIslands } from ${JSON.stringify (RUNTIME)}`,
    `import ${JSON.stringify (found.module)}`,
    'hydrateIslands(document.body)',
    '',
  ])

const importing = (name: KitIsland): F.Future<unknown, void> =>
  P.voided (F.attemptP (() => import (KIT_ISLANDS[name])))

const opted = (where: Where): readonly KitIsland[] =>
  P.defaultTo<readonly KitIsland[]> ([]) (where.include)

const isKits = (name: string): boolean => name in KIT_ISLANDS

const wanted = (where: Where) => (one: Found): boolean =>
  !isKits (one.name) || P.elem (one.name as KitIsland) (opted (where))

const naming = (where: Where): F.Future<unknown, readonly Found[]> =>
  P.map (() => P.filter (wanted (where)) (declared ())) (
    F.parallel (Number.POSITIVE_INFINITY) (
      P.map (importing) (
        opted (where),
      ),
    ),
  )

const asManifest =
  (base: string) => (entries: Readonly<P.StrMap<string>>): Manifest =>
    P.map ((file: string) => `${base}${file}`) (entries)

const asFileName = (name: string): string =>
  P.replaceAll ('/', '-') (P.replaceAll ('@', '') (name))

const plainManifest = (base: string) => (found: readonly Found[]): Manifest =>
  P.fromPairs (
    P.map ((one: Found) =>
      P.pair (one.name, `${base}${asFileName (one.name)}.js`),
    ) (found),
  )

const shortHash = (text: string): F.Future<unknown, string> =>
  P.map ((one: string) => one.slice (0, 8)) (digest (text))

const movedTo =
  (outDir: string) =>
  (name: string) =>
  (hash: string): F.Future<unknown, P.Pair<string, string>> =>
    P.map (() => P.pair (name, `${asFileName (name)}-${hash}.js`)) (
      F.attemptP (() =>
        rename (
          `${outDir}/${asFileName (name)}.js`,
          `${outDir}/${asFileName (name)}-${hash}.js`,
        ),
      ),
    )

const renamed =
  (outDir: string) =>
  (name: string): F.Future<unknown, P.Pair<string, string>> =>
    P.chain ((text: string) => P.chain (movedTo (outDir) (name)) (shortHash (text))) (
      F.attemptP (() => readText (`${outDir}/${asFileName (name)}.js`)),
    )

const hashedEntries = <S>(
  one: Building<S>,
): F.Future<unknown, Readonly<P.StrMap<string>>> =>
  P.map ((ps: readonly P.Pair<string, string>[]) => P.fromPairs (ps)) (
    F.parallel (Number.POSITIVE_INFINITY) (
      P.map (renamed (one.outDir)) (
        P.map ((it: Found) => it.name) (one.found),
      ),
    ),
  )

const baseIn = (where: Where): string => P.defaultTo (BASE) (where.base)

/**
 * Where each island's chunk is, without building anything — the second half of `build` then `start`.
 * @example
 * ```ts
 * // discover :: Where -> Promise Manifest
 * await discover ({ outDir, include: ['navigation'] })
 * // => { counter: '/_kit/counter-GQ_D1D0e.js', … }   — as build wrote it
 * await discover ({})
 * // => { counter: '/_kit/counter.js', … }            — there was no build
 * ```
 */
export async function discover(where: Where): Promise<Manifest> {
  const found = await F.promise (naming (where))
  return await F.promise (
    P.map (P.fromMaybe (plainManifest (baseIn (where)) (found))) (
      P.map (manifestIn (baseIn (where))) (recordFor (where)),
    ),
  )
}

const recordFor = (where: Where): F.Future<unknown, P.Maybe<unknown>> =>
  P.maybe_ (
    P.K (F.resolve<unknown, P.Maybe<unknown>> (P.nothing ())),
  ) (
    (dir: URL | string) => recordAt (String (dir)),
  ) (P.fromNullable<URL | string> (where.outDir))

const stringsIn = (one: P.StrMap<unknown>): Manifest =>
  P.filter (P.isString) (one) as Manifest

const fileIn = (url: string): string => url.slice (url.lastIndexOf ('/') + 1)

const under = (base: string) => (url: string): string => `${base}${fileIn (url)}`

const rebased = (base: string) => (one: Manifest): Manifest =>
  P.map (under (base)) (one)

const manifestIn =
  (base: string) => (record: P.Maybe<unknown>): P.Maybe<Manifest> =>
    P.filter ((one: Manifest) => P.sortedKeys (one).length > 0) (
      P.map (rebased (base)) (
        P.map (stringsIn) (recordIn (fieldIn ('manifest') (record))),
      ),
    )

const parsedJson = (text: string): unknown => JSON.parse (text)

const parsed = (text: string): P.Maybe<unknown> =>
  P.eitherToMaybe (P.encase (parsedJson) (text))

const recordIn = (value: P.Maybe<unknown>): P.Maybe<P.StrMap<unknown>> =>
  P.chain (P.fromPredicate (P.isStrMap)) (value)

const valueAt =
  (name: string) => (record: P.StrMap<unknown>): P.Maybe<unknown> =>
    P.lookup (name) (record)

const fieldIn =
  (name: string) => (record: P.Maybe<unknown>): P.Maybe<unknown> =>
    P.chain (valueAt (name)) (recordIn (record))

const arrayIn = (value: P.Maybe<unknown>): readonly unknown[] =>
  P.fromMaybe<readonly unknown[]> ([]) (
    P.filter (P.isArray) (value) as P.Maybe<readonly unknown[]>,
  )

const listedBy =
  (claim: (value: unknown) => value is string) =>
  (value: P.Maybe<unknown>): readonly string[] =>
    P.filter (claim) (arrayIn (value)) as readonly string[]

const textAt = (path: string): F.Future<unknown, P.Maybe<string>> =>
  P.map (P.eitherToMaybe<unknown, string>) (
    F.coalesce ((e: unknown) => P.left<unknown, string> (e)) ((one: string) =>
      P.right<unknown, string> (one),
    ) (F.attemptP (() => readText (path))),
  )

const parsedIn = (text: P.Maybe<string>): P.Maybe<unknown> =>
  P.chain (parsed) (text)

const recordAt = (outDir: string): F.Future<unknown, P.Maybe<unknown>> =>
  P.map (parsedIn) (textAt (`${outDir}/${RECORD}`))

/** What a build said about the app's stylesheet: where it is served from, and which blocks went into it. */
export type Sheet = {
  readonly styles: P.Maybe<string>
  readonly styleIds: readonly string[]
}

const NO_SHEET: Sheet = { styles: P.nothing<string> (), styleIds: [] }

/**
 * What a build just produced, as the page that links it needs it.
 * @example
 * ```ts
 * sheetOf (await build ({ islands }))
 * // => { styles: just ('/_kit/styles-PgEm_J6x.css'), styleIds: [ … ] }
 * ```
 */
export const sheetOf = (built: Built): Sheet => ({
  styles: P.fromNullable (built.styles),
  styleIds: built.styleIds,
})

const linkIn = (record: P.Maybe<unknown>): P.Maybe<string> =>
  P.chain (P.fromPredicate (P.isString)) (fieldIn ('styles') (record))

const withIds = (ids: readonly string[]) => (styles: string): Sheet => ({
  styles: P.just (styles),
  styleIds: ids,
})

const sheetIn = (record: P.Maybe<unknown>): Sheet =>
  P.maybe_ (
    P.K (NO_SHEET),
  ) (
    withIds (listedBy (P.isString) (fieldIn ('styleIds') (record))),
  ) (linkIn (record))

/**
 * What the last build said about the stylesheet, for a server that is not building anything: the record it leaves behind is the only place that name survives.
 * @example
 * ```ts
 * // lastSheet :: String -> String? -> Task Sheet
 * await runTask (lastSheet (outDir)) // => as the build wrote it
 * await runTask (lastSheet (outDir, '/assets/')) // => under the serving base
 * ```
 */
export const lastSheet = (
  outDir: string,
  base?: string,
): F.Future<unknown, Sheet> =>
  P.map (P.pipe ([sheetIn, servedFrom (P.fromNullable (base))])) (recordAt (outDir))

const servedFrom = (base: P.Maybe<string>) => (one: Sheet): Sheet =>
  P.maybe_ (P.K (one)) ((at: string): Sheet => ({
    ...one,
    styles: P.map (under (at)) (one.styles),
  })) (base)

const PLAIN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/

const isPlain = (name: unknown): name is string =>
  typeof name === 'string' && P.test (PLAIN) (name)

const recorded: (record: P.Maybe<unknown>) => readonly string[] = P.pipe ([
  fieldIn ('files'),
  listedBy (isPlain),
])

const removing = (outDir: string) => (name: string): F.Future<unknown, void> =>
  P.voided (
    F.coalesce (P.left<unknown, void>) (P.right<unknown, void>) (
      F.attemptP (() => rm (`${outDir}/${name}`)),
    ),
  )

const sweeping =
  (outDir: string) => (record: P.Maybe<unknown>): F.Future<unknown, void> =>
    P.voided (
      F.parallel (Number.POSITIVE_INFINITY) (
        P.map (removing (outDir)) (
          recorded (record),
        ),
      ),
    )

const sweep = (outDir: string): F.Future<unknown, void> =>
  P.chain (sweeping (outDir)) (recordAt (outDir))

const filesAmong = (entries: readonly DirEntry[]): readonly string[] =>
  P.sort (P.filterMap (nameIfFile) (entries))

const listFiles = (dir: string): F.Future<unknown, readonly string[]> =>
  P.map (filesAmong) (F.attemptP (() => readDir (dir)))

const isFile = (entry: DirEntry): boolean => entry.isFile

const nameOf = (entry: DirEntry): string => entry.name

const nameIfFile = (entry: DirEntry): P.Maybe<string> =>
  P.map (nameOf) (P.fromPredicate (isFile) (entry))

const notForeign =
  (foreign: readonly string[]) => (all: readonly string[]): readonly string[] =>
    P.reject ((name: string) => foreign.includes (name)) (all)

const ours =
  (outDir: string) =>
  (foreign: readonly string[]): F.Future<unknown, readonly string[]> =>
    P.map (notForeign (foreign)) (listFiles (outDir))

const writingEntry =
  (dir: string) => (isle: Found): F.Future<unknown, string> => {
    const path = `${dir}/${asFileName (isle.name)}.ts`
    return P.voidRight (path) (
      F.attemptP (() => writeText (path, entrySource (isle))),
    )
  }

const writeEntries =
  (dir: string) =>
  (found: readonly Found[]): F.Future<unknown, readonly string[]> =>
    F.parallel (Number.POSITIVE_INFINITY) (
      P.map (writingEntry (dir)) (
        found,
      ),
    )

const KIT_ROOT = import.meta.dirname

const inKit = (file: string): boolean =>
  (file === KIT_ROOT || file.startsWith (`${KIT_ROOT}/`)) &&
  !file.includes ('/node_modules/')

const clientGraph = (): esbuild.Plugin => ({
  name: 'kit-client',
  setup(build) {
    build.onResolve (
      { filter: /^(?:\.|@algosail\/plykit(?:\/|$))/ },
      async (args) => {
        if (args.pluginData !== undefined) return
        const result = await build.resolve (args.path, {
          resolveDir: args.resolveDir,
          kind: args.kind,
          pluginData: { kit: true },
        })
        if (result.errors.length > 0 || result.path === '') return
        return inKit (result.path)
          ? { path: result.path, sideEffects: false }
          : { path: result.path }
      },
    )
  },
})

const stylePlugin = (known: ReadonlySet<string>): esbuild.Plugin => ({
  name: 'kit-styles',
  setup(build) {
    build.onLoad ({ filter: /\.ts$/ }, async (args) => {
      if (known.size === 0) return null
      const source = await readText (args.path)
      return P.maybe_<esbuild.OnLoadResult | null> (P.K (null)) (
        (contents: string) => ({ contents, loader: 'ts' }),
      ) (replaceBlocks (source, known))
    })
  },
})

let bundleQueue: Promise<void> = Promise.resolve ()

const once = async (
  entries: readonly string[],
  outDir: string,
  minify: boolean,
  known: ReadonlySet<string>,
): Promise<void> => {
  try {
    await esbuild.build ({
      entryPoints: [...entries],
      outdir: outDir,
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'neutral',
      target: 'es2022',
      minify,
      entryNames: '[name]',
      chunkNames: 'chunk-[hash]',
      external: ['node:*', 'esbuild'],
      plugins: [clientGraph (), aliasPlugin (), stylePlugin (known)],
      logLevel: 'silent',
    })
  } catch (caught) {
    const said = caught instanceof Error ? caught.message : String (caught)
    refuse (`build: esbuild failed\n${said}`)
  } finally {
    await esbuild.stop ()
  }
}

const bundle = (
  entries: readonly string[],
  outDir: string,
  minify: boolean,
  known: ReadonlySet<string>,
): F.Future<unknown, void> => {
  const run = bundleQueue.then (() => once (entries, outDir, minify, known))
  bundleQueue = run.then (() => undefined, () => undefined)
  return F.attemptP (() => run)
}

/**
 * Finds every island and builds it into `outDir`, reporting where each one ended up.
 * @example
 * ```ts
 * // build :: Options -> Promise Built
 * const built = await build ({
 *   outDir: `${import.meta.dirname}/.kit`,
 * })
 * built.manifest.counter
 * // => '/_kit/counter.js'
 * ```
 */

/** The stylesheet file this build wrote, where there was one to write. */
type Written = {
  readonly name: string
  readonly bytes: Bytes
}

const compressed = (text: string): F.Future<unknown, number> =>
  F.attemptP (async () =>
    (await new Response (
      new Blob ([text]).stream ().pipeThrough (new CompressionStream ('gzip')),
    ).arrayBuffer ()).byteLength,
  )

const isBlank = (text: string): boolean => text.trim () === ''

const sheetName = (text: string): F.Future<unknown, string> =>
  P.map ((sum: string) => `styles-${sum.slice (0, 8)}.css`) (digest (text))

const asWritten =
  (outDir: string) =>
  (text: string) =>
  (name: string): F.Future<unknown, Written> =>
    P.map ((gzip: number): Written => ({
      name,
      bytes: { raw: new TextEncoder ().encode (text).length, gzip },
    })) (
      P.apSecond (
        F.attemptP (() => writeText (`${outDir}/${name}`, text)),
      ) (compressed (text)),
    )

const writingSheet =
  (outDir: string) => (text: string): F.Future<unknown, P.Maybe<Written>> =>
    P.map (P.just<Written>) (P.chain (asWritten (outDir) (text)) (sheetName (text)))

const writeStyles = (outDir: string): F.Future<unknown, P.Maybe<Written>> =>
  P.maybe_ (
    () => writingSheet (outDir) (styleSheet ()),
  ) (
    P.K (F.resolve (P.nothing<Written> ())),
  ) (P.fromPredicate (isBlank) (styleSheet ()))

/**
 * The directory chunks go in: `outDir`, or `.kit` at the application root.
 * `.kit` belongs to kit. It is not written inside `assets`. The browser still asks for `/_kit/`.
 * @example
 * ```ts
 * // chunkDir :: Where -> Task String
 * await chunkDir ({}) // => '/app/example/.kit'
 * ```
 */
export async function chunkDir(
  where: {
    readonly outDir?: URL | string
  },
  create = true,
): Promise<string> {
  const target = P.fromMaybe<URL | string> (KIT_DIR) (
    P.fromNullable<URL | string> (where.outDir),
  )
  await F.promise (
    P.boolean<F.Future<unknown, void>> (F.resolve (undefined)) (
      F.attemptP (() => mkdir (target, { recursive: true })),
    ) (create),
  )
  return await realpath (target)
}

/** A build in progress: what it found, where it puts it, and what was in that directory before it started. */
type Building<S> = {
  readonly options: Options<S>
  readonly found: readonly Found[]
  readonly outDir: string
  /** What survived the sweep. */
  readonly foreign: readonly string[]
}

/** The same, before the directory has been looked at. */
type Starting<S> = Omit<Building<S>, 'foreign'>

/** A bundle being made: where its entries are written, and what they are. */
type Bundling<S> = {
  readonly build: Building<S>
  readonly scratch: string
  readonly entries: readonly string[]
}

const minifyIn = <S>(at: Bundling<S>): boolean =>
  P.defaultTo (true) (at.build.options.minify)

const scratchDir = (): F.Future<unknown, string> =>
  F.attemptP (() => mkdtemp ('kit-islands-'))

const clearing = (scratch: string): F.Future<unknown, void> =>
  F.attemptP (() => rm (scratch, { recursive: true }))

const entriesIn =
  <S>(one: Building<S>) => (scratch: string): F.Future<unknown, Bundling<S>> =>
    P.map ((entries: readonly string[]): Bundling<S> => ({
      build: one,
      scratch,
      entries,
    })) (writeEntries (scratch) (one.found))

const leavesStyles = <S>(at: Bundling<S>): boolean =>
  at.build.options.extract === false

const knownStyles = <S>(at: Bundling<S>): ReadonlySet<string> =>
  P.boolean<ReadonlySet<string>> (new Set (styleIds ())) (new Set<string> ()) (
    leavesStyles (at),
  )

const bundlingAll = <S>(at: Bundling<S>): F.Future<unknown, void> =>
  bundle (at.entries, at.build.outDir, minifyIn (at), knownStyles (at))

const hasEntries = <S>(at: Bundling<S>): boolean => !P.isEmpty (at.entries)

const nothingToBundle = <S>(_: Bundling<S>): F.Future<unknown, void> =>
  F.resolve (undefined)

const bundlingIn = <S>(at: Bundling<S>): F.Future<unknown, void> =>
  P.ifElse<Bundling<S>> (hasEntries) (bundlingAll) (
    nothingToBundle,
  ) (at)

const writtenThenBundled =
  <S>(one: Building<S>) => (scratch: string): F.Future<unknown, void> =>
    P.chain (bundlingIn<S>) (entriesIn (one) (scratch))

const bundling = <S>(one: Building<S>): F.Future<unknown, void> =>
  P.chain ((dir: string) =>
    F.lastly (clearing (dir)) (writtenThenBundled (one) (dir)),
  ) (scratchDir ())

const preparing = <S>(one: Building<S>): F.Future<unknown, P.Maybe<Prepared>> =>
  P.maybe_ (
    P.K (F.resolve (P.nothing<Prepared> ())),
  ) (
    (routes: Routes<S>) =>
      P.map (P.just<Prepared>) (
        F.attemptP (() => prepare<S> (routes, { state: one.options.state })),
      ),
  ) (P.fromNullable (one.options.routes))

const styleLink = <S>(one: Building<S>) => (sheet: Written): string =>
  `${baseIn (one.options)}${sheet.name}`

const bytesOf = (sheet: Written): Bytes => sheet.bytes

const NOTHING_YET: Bytes = { raw: 0, gzip: 0 }

const plus = (a: Bytes, b: Bytes): Bytes => ({
  raw: a.raw + b.raw,
  gzip: a.gzip + b.gzip,
})

const isScript = (name: string): boolean => name.endsWith ('.js')

const BESIDE = /["'](\.\/[A-Za-z0-9_.-]+\.js)["']/g

const linkedIn = (one: P.Matched): P.Maybe<string> => one.groups[0]

const beside = (text: string): readonly string[] =>
  P.nub (P.map (fileIn) (P.justs (P.map (linkedIn) (P.matchAll (BESIDE) (text)))))

/** One file the build wrote: what it weighs, and what it pulls in beside it. */
type Chunk = { readonly bytes: Bytes; readonly links: readonly string[] }

const asChunk = (text: string) => (gzip: number): Chunk => ({
  bytes: { raw: new TextEncoder ().encode (text).length, gzip },
  links: beside (text),
})

const weighing =
  (outDir: string) =>
  (name: string): F.Future<unknown, P.Pair<string, Chunk>> =>
    P.chain ((text: string) =>
      P.map ((one: Chunk) => P.pair (name, one)) (
        P.map (asChunk (text)) (compressed (text)),
      ),
    ) (F.attemptP (() => readText (`${outDir}/${name}`)))

const weighed =
  (outDir: string) =>
  (names: readonly string[]): F.Future<unknown, Readonly<P.StrMap<Chunk>>> =>
    P.map ((ps: readonly P.Pair<string, Chunk>[]) => P.fromPairs (ps)) (
      F.parallel (Number.POSITIVE_INFINITY) (
        P.map (weighing (outDir)) (P.filter (isScript) (names)),
      ),
    )

const chunkAt =
  (chunks: Readonly<P.StrMap<Chunk>>) => (name: string): P.Maybe<Chunk> =>
    P.lookup (name) (chunks)

const linksOf =
  (chunks: Readonly<P.StrMap<Chunk>>) => (name: string): readonly string[] =>
    P.fromMaybe<readonly string[]> ([]) (
      P.map ((one: Chunk) => one.links) (chunkAt (chunks) (name)),
    )

const walking =
  (chunks: Readonly<P.StrMap<Chunk>>) =>
  (seen: readonly string[]) =>
  (name: string): readonly string[] =>
    P.ifElse ((one: string) => P.elem (one) (seen)) (
      P.K (seen),
    ) (
      (one: string) =>
        P.reduce ((acc: readonly string[], next: string) =>
          walking (chunks) (acc) (next),
        ) (P.append (one) (seen)) (linksOf (chunks) (one)),
    ) (name)

const summing =
  (chunks: Readonly<P.StrMap<Chunk>>) => (names: readonly string[]): Bytes =>
    P.reduce ((acc: Bytes, name: string) =>
      plus (
        acc,
        P.fromMaybe (NOTHING_YET) (
          P.map ((one: Chunk) => one.bytes) (chunkAt (chunks) (name)),
        ),
      ),
    ) (NOTHING_YET) (names)

const weightOf = (chunks: Readonly<P.StrMap<Chunk>>) => (file: string): Bytes =>
  summing (chunks) (walking (chunks) ([]) (file))

const weightsIn =
  (chunks: Readonly<P.StrMap<Chunk>>) =>
  (entries: Readonly<P.StrMap<string>>): Readonly<P.StrMap<Bytes>> =>
    P.map (weightOf (chunks)) (entries)

/** What the build works out after bundling. */
type Made = {
  readonly env: Inlined
  readonly entries: Readonly<P.StrMap<string>>
  readonly sheet: P.Maybe<Written>
  readonly data: P.Maybe<Prepared>
  readonly files: readonly string[]
  readonly islandBytes: Readonly<P.StrMap<Bytes>>
}

type WithEnv = Pick<Made, 'env'>
type WithEntries = WithEnv & Pick<Made, 'entries'>
type WithSheet = WithEntries & Pick<Made, 'sheet'>
type WithData = WithSheet & Pick<Made, 'data'>
type WithFiles = WithData & Pick<Made, 'files'>

const inlining = <S>(one: Building<S>): F.Future<unknown, Inlined> =>
  P.chain (inlinePublic (one.outDir)) (ours (one.outDir) (one.foreign))

const asEnv = (env: Inlined): WithEnv => ({ env })

const withEntries =
  <S>(one: Building<S>) => (made: WithEnv): F.Future<unknown, WithEntries> =>
    P.map ((entries: Readonly<P.StrMap<string>>): WithEntries => ({
      ...made,
      entries,
    })) (hashedEntries (one))

const withSheet =
  <S>(one: Building<S>) => (made: WithEntries): F.Future<unknown, WithSheet> =>
    P.map ((sheet: P.Maybe<Written>): WithSheet => ({ ...made, sheet })) (
      writeStyles (one.outDir),
    )

const withData =
  <S>(one: Building<S>) => (made: WithSheet): F.Future<unknown, WithData> =>
    P.map ((data: P.Maybe<Prepared>): WithData => ({ ...made, data })) (
      preparing (one),
    )

const withFiles =
  <S>(one: Building<S>) => (made: WithData): F.Future<unknown, WithFiles> =>
    P.map ((files: readonly string[]): WithFiles => ({ ...made, files })) (
      ours (one.outDir) (one.foreign),
    )

const withBytes =
  <S>(one: Building<S>) => (made: WithFiles): F.Future<unknown, Made> =>
    P.map ((chunks: Readonly<P.StrMap<Chunk>>): Made => ({
      ...made,
      islandBytes: weightsIn (chunks) (made.entries),
    })) (weighed (one.outDir) (made.files))

const madeIn = <S>(one: Building<S>): F.Future<unknown, Made> =>
  P.chain (
    P.pipe ([
      withEntries (one),
      P.chain (withSheet (one)),
      P.chain (withData (one)),
      P.chain (withFiles (one)),
      P.chain (withBytes (one)),
    ]),
  ) (P.map (asEnv) (inlining (one)))

const asBuilt = <S>(one: Building<S>) => (made: Made): Built => ({
  tag: 'built',
  manifest: asManifest (baseIn (one.options)) (made.entries),
  styles: P.fromMaybe<string | null> (null) (
    P.map (styleLink (one)) (made.sheet),
  ),
  styleIds: P.maybe_ (
    P.K<readonly string[]> ([]),
  ) (
    () => styleIds (),
  ) (made.sheet),
  styleBytes: P.fromMaybe (NOTHING_YET) (P.map (bytesOf) (made.sheet)),
  islandBytes: made.islandBytes,
  files: made.files,
  env: made.env,
  data: made.data,
})

const writingData =
  (outDir: string) => (one: Prepared): F.Future<unknown, void> =>
    F.attemptP (() =>
      writeText (`${outDir}/${DATA}`, JSON.stringify (one.data)),
    )

const clearingData = (outDir: string): F.Future<unknown, void> =>
  P.voided (
    F.coalesce (P.left<unknown, void>) (P.right<unknown, void>) (
      F.attemptP (() => rm (`${outDir}/${DATA}`)),
    ),
  )

const recordingData =
  (outDir: string) => (data: P.Maybe<Prepared>): F.Future<unknown, void> =>
    P.maybe_ (() => clearingData (outDir)) (writingData (outDir)) (data)

const recording = (outDir: string) => (built: Built): F.Future<unknown, void> =>
  F.attemptP (() =>
    writeText (`${outDir}/${RECORD}`, JSON.stringify (built)),
  )

const written =
  <S>(one: Building<S>) => (built: Built): F.Future<unknown, Built> =>
    P.voidRight (built) (
      F.parallel (Number.POSITIVE_INFINITY) ([
        P.voided (recording (one.outDir) (built)),
        P.voided (recordingData (one.outDir) (built.data)),
      ]),
    )

const chunkDirIn = <S>(options: Options<S>): F.Future<unknown, string> =>
  F.attemptP (() => chunkDir (options))

const started = <S>(options: Options<S>): F.Future<unknown, Starting<S>> =>
  P.ap (
    P.map ((found: readonly Found[]) => (outDir: string): Starting<S> => ({
      options,
      found,
      outDir,
    })) (naming (options)),
  ) (chunkDirIn (options))

const asSwept =
  <S>(one: Starting<S>) => (foreign: readonly string[]): Building<S> => ({
    ...one,
    foreign,
  })

const thenListing =
  (outDir: string) => (_: void): F.Future<unknown, readonly string[]> =>
    listFiles (outDir)

const swept = <S>(one: Starting<S>): F.Future<unknown, Building<S>> =>
  P.map (asSwept (one)) (P.chain (thenListing (one.outDir)) (sweep (one.outDir)))

const bundled = <S>(one: Building<S>): F.Future<unknown, Building<S>> =>
  P.voidRight (one) (bundling (one))

const finished = <S>(one: Building<S>): F.Future<unknown, Built> =>
  P.chain (written (one)) (P.map (asBuilt (one)) (madeIn (one)))

/**
 * Finds every island and builds it into `outDir`, reporting where each one ended up.
 * @example
 * ```ts
 * // build :: Options -> Promise Built
 * const built = await build ({
 *   outDir: `${import.meta.dirname}/.kit`,
 * })
 * built.manifest.counter
 * // => '/_kit/counter.js'
 * ```
 */
export function build<S = unknown>(options: Options<S>): Promise<Built> {
  return F.promise (
    P.chain (finished<S>) (
      P.chain (bundled<S>) (P.chain (swept<S>) (started<S> (options))),
    ),
  )
}

/**
 * What a build produced, in a line or three — for the command that ran it to print.
 * @example
 * ```ts
 * console.log (report (await build ({ islands })))
 * // islands: counter, todos
 * // styles: /_kit/styles-PgEm_J6x.css — 1666 B, 520 gzip, 3 blocks
 * // scripts: heaviest todos — 41231 B, 12004 gzip with what it pulls in
 * // files: 7
 * ```
 */
export function report(built: Built): string {
  return P.joinWith ('\n') (P.join ([
    [islandsLine (built)],
    [stylesLine (built)],
    scriptsLine (built),
    [`files: ${built.files.length}`],
    envLine (built),
    dataLine (built),
    leftLine (built),
    splitLine (built),
  ]))
}

const islandsLine = (built: Built): string =>
  `islands: ${P.joinWith (', ') (P.sortedKeys (built.manifest)) || '— none'}`

const asSheetLine = (built: Built) => (where: string): string =>
  `styles: ${where} — ${built.styleBytes.raw} B, ` +
  `${built.styleBytes.gzip} gzip, ${built.styleIds.length} blocks`

const stylesLine = (built: Built): string =>
  P.maybe_ (P.K ('styles: — none')) (asSheetLine (built)) (
    P.fromNullable (built.styles),
  )

const weightAt = (built: Built) => (name: string): Bytes =>
  P.fromMaybe (NOTHING_YET) (P.lookup (name) (built.islandBytes))

const heavier =
  (built: Built) => (found: P.Maybe<string>, name: string): P.Maybe<string> =>
    P.boolean (found) (P.just (name)) (
      weightAt (built) (name).gzip >
        P.fromMaybe (0) (
          P.map ((one: string) => weightAt (built) (one).gzip) (found),
        ),
    )

const heaviest = (built: Built): P.Maybe<string> =>
  P.reduce (heavier (built)) (P.nothing<string> ()) (
    P.sortedKeys (built.islandBytes),
  )

const asScriptsLine = (built: Built) => (name: string): readonly string[] => [
  `scripts: heaviest ${name} — ${weightAt (built) (name).raw} B, ` +
  `${weightAt (built) (name).gzip} gzip with what it pulls in`,
]

const scriptsLine = (built: Built): readonly string[] =>
  P.maybe_ (P.K<readonly string[]> ([])) (asScriptsLine (built)) (heaviest (built))

const asPutName = (built: Built) => (name: string): string =>
  P.boolean (name) (`${name} — unset`) (built.env.put[name] === null)

const envLine = (built: Built): readonly string[] =>
  P.boolean<readonly string[]> ([
    `environment: ${
      P.joinWith (', ') (P.map (asPutName (built)) (P.sortedKeys (built.env.put)))
    }`,
  ]) ([]) (P.isEmpty (built.env.put))

const stillLive = (ready: Prepared): string =>
  P.boolean (`, still live: ${P.joinWith (', ') (ready.refused)}`) ('') (
    P.isEmpty (ready.refused),
  )

const asDataLine = (ready: Prepared): readonly string[] => [
  `data: ${P.sortedKeys (ready.data).length} addresses ` +
  `from ${ready.routes.length} routes${stillLive (ready)}`,
]

const dataLine = (built: Built): readonly string[] =>
  P.maybe_ (P.K<readonly string[]> ([])) (asDataLine) (built.data)

const leftLine = (built: Built): readonly string[] =>
  P.boolean<readonly string[]> ([
    `island reads ${P.joinWith (', ') (built.env.left)} — in the browser ` +
    '`process.env` is not the server environment; a public name starts with ' +
    `\`${PUBLIC_PREFIX}\` and is filled in at build time, the rest stays ` +
    'on the server',
  ]) ([]) (P.isEmpty (built.env.left))

const splitLine = (built: Built): readonly string[] =>
  P.boolean<readonly string[]> ([]) ([
    `sheet passed ${SPLIT_AT / 1000} KB gzip — time to split it by ` +
    'route: the page pulls in noticeably more than it shows',
  ]) (built.styleBytes.gzip > SPLIT_AT)

const SPLIT_AT = 30_000
