import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import { kept } from './kept.ts'

/** One book, out with one reader. */
export type Loan = {
  readonly book: string
  readonly by: string
}

const desk = kept<Loan> ([{ book: 'piknik', by: 'kostya' }])

const holds = (book: string) => (l: Loan): boolean => P.equals (book) (l.book)

const borrowedBy = (name: string) => (l: Loan): boolean => P.equals (name) (l.by)

/** Everything that is out. */
export const all = (): F.Future<unknown, readonly Loan[]> => desk.look ()

/** Who has this book, if anyone. */
export const on = (book: string): F.Future<unknown, P.Maybe<Loan>> =>
  P.map (P.find (holds (book))) (desk.look ())

const loan = (book: string) => (by: string): Loan => ({ book, by })

const notHeld = (loans: readonly Loan[]) => (book: string): boolean =>
  P.not (P.any (holds (book)) (loans))

const free = (loans: readonly Loan[]) => (book: string): P.Maybe<string> =>
  P.fromPredicate (notHeld (loans)) (book)

const recorded =
  (by: string) => (book: string): F.Future<unknown, P.Maybe<Loan>> => {
    const fresh = loan (book) (by)
    return P.map (() => P.just (fresh)) (desk.change (P.append (fresh)))
  }

const alreadyOut = (): F.Future<unknown, P.Maybe<Loan>> =>
  F.resolve (P.nothing<Loan> ())

/**
 * Takes a book out, unless it already is.
 * @example
 * ```ts
 * // take :: String -> String -> Task (Maybe Loan)
 * await F.promise (take ('piknik') ('anya'))
 * // => nothing()
 * ```
 */
export const take =
  (book: string) => (by: string): F.Future<unknown, P.Maybe<Loan>> =>
    P.chain ((loans: readonly Loan[]) =>
      P.maybe_ (alreadyOut) (recorded (by)) (free (loans) (book)),
    ) (desk.look ())

const returned = (book: string) => (loans: readonly Loan[]): readonly Loan[] =>
  P.reject (holds (book)) (loans)

/** Puts it back, whoever had it. */
export const give = (book: string): F.Future<unknown, void> =>
  P.voided (desk.change (returned (book)))

const byReader = (name: string) => (loans: readonly Loan[]): readonly Loan[] =>
  P.filter (borrowedBy (name)) (loans)

/** What one reader has out, so their own page can show it. */
export const by = (name: string): F.Future<unknown, readonly Loan[]> =>
  P.map (byReader (name)) (desk.look ())
