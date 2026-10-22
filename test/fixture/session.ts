import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Cookie, Json, Loaded, Reply, Signed } from '../../src/mod.ts'
import type { Reader } from './records/readers.ts'
import {
  during,
  expire,
  insecure,
  openSigned,
  signedCookie,
  signing,
  withCookie,
} from '../../src/mod.ts'
import * as Readers from './records/readers.ts'

/** This reading room is brought up by `npm run demo` and answers over plain http, while `Secure` on the cookie tells the browser to take it only over https. */
export const OVER_HTTP = true

const KEY = 'reader'
const WEEK = 60 * 60 * 24 * 7

const keys: F.Future<unknown, Signed> = F.cache (
  signing ('reading is work too'),
)

const overHttp: (c: Cookie) => Cookie = P.onlyIf (OVER_HTTP) (insecure)

const carrying = (id: string): F.Future<unknown, Cookie> =>
  P.chain ((k: Signed) =>
    P.map (P.pipe ([during (WEEK), overHttp])) (signedCookie (k) (KEY) (id)),
  ) (keys)

const opened = (request: Request): F.Future<unknown, P.Maybe<string>> =>
  P.chain ((k: Signed) => openSigned (k) (KEY) (request)) (keys)

const readerFor = (id: P.Maybe<string>): F.Future<unknown, P.Maybe<Reader>> =>
  P.maybe_ (() => F.resolve (P.nothing<Reader> ())) (Readers.by) (id)

/**
 * Who is asking, as far as the cookie and the records agree.
 * @example
 * ```ts
 * // of :: Request -> Task (Maybe Reader)
 * await F.promise (of (request))
 * // => just({ id: '0b9b…', name: 'anya' })
 * ```
 */
export const of = (request: Request): F.Future<unknown, P.Maybe<Reader>> =>
  P.chain (readerFor) (opened (request))

/**
 * Puts the session on an answer.
 * @example
 * ```ts
 * // remember :: Reader -> Answer -> Task Answer
 * remember (reader) (redirect ('/'))
 * // => a redirect that carries the cookie with it
 * ```
 */
export const remember =
  (reader: Reader) =>
  <A extends Loaded<Json> | Reply>(answer: A): F.Future<unknown, A> =>
    P.map ((c: Cookie) => withCookie (c) (answer)) (carrying (reader.id))

const carries = (reply: Reply): boolean =>
  P.any ((c: Cookie) => P.equals<string> (KEY) (c.name)) (reply.cookies)

/** The same session put back — unless the answer already said something about it. */
export const refresh =
  (reader: Reader) => (reply: Reply): F.Future<unknown, Reply> =>
    carries (reply)
      ? F.resolve (reply)
      : remember (reader) (reply)

/** Takes it off. */
export const forget = <A extends Loaded<Json> | Reply>(answer: A): A =>
  withCookie (expire (KEY)) (answer)
