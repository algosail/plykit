import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Cookie } from './cookie.ts'
import { cookie as makeCookie } from './cookie.ts'
import { cookies as readCookies } from './request.ts'

/** Signing and checking, with the key already imported. */
export type Signed = {
  /** `value.signature` — the value is still readable, only not writable. */
  readonly sign: (value: string) => F.Future<unknown, string>
  /** The value back, or nothing if this is not what was signed. */
  readonly open: (signed: string) => F.Future<unknown, P.Maybe<string>>
}

const bytes = new TextEncoder ()

const asUrlSafe: (said: string) => string = P.pipe (
  P.replaceAll ('+', '-'),
  P.replaceAll ('/', '_'),
  P.replaceAll ('=', ''),
)

const asBase64: (said: string) => string = P.pipe (
  P.replaceAll ('-', '+'),
  P.replaceAll ('_', '/'),
)

const paddingOf = (said: string): string =>
  '='.repeat ((4 - said.length % 4) % 4)

const asChar = (b: number): string => String.fromCharCode (b)

/**
 * Base64url, by hand rather than by dependency: this is four lines and the alternative is a package on the critical path of every signed cookie.
 * @example
 * ```ts
 * base64Url (new Uint8Array ([104, 105]).buffer)
 * // => 'aGk' — no padding, nothing a URL or a cookie would object to
 * ```
 */
export function base64Url(buffer: ArrayBuffer): string {
  const raw = P.foldMap (P.Concat) (asChar) (
    P.fromIterable (new Uint8Array (buffer)),
  )
  return asUrlSafe (btoa (raw))
}

const fromBase64 = (said: string): Uint8Array =>
  Uint8Array.from (atob (said + paddingOf (said)), (c: string) => c.charCodeAt (0))

const decoded = (text: string): P.Maybe<Uint8Array> =>
  P.maybeEncase (fromBase64) (asBase64 (text))

/** A signed value, split: what was signed, and the signature over it. */
type Split = {
  readonly value: string
  readonly mac: Uint8Array
}

const isSeparator = (at: number): boolean => at > 0

const splitOn = (signed: string) => (at: number): P.Maybe<Split> =>
  P.map ((mac: Uint8Array): Split => ({ value: signed.slice (0, at), mac })) (
    decoded (signed.slice (at + 1)),
  )

const splitOf = (signed: string): P.Maybe<Split> =>
  P.chain (splitOn (signed)) (
    P.fromPredicate (isSeparator) (signed.lastIndexOf ('.')),
  )

const signWith =
  (key: CryptoKey) => (value: string): F.Future<unknown, string> =>
    P.map ((mac: ArrayBuffer) => `${value}.${base64Url (mac)}`) (
      F.attemptP (() => crypto.subtle.sign ('HMAC', key, bytes.encode (value))),
    )

const verifyWith =
  (key: CryptoKey) => (split: Split): F.Future<unknown, boolean> =>
    F.attemptP (() =>
      crypto.subtle.verify (
        'HMAC',
        key,
        split.mac as unknown as BufferSource,
        bytes.encode (split.value),
      ),
    )

const checkedWith =
  (key: CryptoKey) => (split: Split): F.Future<unknown, P.Maybe<string>> =>
    P.map ((ok: boolean) =>
      P.boolean (P.nothing<string> ()) (P.just (split.value)) (ok),
    ) (verifyWith (key) (split))

const openWith =
  (key: CryptoKey) => (signed: string): F.Future<unknown, P.Maybe<string>> =>
    P.maybe_ (
      () => F.resolve (P.nothing<string> ()),
    ) (
      checkedWith (key),
    ) (splitOf (signed))

const importedFrom = (secret: string): F.Future<unknown, CryptoKey> =>
  F.attemptP (() =>
    crypto.subtle.importKey (
      'raw',
      bytes.encode (secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    ),
  )

/**
 * Imports a secret and hands back the two operations that use it.
 * @example
 * ```ts
 * // signing :: String -> Task Signed
 * const keys = await runTask (signing (conf.secret))
 * await runTask (keys.sign ('7')) // => '7.zP1zhbWNC1ne…'
 * ```
 */
export function signing(secret: string): F.Future<unknown, Signed> {
  return P.map ((key: CryptoKey): Signed => ({
    sign: signWith (key),
    open: openWith (key),
  })) (importedFrom (secret))
}

/**
 * SHA-256 of a string, base64url.
 * @example
 * ```ts
 * // digest :: String -> Task String
 * await runTask (digest ('hello')) // => 'gxDMEcJcJZ8…'
 * ```
 */
export function digest(text: string): F.Future<unknown, string> {
  return P.map (base64Url) (
    F.attemptP (() => crypto.subtle.digest ('SHA-256', bytes.encode (text))),
  )
}

/**
 * The same cookie with its value signed.
 * @example
 * ```ts
 * // seal :: Signed -> Cookie -> Task Cookie
 * await runTask (seal (keys) (during (WEEK) (cookie ('visitor') ('7'))))
 * // => { name: 'visitor', value: '7.zP1zhbWNC1ne…', maxAge: just (604800), … }
 * ```
 */
export function seal(keys: Signed): (c: Cookie) => F.Future<unknown, Cookie> {
  return (c: Cookie): F.Future<unknown, Cookie> =>
    P.map ((value: string) => P.set ('value') (value) (c)) (
      keys.sign (c.value),
    )
}

const carried = (name: string) => (request: Request): P.Maybe<string> =>
  P.lookup (name) (readCookies (request))

/**
 * A cookie's value, if the signature is ours.
 * @example
 * ```ts
 * // open :: Signed -> String -> Request -> Task (Maybe String)
 * await runTask (open (keys) ('visitor') (request)) // => just ('7')
 * ```
 */
export function open(
  keys: Signed,
): (name: string) => (request: Request) => F.Future<unknown, P.Maybe<string>> {
  return (name: string) =>
    P.pipe (
      carried (name),
      P.maybe_ (() => F.resolve (P.nothing<string> ())) (keys.open),
    )
}

/** A signed cookie under the session defaults, ready to go on an answer. */
export function sealed(
  keys: Signed,
): (name: string) => (value: string) => F.Future<unknown, Cookie> {
  return (name: string) => P.pipe (makeCookie (name), seal (keys))
}
