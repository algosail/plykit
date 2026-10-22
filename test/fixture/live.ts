import * as P from '@algosail/ply'
import type { Live } from '../../src/mod.ts'
import type { Book } from './records/books.ts'
import { announce, stale } from '../../src/mod.ts'

/** What `stale` and `announce` need from a request: the free channel on its context. */
type Heard = { readonly live: Live }

/** Which region a book's notes are, named per book rather than once for all. */
export const notesOf = (book: string): string => `notes-${book}`

/** Which region the loans list is. */
export const DESK = 'desk'

/**
 * Something was written under a book.
 * @example
 * ```ts
 * // noteLeft :: Heard -> String -> !Undefined
 * noteLeft (ctx) ('hobbit')
 * ```
 */
export const noteLeft = (heard: Heard) => (book: string): void => {
  stale (heard) (notesOf (book))
}

// deskStale :: Heard -> !Undefined
const deskStale = (heard: Heard): void => {
  stale (heard) (DESK)
}

const tag = (returning: boolean): string =>
  returning
    ? 'gave'
    : 'took'

const payload = (returning: boolean) => (book: Book): string =>
  JSON.stringify ({ tag: tag (returning), title: book.title })

// sayLoan :: Heard -> Boolean -> Book -> !Undefined
const sayLoan =
  (heard: Heard) => (returning: boolean) => (book: Book): void => {
    announce (heard) ({ event: 'loan', data: payload (returning) (book) })
  }

/**
 * A book changed hands.
 * @example
 * ```ts
 * // loanChanged :: Heard -> Boolean -> Book -> !Undefined
 * loanChanged (ctx) (false) (book)
 * ```
 */
export const loanChanged =
  (heard: Heard) => (returning: boolean) => (book: Book): void => {
    deskStale (heard)
    sayLoan (heard) (returning) (book)
  }
