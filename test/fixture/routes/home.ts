import type * as F from '@algosail/plyfuture'
import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import type { Loaded, Route } from '../../../src/mod.ts'
import type { Shelf } from '../records/books.ts'
import type { Note } from '../records/notes.ts'
import type { Reader } from '../records/readers.ts'
import type { State } from '../state.ts'
import type { Row } from '../ui/listing.ts'
import { data, page } from '../../../src/mod.ts'
import { read } from '../answers.ts'
import * as Books from '../records/books.ts'
import * as Notes from '../records/notes.ts'
import { listing } from '../ui/listing.ts'
import { noteList } from '../ui/notes.ts'
import { link } from '../ui/text.ts'

type Read = {
  readonly shelves: readonly Shelf[]
  readonly notes: readonly Note[]
}

const gathered =
  (shelves: readonly Shelf[]) => (notes: readonly Note[]): Read => ({
    shelves,
    notes,
  })

const front = (): F.Future<unknown, Read> =>
  P.lift2 (gathered) (Books.shelves ()) (Notes.latest (3))

const asRow = (one: Shelf): Row => ({
  href: `/shelf/${one.slug}`,
  title: one.name,
  beside: `· ${one.count}`,
})

const asLine = (n: Note) => ({
  by: H.strong ([`${n.by}: `]),
  said: n.text,
})

const comeIn = () => H.p (['Come in, take a book, write in the margins.'])

const welcome = (r: Reader) =>
  H.p ([`Welcome back, ${r.name}. `, link ('/me', 'your shelf'), '.'])

const greeting = (reader: P.Maybe<Reader>) =>
  P.maybe_ (comeIn) (welcome) (reader)

export const home: Route<State> = page ({
  pattern: '/',
  load: () => read (front ()) ((r: Read): Loaded<Read> => data (r)),
  head: () => ({ title: P.just ('Reading Room') }),
  view: (ctx) =>
    H.section ([
      H.h1 (['Reading Room']),
      greeting (ctx.state.reader),
      H.h2 (['Shelves']),
      listing ('no shelves yet') (P.map (asRow) (ctx.data.shelves)),
      H.h2 (['Latest notes']),
      noteList ('nothing in the margins yet') (P.map (asLine) (ctx.data.notes)),
    ]),
})
