import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { FileInfo } from './disk.ts'
import type { Reply } from './types.ts'
import { openStream, readBytes, stat } from './disk.ts'
import * as Rp from './reply.ts'

/** What `cache-control` a file gets, by name. */
type Caching = (name: string) => string

/** A claim about a name, which is all `serves` below ever is. */
type Claim = (name: string) => boolean

/** Where the files are, and what to say about keeping them. */
export type StaticOptions = {
  /** The directory, as a URL: `new URL ('./static/', import.meta.url)`. */
  readonly dir: URL | string
  /** The prefix these are served under. */
  readonly base?: string
  /** What `cache-control` each file gets, by name. */
  readonly cache?: Caching
  /** Which names this directory answers for. */
  readonly serves?: Claim
}

const BASE = '/static/'

const BYTES = 'application/octet-stream'

const noCache: Caching = P.K ('no-cache')

const anyName: Claim = P.K (true)

const CLIMB: readonly string[] = ['..', '.']

const TYPES: Readonly<P.StrMap<string>> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  wasm: 'application/wasm',
  zip: 'application/zip',
}

const isThere = (at: number): boolean => at >= 0

const afterDot = (name: string) => (at: number): string =>
  P.toLower (name.slice (at + 1))

const extensionOf = (name: string): string =>
  P.fromMaybe ('') (
    P.map (afterDot (name)) (P.fromPredicate (isThere) (name.lastIndexOf ('.'))),
  )

/**
 * The media type a file name asks for, or bytes when it asks for nothing recognisable.
 * @example
 * ```ts
 * mediaType ('logo.svg') // => 'image/svg+xml'
 * mediaType ('LICENSE') // => 'application/octet-stream'
 * ```
 */
export function mediaType(name: string): string {
  return P.fromMaybe (BYTES) (P.lookup (extensionOf (name)) (TYPES))
}

const millisIn = (mtime: Date | null): number =>
  P.fromMaybe (0) (P.map ((one: Date) => one.getTime ()) (P.fromNullable (mtime)))

/**
 * A file's tag: its size and the moment it was written.
 * @example
 * ```ts
 * fileTag ({ size: 12, mtime: new Date (0) }) // => 'W/"c-0"'
 * ```
 */
export function fileTag(info: { size: number; mtime: Date | null }): string {
  return `W/"${info.size.toString (16)}-${millisIn (info.mtime).toString (16)}"`
}

const unescaped = P.maybeEncase (decodeURIComponent)

const isBlank = (said: string): boolean => said === ''

const hasNul = (said: string): boolean => said.includes ('\0')

const hasBackslash = (said: string): boolean => said.includes ('\\')

const climbs = (part: string): boolean => P.elem (part) (CLIMB)

const climbsOut = (said: string): boolean => P.any (climbs) (P.splitOn ('/') (said))

const unusable: readonly P.Predicate<string>[] = [
  P.predicate (isBlank),
  P.predicate (hasNul),
  P.predicate (hasBackslash),
  P.predicate (climbsOut),
]

const isUsable: (said: string) => boolean = P.predicateNot (
  P.anyPass (unusable),
)

const resolvedIn = (dir: URL) => (said: string): URL => new URL (said, dir)

const insideOf = (dir: URL) => (target: URL): boolean =>
  P.startsWith (dir.href) (target.href)

const under = (dir: URL) => (serves: Claim): (rest: string) => P.Maybe<URL> =>
  P.pipe ([
    unescaped,
    P.filter (P.predicateAnd (P.predicate (isUsable)) (P.predicate (serves))),
    P.chain (P.pipe ([resolvedIn (dir), P.fromPredicate (insideOf (dir))])),
  ])

const asUrl = (dir: URL | string): URL =>
  P.maybe_ (
    () => new URL (dir as URL),
  ) (
    (said: string) => new URL (said, 'file:///'),
  ) (P.fromPredicate (P.isString) (dir))

const withSlash = (url: URL): URL => new URL (url.href + '/')

const closed = (url: URL): URL =>
  P.onlyIf (!P.endsWith ('/') (url.href)) (withSlash) (url)

/** A directory as a URL that other URLs can be resolved against: a path becomes a file URL, and a URL that does not end in a slash gets one — without it, resolving a name against it would replace the last segment instead of going inside. */
export const directory: (dir: URL | string) => URL = P.pipe ([asUrl, closed])

/** A directory ready to serve: everything the options decided, worked out once. */
type Serving = {
  readonly resolve: (rest: string) => P.Maybe<URL>
  readonly base: string
  readonly cache: Caching
}

const servedIn = (options: StaticOptions): Claim =>
  P.defaultTo (anyName) (options.serves)

const servingOf = (options: StaticOptions): Serving => ({
  resolve: under (directory (options.dir)) (servedIn (options)),
  base: encodeURI (P.defaultTo (BASE) (options.base)),
  cache: P.defaultTo (noCache) (options.cache),
})

/** One request against a served directory. */
type Asked = {
  readonly at: Serving
  readonly request: Request
  readonly path: string
}

const askedOf = (at: Serving) => (request: Request): Asked => ({
  at,
  request,
  path: new URL (request.url).pathname,
})

/** A name under the prefix, and the file it points at. */
type Found = {
  readonly name: string
  readonly target: URL
}

/** What reading a file came to. */
type Read =
  | { readonly tag: 'known'; readonly etag: string }
  | {
    readonly tag: 'sending'
    readonly etag: string
    readonly data: Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array>
  }

const missing = (found: Found): F.Future<unknown, never> =>
  F.attemptP (() => Promise.reject (new Error (found.name)))

const sending =
  (etag: string) =>
  (data: Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array>): Read => ({
    tag: 'sending',
    etag,
    data,
  })

const whole = (found: Found) => (etag: string): F.Future<unknown, Read> =>
  P.map (sending (etag)) (F.attemptP (() => readBytes (found.target)))

const streamed = (found: Found) => (etag: string): F.Future<unknown, Read> =>
  P.map ((data: ReadableStream<Uint8Array>) => sending (etag) (data)) (
    F.attemptP (() => openStream (found.target)),
  )

const STREAMED_FROM = 64 * 1024

const fetched =
  (found: Found) =>
  (info: FileInfo) =>
  (etag: string): F.Future<unknown, Read> =>
    P.boolean (streamed (found) (etag)) (whole (found) (etag)) (
      info.size < STREAMED_FROM,
    )

const readOf =
  (found: Found) =>
  (asked: Asked) =>
  (info: FileInfo): F.Future<unknown, Read> => {
    const etag = fileTag (info)
    return P.boolean (fetched (found) (info) (etag)) (
      F.resolve<unknown, Read> ({ tag: 'known', etag }),
    ) (asked.request.headers.get ('if-none-match') === etag)
  }

const openedAt = (found: Found) => (asked: Asked): F.Future<unknown, Read> =>
  P.chain ((info: FileInfo) =>
    P.boolean<F.Future<unknown, Read>> (missing (found)) (
      readOf (found) (asked) (info),
    ) (
      info.isFile,
    ),
  ) (F.attemptP (() => stat (found.target)))

const dressed =
  (cache: Caching) => (name: string) => (etag: string): (r: Reply) => Reply =>
    Rp.headers ({ etag, 'cache-control': cache (name) })

const asReply = (asked: Asked) => (found: Found) =>
  P.cases<Read, Reply> ({
    known: (one) =>
      Rp.status (304) (
        dressed (asked.at.cache) (found.name) (one.etag) (Rp.noContent ()),
      ),
    sending: (one) =>
      dressed (asked.at.cache) (found.name) (one.etag) (
        Rp.body (mediaType (found.name)) (one.data),
      ),
  })

const sent = (asked: Asked) => (found: Found): F.Future<unknown, Reply> =>
  P.map (
    P.either ((_e: unknown): Reply => Rp.failed (404) (found.name)) (
      asReply (asked) (found),
    ),
  ) (
    F.coalesce (P.left<unknown, Read>) (P.right<unknown, Read>) (
      openedAt (found) (asked),
    ),
  )

const notOurs: F.Future<unknown, P.Maybe<Reply>> = F.resolve (
  P.nothing<Reply> (),
)

const nameIn = (asked: Asked): P.Maybe<string> =>
  P.stripPrefix (asked.at.base) (asked.path)

const foundIn = (asked: Asked) => (name: string): P.Maybe<Found> =>
  P.map ((target: URL): Found => ({ name, target })) (asked.at.resolve (name))

const answering =
  (asked: Asked) => (name: string): F.Future<unknown, P.Maybe<Reply>> =>
    P.maybe_<F.Future<unknown, P.Maybe<Reply>>> (
      () => F.resolve (P.just<Reply> (Rp.failed (404) (asked.path))),
    ) (
      (found: Found) => P.map (P.just<Reply>) (sent (asked) (found)),
    ) (foundIn (asked) (name))

const served = (asked: Asked): F.Future<unknown, P.Maybe<Reply>> =>
  P.maybe_ (() => notOurs) (answering (asked)) (nameIn (asked))

/**
 * Serves a directory.
 * @example
 * ```ts
 * // files :: StaticOptions -> Request -> Task (Maybe Reply)
 * const assets = files ({ dir: new URL ('./static/', import.meta.url) })
 * await runTask (assets (new Request ('http://x/static/logo.svg')))
 * // => just ({ tag: 'sent', status: 200, … })
 * ```
 */
export const files = (
  options: StaticOptions,
): (request: Request) => F.Future<unknown, P.Maybe<Reply>> =>
  P.pipe ([askedOf (servingOf (options)), served])

/** The default prefix, so an app and its markup can agree without a string. */
export const STATIC_BASE = BASE

/**
 * The `cache-control` for something that will never change under this name — a file with its own contents in its name.
 * @example
 * ```ts
 * files ({ dir, cache: forever })
 * ```
 */
export const forever = (): string => 'public, max-age=31536000, immutable'
