import type * as D from '@algosail/plydom'
import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import type { Context, Loaded } from '../../../src/mod.ts'
import type { Shelf } from '../records/books.ts'
import type { Reader } from '../records/readers.ts'
import type { State } from '../state.ts'
import type { Banner } from '../ui/header.ts'
import { data, layout, live, navigation } from '../../../src/mod.ts'
import { read } from '../answers.ts'
import * as Books from '../records/books.ts'
import * as Loans from '../records/loans.ts'
import { header } from '../ui/header.ts'
import { theme } from '../ui/theme.ts'

const loansHeld = (reader: P.Maybe<Reader>): F.Future<unknown, number> =>
  P.maybe_
    (() => F.resolve (0))
    ((r: Reader) => P.map (P.size) (Loans.by (r.name)))
    (reader)

const bannerOf = (reader: P.Maybe<Reader>): F.Future<unknown, Banner> =>
  P.lift2 (
    (shelves: readonly Shelf[]) => (holding: number): Banner => ({
      shelves,
      holding,
    }),
  ) (Books.shelves ()) (loansHeld (reader))

/** The markup of the room, given what the header could read. */
export const room =
  (ctx: Context<State>) => (banner: P.Maybe<Banner>) => (slot: D.Child): D.View =>
    H.div ({ class: theme.page }, [
      header (banner) (ctx.state.reader) (ctx.url.pathname) (ctx.request),
      H.main ([slot]),
      H.footer ({ class: theme.footer }, [
        H.small (['built on @algosail/ply']),
        navigation ({}),
        live ({ hear: ['loan'] }),
      ]),
    ])

/** `shell([…])` puts this around the routes it is for. */
export const shell = layout<Banner, State> ({
  load: (ctx) =>
    read (bannerOf (ctx.state.reader)) ((
      banner: Banner,
    ): Loaded<Banner> => data (banner)),
  view: (ctx) => room (ctx) (P.just (ctx.data)) (ctx.slot),
})
