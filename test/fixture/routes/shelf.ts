import type * as F from '@algosail/plyfuture'
import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import type { Loaded, Route } from '../../../src/mod.ts'
import type { Book, Shelf } from '../records/books.ts'
import type { State } from '../state.ts'
import type { Row } from '../ui/listing.ts'
import { data, failed, page, href as routeHref } from '../../../src/mod.ts'
import { read } from '../answers.ts'
import * as Books from '../records/books.ts'
import { listing } from '../ui/listing.ts'
import { link } from '../ui/text.ts'

/** The pattern is named once, here, and exported — so a link to a shelf is built from the same string the router finds it by, and escaping stays the work of `href`, not of the caller. */
const PATTERN = '/shelf/:slug'
export const href = routeHref (PATTERN)

type Read = { readonly shelf: Shelf; readonly books: readonly Book[] }

/** What the two reads answered: the shelf may be missing, the list may not. */
type Asked = {
  readonly found: P.Maybe<Shelf>
  readonly books: readonly Book[]
}

const gathered =
  (found: P.Maybe<Shelf>) => (books: readonly Book[]): Asked => ({
    found,
    books,
  })

const asked = (slug: string): F.Future<unknown, Asked> =>
  P.lift2 (gathered) (Books.shelf (slug)) (Books.onShelf (slug))

const missing = (slug: string): Loaded<Read> => failed (404) (`no shelf ${slug}`)

const asRead = (slug: string) => ({ found, books }: Asked): Loaded<Read> =>
  P.maybe_ (() => missing (slug)) ((shelf: Shelf) => data ({ shelf, books })) (
    found,
  )

const asRow = (b: Book): Row => ({
  href: `/book/${b.slug}`,
  title: b.title,
  beside: `· ${b.author}, ${b.year}`,
})

export const shelf: Route<State> = page ({
  pattern: PATTERN,
  load: (ctx) => read (asked (ctx.params.slug)) (asRead (ctx.params.slug)),
  head: (ctx) => ({
    title: P.just (ctx.data.shelf.name),
    meta: [{ property: 'og:url', content: ctx.url.href }],
  }),
  view: (ctx) =>
    H.article ([
      H.h1 ([ctx.data.shelf.name]),
      listing ('this shelf is empty') (P.map (asRow) (ctx.data.books)),
      H.p ([link ('/', '← all shelves')]),
    ]),
})
