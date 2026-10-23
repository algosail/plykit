import { rmSync as rmSyncFs } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

/** One name in a directory. */
export type DirEntry = {
  readonly name: string
  readonly isFile: boolean
  readonly isDirectory: boolean
}

/** Size and mtime, which is all a tag and a stream threshold need. */
export type FileInfo = {
  readonly size: number
  readonly mtime: Date | null
  readonly isFile: boolean
}

const asPath = (target: string | URL): string =>
  target instanceof URL ? fileURLToPath (target) : target

const recursiveOf = (
  options?: { readonly recursive?: boolean },
): { readonly recursive: boolean } | undefined => {
  const recursive = options?.recursive
  return recursive === undefined ? undefined : { recursive }
}

/**
 * The whole file as text.
 * @example
 * ```ts
 * const text = await readText ('notes.txt')
 * ```
 */
export const readText = (target: string | URL): Promise<string> =>
  fs.readFile (asPath (target), 'utf8')

/**
 * Writes text, replacing whatever was there.
 * @example
 * ```ts
 * await writeText ('notes.txt', 'hello')
 * ```
 */
export const writeText = (
  target: string | URL,
  text: string,
): Promise<void> => fs.writeFile (asPath (target), text)

/**
 * Writes text when the file is missing or holds something else.
 * The same text leaves the file, and its mtime, alone.
 * @example
 * ```ts
 * await writeFresh ('dist/record.json', '{"files":null}')
 * ```
 */
export const writeFresh = async (
  target: string | URL,
  text: string,
): Promise<boolean> => {
  const where = asPath (target)
  try {
    if (await fs.readFile (where, 'utf8') === text) return false
  } catch {
    // The file is not there yet.
  }
  await fs.mkdir (path.dirname (where), { recursive: true })
  await fs.writeFile (where, text)
  return true
}

/**
 * The whole file as bytes.
 * @example
 * ```ts
 * const bytes = await readBytes ('logo.png')
 * ```
 */
export const readBytes = async (
  target: string | URL,
): Promise<Uint8Array<ArrayBuffer>> => {
  const buf = await fs.readFile (asPath (target))
  const copy = new Uint8Array (buf.byteLength)
  copy.set (buf)
  return copy
}

/**
 * Writes bytes, replacing whatever was there.
 * @example
 * ```ts
 * await writeBytes ('logo.png', bytes)
 * ```
 */
export const writeBytes = (
  target: string | URL,
  bytes: Uint8Array,
): Promise<void> => fs.writeFile (asPath (target), bytes)

/**
 * Creates a directory.
 * @example
 * ```ts
 * await mkdir ('dist/assets', { recursive: true })
 * ```
 */
export const mkdir = (
  target: string | URL,
  options?: { readonly recursive?: boolean },
): Promise<void> => {
  const flags = recursiveOf (options)
  const made = flags === undefined
    ? fs.mkdir (asPath (target))
    : fs.mkdir (asPath (target), flags)
  return made.then (() => undefined)
}

/**
 * Removes a file or a directory.
 * @example
 * ```ts
 * await rm ('dist', { recursive: true })
 * ```
 */
export const rm = (
  target: string | URL,
  options?: { readonly recursive?: boolean },
): Promise<void> => {
  const flags = recursiveOf (options)
  return flags === undefined
    ? fs.rm (asPath (target))
    : fs.rm (asPath (target), flags)
}

/**
 * Removes a file or a directory without waiting.
 * @example
 * ```ts
 * rmSync ('dist', { recursive: true })
 * ```
 */
export const rmSync = (
  target: string | URL,
  options?: { readonly recursive?: boolean },
): void => {
  const flags = recursiveOf (options)
  if (flags === undefined) rmSyncFs (asPath (target))
  else rmSyncFs (asPath (target), flags)
}

/**
 * Renames, which is how a hashed chunk takes the place of the plain one.
 * @example
 * ```ts
 * await rename ('counter.js', 'counter-abc.js')
 * ```
 */
export const rename = (
  from: string | URL,
  to: string | URL,
): Promise<void> => fs.rename (asPath (from), asPath (to))

/**
 * Copies one file.
 * @example
 * ```ts
 * await copyFile ('static/lamp.svg', 'dist/lamp.svg')
 * ```
 */
export const copyFile = (
  from: string | URL,
  to: string | URL,
): Promise<void> => fs.copyFile (asPath (from), asPath (to))

/**
 * Copies a file when the destination is missing or holds different bytes.
 * The same bytes leave the destination, and its mtime, alone.
 * @example
 * ```ts
 * await copyFresh ('static/lamp.svg', 'dist/assets/static/lamp.svg')
 * ```
 */
export const copyFresh = async (
  from: string | URL,
  to: string | URL,
): Promise<void> => {
  const source = asPath (from)
  const target = asPath (to)
  try {
    const [left, right] = await Promise.all ([
      fs.readFile (source),
      fs.readFile (target),
    ])
    if (left.equals (right)) return
  } catch {
    // The destination is not there yet, or could not be read.
  }
  await fs.mkdir (path.dirname (target), { recursive: true })
  await fs.copyFile (source, target)
}

/**
 * The names in a directory.
 * @example
 * ```ts
 * const names = await readDir ('static')
 * ```
 */
export const readDir = async (
  target: string | URL,
): Promise<readonly DirEntry[]> => {
  const entries = await fs.readdir (asPath (target), { withFileTypes: true })
  return entries.map ((entry) => ({
    name: entry.name,
    isFile: entry.isFile (),
    isDirectory: entry.isDirectory (),
  }))
}

/**
 * Size, mtime, and whether the path is a file.
 * @example
 * ```ts
 * const info = await stat ('static/lamp.svg')
 * ```
 */
export const stat = async (target: string | URL): Promise<FileInfo> => {
  const info = await fs.stat (asPath (target))
  return { size: info.size, mtime: info.mtime, isFile: info.isFile () }
}

/**
 * The canonical path.
 * @example
 * ```ts
 * const full = await realpath ('static')
 * ```
 */
export const realpath = (target: string | URL): Promise<string> =>
  fs.realpath (asPath (target))

/**
 * The path of `child` inside `root`, with `/` between the parts.
 * Absent when `child` is the root itself or stands outside it.
 * @example
 * ```ts
 * within ('/app/static', '/app/static/_kit') // => '_kit'
 * within ('/app/static', '/app/.kit') // => undefined
 * ```
 */
export const within = (
  root: string | URL,
  child: string | URL,
): string | undefined => {
  const rel = path.relative (path.resolve (asPath (root)), path.resolve (asPath (child)))
  const outside = rel === '' || rel === '..' || rel.startsWith (`..${path.sep}`) || path.isAbsolute (rel)
  return outside ? undefined : rel.split (path.sep).join ('/')
}

/**
 * An empty directory under the system temp directory, named with `prefix`.
 * @example
 * ```ts
 * const dir = await mkdtemp ('kit-')
 * ```
 */
export const mkdtemp = (prefix = 'kit-'): Promise<string> =>
  fs.mkdtemp (path.join (os.tmpdir (), prefix))

/**
 * A file as a web stream.
 * @example
 * ```ts
 * const stream = await openStream ('video.mp4')
 * ```
 */
export const openStream = async (
  target: string | URL,
): Promise<ReadableStream<Uint8Array>> => {
  const handle = await fs.open (asPath (target), 'r')
  return handle.readableWebStream () as ReadableStream<Uint8Array>
}
