import * as P from '@algosail/ply'

/**
 * URL prefixes the island build writes and the Worker serves.
 * Both sides import these, so a chunk address and an ASSETS lookup stay the same string.
 */

/** Where island chunks and the extracted stylesheet are served. */
export const CHUNK_BASE = '/_kit/'

/** Where `static/` is served when the app does not name a prefix. */
export const FILE_BASE = '/static/'

/** A prefix with one trailing slash, so a path check matches the directory. */
export const withSlash = (base: string): string =>
  P.endsWith ('/') (base) ? base : `${base}/`
