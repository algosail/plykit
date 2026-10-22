import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Manifest } from './build.ts'
import type { Prebuilt } from './data.ts'
import type { DirEntry } from './disk.ts'
import type { StaticOptions } from './static.ts'
import { RECORD } from './build.ts'
import { copyFile, mkdir, readDir, readText, writeText } from './disk.ts'
import { readPrebuilt } from './read.ts'
import { directory, forever } from './static.ts'

const CHUNK_BASE = '/_kit/'

const FILE_BASE = '/static/'

const refuse = (said: string): never => {
  throw new Error (said)
}

/** Where `publish` reads, and where it writes. */
export type PublishOptions = {
  /** Where `build` wrote the chunks and `kit-build.json`. */
  readonly outDir: URL | string
  /** The directory the assets and `record.json` are written under. */
  readonly to: URL | string
  /** The app's own files — pictures, fonts — copied under their prefix. */
  readonly assets?: StaticOptions
  /** The URL prefix the chunks are served under. */
  readonly base?: string
}

/** What a Worker imports, and the directory `wrangler` serves as assets. */
export type Published = {
  readonly assets: string
  readonly record: string
  readonly files: readonly string[]
}

/** What `wranglerConfig` needs, where the defaults are not the app's. */
export type WranglerOptions = {
  readonly name: string
  /** The Worker entry Wrangler compiles. */
  readonly main?: string
  /** The asset directory `publish` wrote. */
  readonly assets?: string
  /** Bind `KitLive`. */
  readonly live?: boolean
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
    `publish: ${outDir}/${RECORD} is not a build record — run build first`,
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

const withSlash = (base: string): string =>
  P.endsWith ('/') (base) ? base : `${base}/`

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
    F.attemptP (() => copyFile (`${from}/${name}`, new URL (name, to)))

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

const kept =
  (keep: (name: string) => boolean, pre: string) =>
  (entry: DirEntry): boolean => entry.isFile && keep (pre + entry.name)

const isDeeper = (entry: DirEntry): boolean => entry.isDirectory

async function copyTree(
  from: URL,
  to: URL,
  keep: (name: string) => boolean,
  pre = '',
): Promise<readonly string[]> {
  const all = await readDir (from)
  const entries = P.filter (kept (keep, pre)) (all)
  await mkdir (to, { recursive: true })
  await F.promise (
    F.parallel (Number.POSITIVE_INFINITY) (
      P.map ((entry: DirEntry) =>
        F.attemptP (() =>
          copyFile (new URL (entry.name, from), new URL (entry.name, to)),
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
        `${pre}${entry.name}/`,
      ),
    ) (P.filter (isDeeper) (all)),
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
): WorkerRecordJson => ({
  manifest: inventory.manifest,
  styles: inventory.styles,
  styleIds: inventory.styleIds,
  data: P.maybe_<Prebuilt | null> (P.K (null)) (P.I<Prebuilt>) (data),
})

type WorkerRecordJson = {
  readonly manifest: Manifest
  readonly styles: string | null
  readonly styleIds: readonly string[]
  readonly data: Prebuilt | null
}

/**
 * Copies a build into the directory a Worker deploys.
 * @example
 * ```ts
 * // publish :: PublishOptions -> Promise Published
 * const laid = await publish ({
 *   outDir: './dist/chunks',
 *   to: './dist',
 *   assets: { dir: './static' },
 * })
 * laid.record
 * // => '.../dist/record.json'
 * ```
 */
export async function publish(options: PublishOptions): Promise<Published> {
  const outDir = String (options.outDir)
  const to = String (options.to)
  const base = withSlash (P.defaultTo (CHUNK_BASE) (options.base))
  const inventory = await F.promise (reading (outDir))
  const assets = directory (`${to}/assets/`)
  const chunks = new URL (relative (base), assets)
  await copyFiles (outDir, chunks, inventory.files)
  const own = options.assets
  const copied = own === undefined ? [] : await copyTree (
    directory (own.dir),
    new URL (relative (withSlash (P.defaultTo (FILE_BASE) (own.base))), assets),
    P.defaultTo<(name: string) => boolean> (P.K (true)) (own.serves),
  )
  await writeText (new URL ('_headers', assets), headersFor (base))
  const record = `${to}/record.json`
  const data = await readPrebuilt (outDir)
  await writeText (record, JSON.stringify (recordOf (inventory, data)))
  return {
    assets: `${to}/assets`,
    record,
    files: P.concat (inventory.files) (copied),
  }
}

const liveIn = (on: boolean): string =>
  on
    ? `,
  "durable_objects": {
    "bindings": [{ "name": "KIT_LIVE", "class_name": "KitLive" }]
  },
  "exports": {
    "KitLive": { "type": "durable-object", "storage": "sqlite" }
  }`
    : ''

/**
 * A `wrangler.jsonc` for an app `publish` laid out.
 * @example
 * ```ts
 * // wranglerConfig :: WranglerOptions -> String
 * wranglerConfig ({ name: 'reading-room' })
 * ```
 */
export function wranglerConfig(options: WranglerOptions): string {
  const main = options.main ?? './worker.ts'
  const assets = options.assets ?? './dist/assets'
  const live = options.live !== false
  return `{
  "name": ${JSON.stringify (options.name)},
  "main": ${JSON.stringify (main)},
  "compatibility_date": "2026-10-15",
  "assets": {
    "directory": ${JSON.stringify (assets)},
    "binding": "ASSETS"
  }${liveIn (live)}
}
`
}
