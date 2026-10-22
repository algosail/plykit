import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Json, Loaded, Reply } from '../../src/mod.ts'
import type { Note } from './records/notes.ts'
import { failed } from '../../src/mod.ts'
import * as Notes from './records/notes.ts'

const failedRead = <D extends Json>(err: unknown): Loaded<D> =>
  failed (500) (`the shelf could not be read: ${String (err)}`)

const settled = <A>(
  source: F.Future<unknown, A>,
): F.Future<unknown, P.Either<unknown, A>> =>
  F.coalesce (P.left<unknown, A>) (P.right<unknown, A>) (source)

/**
 * Runs a read and folds what stopped it into the route's outcome: what came back becomes data, what threw or refused becomes a 500 — the room's fault, not the reader's.
 * @example
 * ```ts
 * // read :: Task a -> (a -> Loaded d) -> Task (Loaded d)
 * read (Books.all ()) ((books) => data ({ books }))
 * // => Task (Loaded { books: Array Book })
 * ```
 */
export const read =
  <A>(source: F.Future<unknown, A>) =>
  <D extends Json>(onRead: (a: A) => Loaded<D>): F.Future<unknown, Loaded<D>> =>
    P.map (P.either (failedRead<D>) (onRead)) (settled (source))

const emptyNote = (): F.Future<unknown, Reply> =>
  F.resolve (failed (400) (Notes.EMPTY))

const written =
  (announce: (note: Note) => Reply) =>
  (writing: F.Future<unknown, Note>): F.Future<unknown, Reply> =>
    P.map (announce) (writing)

/**
 * Folds what `records/notes.ts` said about a note into an answer: nothing to write is a 400, and the task that would have written it is never run.
 * @example
 * ```ts
 * // saving :: (Note -> Reply) -> Maybe (Task Note) -> Task Reply
 * saving ((n) => withStatus (201) (json (n))) (write ('hobbit') ('anya') ('yes'))
 * // => Task (Sent 201)
 * ```
 */
export const saving = (
  announce: (note: Note) => Reply,
): (writing: P.Maybe<F.Future<unknown, Note>>) => F.Future<unknown, Reply> =>
  P.maybe_ (emptyNote) (written (announce))
