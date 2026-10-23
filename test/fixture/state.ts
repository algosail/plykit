import type * as F from '@algosail/plyfuture'
import * as P from '@algosail/ply'
import type { Context } from '../../src/mod.ts'
import type { Reader } from './records/readers.ts'
import * as Session from './session.ts'

/** The one context this app hands to every route, layout and middleware. */
export type App = Context<State>

/** What this app prepares for each request. */
export type State = {
  /** Who is asking, if the cookie they carry still stands for someone. */
  readonly reader: P.Maybe<Reader>
}

/**
 * Built once per request, so a page, the chrome around it and every handler read the same reader.
 * @example
 * ```ts
 * // state :: Request -> Task State
 * await F.promise (state (new Request ('http://x/')))
 * // => { reader: nothing() }
 * ```
 */
export const state = (request: Request): F.Future<unknown, State> =>
  P.map ((reader: P.Maybe<Reader>): State => ({ reader })) (Session.of (request))
