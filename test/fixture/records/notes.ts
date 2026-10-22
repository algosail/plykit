import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import { kept } from './kept.ts'

/** One note, under one book, by whoever was signed in when it was left. */
export type Note = {
  readonly id: number
  readonly book: string
  readonly by: string
  readonly text: string
}

const page = kept<Note> ([
  { id: 1, book: 'solaris', by: 'kostya', text: 'read it again and still did not understand' },
])

const about = (book: string) => (n: Note): boolean => P.equals (book) (n.book)

const writtenBy = (name: string) => (n: Note): boolean => P.equals (name) (n.by)

const ofBook = (book: string) => (notes: readonly Note[]): readonly Note[] =>
  P.filter (about (book)) (notes)

/** The notes under one book, oldest first. */
export const under = (book: string): F.Future<unknown, readonly Note[]> =>
  P.map (ofBook (book)) (page.look ())

const noMoreThan =
  (n: number) => (notes: readonly Note[]): number =>
    P.min (n) (P.size (notes))

const newest =
  (n: number) => (notes: readonly Note[]): readonly Note[] =>
    P.fromMaybe<readonly Note[]> ([]) (
      P.take (noMoreThan (n) (notes)) (P.reverse (notes)),
    )

/** The last few notes anywhere, newest first, shorter when fewer than that exist. */
export const latest = (n: number): F.Future<unknown, readonly Note[]> =>
  P.map (newest (n)) (page.look ())

/** What to say when there was nothing to write. */
export const EMPTY = 'an empty note cannot be saved'

const noted =
  (book: string) =>
  (by: string) =>
  (text: string) =>
  (notes: readonly Note[]): Note => ({
    id: P.add (1) (P.size (notes)),
    book,
    by,
    text,
  })

const placed =
  (book: string) =>
  (by: string) =>
  (text: string): F.Future<unknown, Note> =>
    P.chain ((notes: readonly Note[]) => {
      const fresh = noted (book) (by) (text) (notes)
      return P.map (() => fresh) (page.change (P.append (fresh)))
    }) (page.look ())

const blank = (text: string): boolean => P.equals<string> ('') (text)

const filled = (text: string): P.Maybe<string> =>
  P.fromPredicate (P.complement (blank)) (P.trim (text))

/**
 * The one rule about writing a note: nothing in it is not a note.
 * @example
 * ```ts
 * // write :: String -> String -> String -> Maybe (Task Note)
 * write ('hobbit') ('anya') ('   ')
 * // => nothing()
 * ```
 */
export const write =
  (book: string) =>
  (by: string) =>
  (text: string): P.Maybe<F.Future<unknown, Note>> =>
    P.map (placed (book) (by)) (filled (text))

const byAuthor = (name: string) => (notes: readonly Note[]): readonly Note[] =>
  P.reverse (P.filter (writtenBy (name)) (notes))

/** What one reader wrote, newest first. */
export const by = (name: string): F.Future<unknown, readonly Note[]> =>
  P.map (byAuthor (name)) (page.look ())
