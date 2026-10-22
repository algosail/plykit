import type * as F from '@algosail/plyfuture'
import * as P from '@algosail/ply'
import type { Book } from './books.ts'
import * as Books from './books.ts'

/** One line of the list. */
export type Entry = {
  readonly id: number
  readonly title: string
  readonly read: boolean
}

const entry = (at: number, book: Book): Entry => ({
  id: at,
  title: book.title,
  read: false,
})

/**
 * What a fresh list starts as: everything on the shelves, none of it read.
 * @example
 * ```ts
 * // seed :: () -> Task (Array Entry)
 * P.size (await F.promise (seed ()))
 * // => 4
 * ```
 */
export const seed = (): F.Future<unknown, readonly Entry[]> =>
  P.map ((books: readonly Book[]) =>
    P.zipWith (entry) (P.range (1) (P.add (1) (P.size (books)))) (books),
  ) (Books.all ())
