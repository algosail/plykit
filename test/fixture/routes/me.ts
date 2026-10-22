import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import type { Loaded, Route } from '../../../src/mod.ts'
import type { Book } from '../records/books.ts'
import type { Entry } from '../records/list.ts'
import type { Loan } from '../records/loans.ts'
import type { Note } from '../records/notes.ts'
import type { Reader } from '../records/readers.ts'
import type { State } from '../state.ts'
import type { Row } from '../ui/listing.ts'
import { data, page } from '../../../src/mod.ts'
import { read } from '../answers.ts'
import { reading as readLater } from '../islands/reading.ts'
import * as Books from '../records/books.ts'
import * as List from '../records/list.ts'
import * as Loans from '../records/loans.ts'
import * as Notes from '../records/notes.ts'
import { button } from '../ui/button.ts'
import { listing } from '../ui/listing.ts'
import { noteList } from '../ui/notes.ts'
import { link, quiet } from '../ui/text.ts'

/** One book on loan, named as the reader knows it. */
type Held = { readonly slug: string; readonly title: string }

type Read = {
  readonly name: string
  readonly held: readonly Held[]
  readonly notes: readonly Note[]
  readonly later: readonly Entry[]
}

const heldBook = (all: readonly Book[]) => (loan: Loan): Held => ({
  slug: loan.book,
  title: Books.titleOf (all) (loan.book),
})

const mine = (reader: Reader): F.Future<unknown, Read> =>
  P.chain ((all: readonly Book[]) =>
    P.chain ((loans: readonly Loan[]) =>
      P.chain ((notes: readonly Note[]) =>
        P.map ((later: readonly Entry[]): Read => ({
          name: reader.name,
          held: P.map (heldBook (all)) (loans),
          notes,
          later,
        })) (List.seed ()),
      ) (Notes.by (reader.name)),
    ) (Loans.by (reader.name)),
  ) (Books.all ())

const NOBODY: Read = { name: '', held: [], notes: [], later: [] }

const loadMine = (reader: P.Maybe<Reader>): F.Future<unknown, Read> =>
  P.maybe_ (() => F.resolve (NOBODY)) (mine) (reader)

const asRow = (request: Request) => (one: Held): Row => ({
  href: `/book/${one.slug}`,
  title: one.title,
  doing: button ({
    action: `/book/${one.slug}`,
    name: 'lend',
    value: 'yes',
    label: 'return',
  }) (request),
})

const asLine = (n: Note) => ({
  by: link (`/book/${n.book}`, n.book),
  said: n.text,
})

export const me: Route<State> = page ({
  pattern: '/me',
  load: (ctx) =>
    read (
      loadMine (ctx.state.reader),
    ) ((r: Read): Loaded<Read> => data (r)),
  head: (ctx) => ({ title: P.just (`${ctx.data.name} · my shelf`) }),
  view: (ctx) =>
    H.section ([
      H.h1 ([ctx.data.name]),

      H.h2 (['On loan']),
      listing ('nothing yet — take something off a shelf') (
        P.map (asRow (ctx.request)) (ctx.data.held),
      ),

      H.h2 (['My notes']),
      noteList ('you have not written anything yet') (P.map (asLine) (ctx.data.notes)),

      H.h2 (['Read later']),
      H.p ([quiet ('a draft: it stays in this tab and goes nowhere')]),
      readLater ({ seed: ctx.data.later }),
    ]),
})
