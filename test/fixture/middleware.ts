import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Answering, Context, Middleware, Reply } from '../../src/mod.ts'
import type { Reader } from './records/readers.ts'
import type { State } from './state.ts'
import {
  after,
  cors as allowing,
  csp,
  etag,
  failed,
  guard,
  only,
  trailingSlash,
  vary,
  whenRequest,
} from '../../src/mod.ts'
import { desk as deskRoute } from './routes/desk.ts'
import { me as meRoute } from './routes/me.ts'
import { OVER_HTTP } from './session.ts'
import * as Session from './session.ts'

const API = '/api/'

const isApi = (ctx: Context<unknown>): boolean =>
  P.startsWith (API) (ctx.url.pathname)

/** One address per page. */
export const slash: Middleware<State> = trailingSlash ()

/** What the API needs and no page does: this one is open to everyone, because it reads no session and there is nothing in it to borrow. */
export const cors: Middleware<State> = whenRequest (isApi) (
  allowing ({ methods: ['GET', 'POST'] }),
)

/** Proof that an unsafe request came from this room. */
export const proof: Middleware<State> = whenRequest (P.complement (isApi)) (
  guard ({ secure: P.not (OVER_HTTP) }),
)

/** What a page may load, said to the browser rather than hoped for. */
export const policy: Middleware<State> = csp ()

/** Every page this room draws carries a CSRF token, and the token belongs to the cookie that was minted with it — so no answer here is the same for two readers, and every one of them has to say so. */
export const varies: Middleware<State> = after (vary ('cookie'))

/** A tag on every answer, so a reader who reloads gets a 304 and no page. */
export const cached: Middleware<State> = etag ()

const refused = (): F.Future<unknown, Reply> =>
  F.resolve (failed (403) ('only readers are let in — sign in above'))

const forReaders: Middleware<State> =
  (next: Answering<State>): Answering<State> =>
  (ctx: Context<State>): F.Future<unknown, Reply> =>
    P.maybe_ (refused) ((_reader: Reader) => next (ctx)) (ctx.state.reader)

/** The two places that belong to a reader: their own shelf, and the desk. */
export const readersOnly: Middleware<State> = only<State> ([deskRoute, meRoute]) (
  forReaders,
)

const keep =
  (reader: P.Maybe<Reader>) =>
  (reply: Reply): F.Future<unknown, Reply> =>
    P.maybe_
      (() => F.resolve (reply))
      ((r: Reader) => Session.refresh (r) (reply))
      (reader)

/** A session that does not expire while someone is reading. */
export const sliding: Middleware<State> =
  (next: Answering<State>): Answering<State> =>
  (ctx: Context<State>): F.Future<unknown, Reply> =>
    P.chain (keep (ctx.state.reader)) (next (ctx))

/** Everything this room answers goes through these, outermost first. */
export const through: readonly Middleware<State>[] = [
  slash,
  cors,
  proof,
  policy,
  varies,
  cached,
  readersOnly,
  sliding,
]
