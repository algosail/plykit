import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Prebuilt } from '../app/data.ts'
import type { Manifest } from '../build/build.ts'
import type { DirEntry } from '../fs/disk.ts'
import type { StaticOptions } from '../fs/static.ts'
import type { WorkerRecord } from './runtime.ts'
import { CHUNK_BASE, FILE_BASE, withSlash } from '../app/prefixes.ts'
import { RECORD } from '../build/build.ts'
import { readPrebuilt } from '../build/read.ts'
import { copyFresh, mkdir, readDir, readText, rm, within, writeFresh } from '../fs/disk.ts'
import { directory, forever } from '../fs/static.ts'

const refuse = (said: string): never => {
  throw new Error (said)
}

/** Where `stage` reads the island build, and where it writes the worker directory. */
export type StageOptions = {
  /** Where `build` wrote the chunks and `kit-build.json`. */
  readonly outDir: URL | string
  /** The directory the assets and `record.json` are written under. */
  readonly to: URL | string
  /** The app's own files — pictures, fonts — copied under their prefix. */
  readonly assets?: StaticOptions
  /** The URL prefix the chunks are served under. */
  readonly base?: string
}

/** The worker directory `stage` wrote: assets, `record.json`, and the copied names. */
export type Staged = {
  readonly assets: string
  readonly record: string
  readonly files: readonly string[]
}

type Inventory = {
  readonly manifest: Manifest
  readonly styles: string | null
  readonly styleIds: readonly string[]
  readonly files: readonly string[]
}

const stringsIn = (value: readonly unknown[]): readonly string[] =>
  P.filter (P.isString) (value) as readonly string[]

const notARecord = (outDir: string): never =>
  refuse (
    `stage: ${outDir}/${RECORD} is not a build record — run build first`,
  )

const demanded = (outDir: string) => (value: unknown): Inventory => {
  const record = P.isStrMap (value) ? value : notARecord (outDir)
  const manifest = P.isStrMap (record.manifest)
    ? record.manifest
    : notARecord (outDir)
  const styles = record.styles === null || P.isString (record.styles)
    ? record.styles
    : notARecord (outDir)
  const styleIds = P.isArray (record.styleIds)
    ? record.styleIds
    : notARecord (outDir)
  const files = P.isArray (record.files) ? record.files : notARecord (outDir)
  return {
    manifest: P.filter (P.isString) (manifest) as Manifest,
    styles,
    styleIds: stringsIn (styleIds),
    files: stringsIn (files),
  }
}

const relative = (base: string): string => base.replace (/^\/+/, '')

const reading = (outDir: string): F.Future<unknown, Inventory> =>
  P.map (demanded (outDir)) (
    F.attemptP (() =>
      readText (`${outDir}/${RECORD}`).then ((text) =>
        JSON.parse (text) as unknown,
      ),
    ),
  )

const copying =
  (from: string) => (to: URL) => (name: string): F.Future<unknown, void> =>
    F.attemptP (() => copyFresh (`${from}/${name}`, new URL (name, to)))

const copyFiles = async (
  from: string,
  to: URL,
  names: readonly string[],
): Promise<void> => {
  await mkdir (to, { recursive: true })
  await F.promise (
    F.parallel (Number.POSITIVE_INFINITY) (P.map (copying (from) (to)) (names)),
  )
}

const keptOut = (skip: string | undefined) => (name: string): boolean =>
  skip === undefined || (name !== skip && !name.startsWith (`${skip}/`))

const kept =
  (keep: (name: string) => boolean, skip: string | undefined, pre: string) =>
  (entry: DirEntry): boolean =>
    entry.isFile && keep (pre + entry.name) && keptOut (skip) (pre + entry.name)

const goesDeeper =
  (skip: string | undefined, pre: string) => (entry: DirEntry): boolean =>
    entry.isDirectory && keptOut (skip) (pre + entry.name)

async function copyTree(
  from: URL,
  to: URL,
  keep: (name: string) => boolean,
  skip?: string,
  pre = '',
): Promise<readonly string[]> {
  const all = await readDir (from)
  const entries = P.filter (kept (keep, skip, pre)) (all)
  await mkdir (to, { recursive: true })
  await F.promise (
    F.parallel (Number.POSITIVE_INFINITY) (
      P.map ((entry: DirEntry) =>
        F.attemptP (() =>
          copyFresh (new URL (entry.name, from), new URL (entry.name, to)),
        ),
      ) (entries),
    ),
  )
  const deeper = await Promise.all (
    P.map ((entry: DirEntry) =>
      copyTree (
        new URL (`${entry.name}/`, from),
        new URL (`${entry.name}/`, to),
        keep,
        skip,
        `${pre}${entry.name}/`,
      ),
    ) (P.filter (goesDeeper (skip, pre)) (all)),
  )
  return P.concat (P.map ((entry: DirEntry) => pre + entry.name) (entries)) (
    deeper.flat (),
  )
}

const headersFor = (base: string): string =>
  `${base}*\n  Cache-Control: ${forever ()}\n`

const recordOf = (
  inventory: Inventory,
  data: P.Maybe<Prebuilt>,
  files: string | null,
): WorkerRecord => ({
  manifest: inventory.manifest,
  styles: inventory.styles,
  styleIds: inventory.styleIds,
  files,
  data: P.maybe_<Prebuilt | null> (P.K (null)) (P.I<Prebuilt>) (data),
})

const joinRel = (prefix: string, name: string): string => {
  const dir = prefix.replace (/\/$/, '')
  return dir === '' ? name : `${dir}/${name}`
}

const listRel = async (dir: URL, pre = ''): Promise<readonly string[]> => {
  let entries: readonly DirEntry[]
  try {
    entries = await readDir (dir)
  } catch {
    return []
  }
  const files = P.map ((entry: DirEntry) => pre + entry.name) (
    P.filter ((entry: DirEntry) => entry.isFile) (entries),
  )
  const nested = await Promise.all (
    P.map ((entry: DirEntry) =>
      listRel (new URL (`${entry.name}/`, dir), `${pre}${entry.name}/`),
    ) (P.filter ((entry: DirEntry) => entry.isDirectory) (entries)),
  )
  return P.concat (files) (nested.flat ())
}

const prune = async (dir: URL, top: boolean): Promise<void> => {
  let entries: readonly DirEntry[]
  try {
    entries = await readDir (dir)
  } catch {
    return
  }
  await Promise.all (
    P.map ((entry: DirEntry) => prune (new URL (`${entry.name}/`, dir), false)) (
      P.filter ((entry: DirEntry) => entry.isDirectory) (entries),
    ),
  )
  if (top) return
  try {
    if ((await readDir (dir)).length === 0) await rm (dir, { recursive: true })
  } catch {
    // Already gone.
  }
}

/** Drops asset files this stage did not write, then empty directories. */
const sweep = async (dir: URL, keep: ReadonlySet<string>): Promise<void> => {
  const present = await listRel (dir)
  await Promise.all (
    P.map ((name: string) => rm (new URL (name, dir))) (
      P.filter ((name: string) => !keep.has (name)) (present),
    ),
  )
  await prune (dir, true)
}

/**
 * Copies a finished island build into the worker directory: assets, `_headers`, and `record.json`.
 * @example
 * ```ts
 * // stage :: StageOptions -> Promise Staged
 * const laid = await stage ({
 *   outDir: './.kit',
 *   to: './dist',
 *   assets: { dir: './static' },
 * })
 * laid.record
 * // => '.../dist/record.json'
 * ```
 */
export async function stage(options: StageOptions): Promise<Staged> {
  const outDir = String (options.outDir)
  const to = String (options.to)
  const base = withSlash (P.defaultTo (CHUNK_BASE) (options.base))
  const inventory = await F.promise (reading (outDir))
  const assets = directory (`${to}/assets/`)
  await mkdir (assets, { recursive: true })
  const chunkPrefix = relative (base)
  const chunks = new URL (chunkPrefix, assets)
  await copyFiles (outDir, chunks, inventory.files)
  const own = options.assets
  const filePrefix = own === undefined
    ? ''
    : relative (withSlash (P.defaultTo (FILE_BASE) (own.base)))
  const copied = own === undefined ? [] : await copyTree (
    directory (own.dir),
    new URL (filePrefix, assets),
    P.defaultTo<(name: string) => boolean> (P.K (true)) (own.serves),
    within (directory (own.dir), outDir),
  )
  await writeFresh (new URL ('_headers', assets), headersFor (base))
  const record = `${to}/record.json`
  const data = await readPrebuilt (outDir)
  const files = own === undefined
    ? null
    : withSlash (P.defaultTo (FILE_BASE) (own.base))
  await writeFresh (record, JSON.stringify (recordOf (inventory, data, files)))
  await sweep (assets, new Set ([
    '_headers',
    ...P.map ((name: string) => joinRel (chunkPrefix, name)) (inventory.files),
    ...P.map ((name: string) => joinRel (filePrefix, name)) (copied),
  ]))
  return {
    assets: `${to}/assets`,
    record,
    files: P.concat (inventory.files) (copied),
  }
}
