import type * as F from '@algosail/plyfuture'
import * as P from '@algosail/ply'
import type { Live } from '../../src/mod.ts'
import type { Book } from './records/books.ts'
import type { Note } from './records/notes.ts'
import { loanChanged, noteLeft } from './live.ts'
import * as Books from './records/books.ts'
import * as Loans from './records/loans.ts'
import * as Notes from './records/notes.ts'

type Heard = { readonly live: Live }

// announceNote :: Heard -> String -> Note -> !Undefined
const announceNote = (heard: Heard) => (book: string) => (_note: Note): void => {
  noteLeft (heard) (book)
}

const andAnnounce =
  (heard: Heard) =>
  (book: string) =>
  (writing: F.Future<unknown, Note>): F.Future<unknown, Note> =>
    P.map (P.tap (announceNote (heard) (book))) (writing)

/**
 * Write a note under a book.
 * @example
 * ```ts
 * // leaveNote :: Heard -> String -> String -> String -> Maybe (Task Note)
 * leaveNote (ctx) ('hobbit') ('anya') ('   ')
 * // => nothing()
 * ```
 */
export const leaveNote =
  (heard: Heard) =>
  (book: string) =>
  (by: string) =>
  (text: string): P.Maybe<F.Future<unknown, Note>> =>
    P.map (andAnnounce (heard) (book)) (Notes.write (book) (by) (text))

const borrowOrReturn =
  (book: string) =>
  (by: string) =>
  (returning: boolean): F.Future<unknown, void> =>
    returning
      ? Loans.give (book)
      : P.voided (Loans.take (book) (by))

// announceLoan :: Heard -> Boolean -> Maybe Book -> !Undefined
const announceLoan =
  (heard: Heard) => (returning: boolean) => (found: P.Maybe<Book>): void => {
    P.forEach (loanChanged (heard) (returning)) (found)
  }

const handed =
  (book: string) =>
  (by: string) =>
  (returning: boolean) =>
  (found: P.Maybe<Book>): F.Future<unknown, P.Maybe<Book>> =>
    P.voidRight (found) (borrowOrReturn (book) (by) (returning))

/**
 * Borrow a book or return it.
 * @example
 * ```ts
 * // lend :: Heard -> String -> String -> Boolean -> Task (Maybe Book)
 * await F.promise (lend (ctx) ('hobbit') ('anya') (false))
 * // => just({ slug: 'hobbit', title: 'The Hobbit', … })
 * ```
 */
export const lend =
  (heard: Heard) =>
  (book: string) =>
  (by: string) =>
  (returning: boolean): F.Future<unknown, P.Maybe<Book>> =>
    P.map (P.tap (announceLoan (heard) (returning))) (
      P.chain (handed (book) (by) (returning)) (Books.bySlug (book)),
    )
