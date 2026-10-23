import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'

import type { Context, Handler, Loaded, Reply, Route } from '../../../src/mod.ts'
import type { Book } from '../records/books.ts'
import type { Loan } from '../records/loans.ts'
import type { Note } from '../records/notes.ts'
import type { Reader } from '../records/readers.ts'
import type { State } from '../state.ts'
import {
  data,
  failed,
  page,
  readFields,
  redirect,
  href as routeHref,
} from '../../../src/mod.ts'
import { leaveNote, lend } from '../actions.ts'
import { read, saving } from '../answers.ts'
import { mark } from '../islands/mark.ts'
import * as Books from '../records/books.ts'
import * as Loans from '../records/loans.ts'
import * as Notes from '../records/notes.ts'
import { margins } from '../ui/margins.ts'
import { link, quiet } from '../ui/text.ts'

const PATTERN = '/book/:slug'
export const href = routeHref (PATTERN)

/** What this page shows. */
type Read = {
  readonly book: Book
  readonly notes: readonly Note[]
  readonly heldBy: string | null
}

/** What the three reads answered. */
type Asked = {
  readonly found: P.Maybe<Book>
  readonly notes: readonly Note[]
  readonly loan: P.Maybe<Loan>
}

const gathered =
  (found: P.Maybe<Book>) =>
  (notes: readonly Note[]) =>
  (loan: P.Maybe<Loan>): Asked => ({ found, notes, loan })

const asked = (slug: string): F.Future<unknown, Asked> =>
  P.lift3 (gathered) (Books.bySlug (slug)) (Notes.under (slug)) (Loans.on (slug))

const holder = (loan: P.Maybe<Loan>): string | null =>
  P.fromMaybe<string | null> (null) (P.map ((l: Loan) => l.by) (loan))

const missing = (slug: string): Loaded<Read> => failed (404) (`no book ${slug}`)

const pageOf =
  (notes: readonly Note[]) =>
  (loan: P.Maybe<Loan>) =>
  (book: Book): Loaded<Read> =>
    data ({ book, notes, heldBy: holder (loan) })

const asRead =
  (slug: string) => ({ found, notes, loan }: Asked): Loaded<Read> =>
    P.maybe_ (() => missing (slug)) (pageOf (notes) (loan)) (found)

const backTo = (ctx: Context<State>): Reply =>
  redirect (P.fromMaybe (ctx.url.pathname) (href ({ slug: ctx.params.slug })))

const isYes = (answer: string): boolean => P.equals<string> ('yes') (answer)

const writing =
  (ctx: Context<State>) =>
  (reader: Reader) =>
  (fields: Readonly<P.StrMap<string>>): F.Future<unknown, Reply> =>
    saving (() => backTo (ctx)) (
      P.chain (leaveNote (ctx) (ctx.params.slug) (reader.name)) (
        P.lookup ('text') (fields),
      ),
    )

const lending =
  (ctx: Context<State>) =>
  (reader: Reader) =>
  (answer: string): F.Future<unknown, Reply> =>
    P.map (() => backTo (ctx)) (
      lend (ctx) (ctx.params.slug) (reader.name) (isYes (answer)),
    )

const fromReader =
  (ctx: Context<State>) =>
  (fields: Readonly<P.StrMap<string>>) =>
  (reader: Reader): F.Future<unknown, Reply> =>
    P.maybe_
      (() => writing (ctx) (reader) (fields))
      (lending (ctx) (reader))
      (P.lookup ('lend') (fields))

const signedOut = (): F.Future<unknown, Reply> =>
  F.resolve (failed (403) ('only readers can write in the margins'))

const posted: Handler<State> = (ctx) =>
  P.chain ((fields: Readonly<P.StrMap<string>>) =>
    P.maybe_ (signedOut) (fromReader (ctx) (fields)) (ctx.state.reader),
  ) (readFields (ctx.request))

export const book: Route<State> = page ({
  pattern: PATTERN,
  load: (ctx) => read (asked (ctx.params.slug)) (asRead (ctx.params.slug)),
  head: (ctx) => ({
    title: P.just (ctx.data.book.title),
    meta: [{ property: 'og:url', content: ctx.url.href }],
  }),
  on: { POST: posted },
  view: (ctx) =>
    H.article ([
      H.h1 ([ctx.data.book.title]),
      H.p ([quiet (`${ctx.data.book.author}, ${ctx.data.book.year}`)]),
      H.p ([ctx.data.book.blurb]),
      mark ({ pages: 320, at: 0 }),
      H.h2 (['In the margins']),
      margins ({
        book: ctx.params.slug,
        notes: ctx.data.notes,
        heldBy: ctx.data.heldBy,
        reader: ctx.state.reader,
        request: ctx.request,
      }),
      H.p ([link (`/shelf/${ctx.data.book.shelf}`, '← back to the shelf')]),
    ]),
})
