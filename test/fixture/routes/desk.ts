import type * as D from '@algosail/plydom'
import type * as F from '@algosail/plyfuture'
import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import type { Loaded, Route } from '../../../src/mod.ts'
import type { Book } from '../records/books.ts'
import type { Loan } from '../records/loans.ts'
import type { Reader } from '../records/readers.ts'
import type { App } from '../state.ts'
import type { Row } from '../ui/listing.ts'
import { data, page, part } from '../../../src/mod.ts'
import { read } from '../answers.ts'
import { desk as announcement } from '../islands/desk.ts'
import { DESK } from '../live.ts'
import * as Books from '../records/books.ts'
import * as Loans from '../records/loans.ts'
import { button } from '../ui/button.ts'
import { listing } from '../ui/listing.ts'
import { link } from '../ui/text.ts'

/** One line of the list: what is on loan, and who has it. */
type Out = {
  readonly slug: string
  readonly title: string
  readonly holder: string
}

type Read = { readonly out: readonly Out[] }

const withTitle = (all: readonly Book[]) => (loan: Loan): Out => ({
  slug: loan.book,
  title: Books.titleOf (all) (loan.book),
  holder: loan.by,
})

const outNow = (): F.Future<unknown, readonly Out[]> =>
  P.lift2 (
    (all: readonly Book[]) => (loans: readonly Loan[]): readonly Out[] =>
      P.map (withTitle (all)) (loans),
  ) (Books.all ()) (Loans.all ())

const isCalled = (r: Reader) => (name: string): boolean =>
  P.equals (name) (r.name)

const returnButton = (request: Request) => (slug: string): D.View =>
  button ({
    action: `/book/${slug}`,
    name: 'lend',
    value: 'yes',
    label: 'return',
  }) (request)

const theirs =
  (request: Request) => (one: Out) => (_name: string): D.Child =>
    returnButton (request) (one.slug)

const someoneElses = (_name: string): D.Child => null

const returnIfTheirs =
  (reader: P.Maybe<Reader>) =>
  (request: Request) =>
  (one: Out): D.Child =>
    P.maybe_<D.Child> (() => null) ((r: Reader) =>
      P.ifElse (isCalled (r)) (theirs (request) (one)) (someoneElses) (
        one.holder,
      ),
    ) (reader)

const asRow =
  (reader: P.Maybe<Reader>) => (request: Request) => (one: Out): Row => ({
    href: `/book/${one.slug}`,
    title: one.title,
    beside: `with ${one.holder}`,
    doing: returnIfTheirs (reader) (request) (one),
  })

export const desk: Route<App> = page ({
  pattern: '/desk',
  load: () =>
    read (outNow ()) ((out: readonly Out[]): Loaded<Read> => data ({ out })),
  head: () => ({ title: P.just ('Lending desk') }),
  view: (ctx) =>
    H.section ([
      H.h1 (['Lending desk']),
      announcement ({ quiet: 'quiet for now' }),
      H.section ({ ...part (DESK) }, [
        listing ('everything is in place') (
          P.map (asRow (ctx.state.reader) (ctx.request)) (ctx.data.out),
        ),
      ]),
      H.p ([link ('/', '← back to the reading room')]),
    ]),
})
