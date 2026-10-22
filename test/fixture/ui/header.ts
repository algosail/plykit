import type * as D from '@algosail/plydom'
import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'

import type { Shelf } from '../records/books.ts'
import type { Reader } from '../records/readers.ts'
import { signIn, signOut } from './sign.ts'
import { link } from './text.ts'
import { theme } from './theme.ts'

/** Shelves in the menu, and the loan count drawn after the reader's name. */
export type Banner = {
  readonly shelves: readonly Shelf[]
  /** Drawn after the name as "· on loan n", and omitted when it is 0. */
  readonly holding: number
}

/** The bar: shelf links, and the reader's name or the sign-in field. */
export const header =
  (banner: P.Maybe<Banner>) =>
  (reader: P.Maybe<Reader>) =>
  (from: string) =>
  (request: Request): D.View =>
    H.header ({ class: theme.header }, [
      H.nav ({ class: theme.menu }, [
        H.img ({ src: '/static/lamp.svg', alt: '', width: '24', height: '24' }),
        link ('/', 'Reading Room'),
        ...shelfLinks (banner),
        link ('/about', 'About the reading room'),
      ]),
      H.div ({ class: theme.account }, [
        ...account (banner) (reader) (from) (request),
      ]),
    ])

const shelfLinks = (banner: P.Maybe<Banner>): readonly D.Child[] =>
  P.maybe_<readonly D.Child[]> (() => []) ((shown: Banner) =>
    P.map ((one: Shelf) =>
      link (`/shelf/${one.slug}`, `${one.name} · ${one.count}`),
    ) (shown.shelves),
  ) (banner)

const onLoan = (n: number): string =>
  P.equals<number> (0) (n)
    ? ''
    : ` · on loan ${n}`

const loansAfterName = (banner: P.Maybe<Banner>): string =>
  P.maybe_ (() => '') ((shown: Banner) => onLoan (shown.holding)) (banner)

const account =
  (banner: P.Maybe<Banner>) =>
  (reader: P.Maybe<Reader>) =>
  (from: string) =>
  (request: Request): readonly D.Child[] =>
    P.maybe_<readonly D.Child[]> (() => [signIn (from) (request)]) ((
      r: Reader,
    ) => [
      link ('/me', `${r.name}${loansAfterName (banner)}`),
      link ('/desk', 'Lending desk'),
      signOut (from) (request),
    ]) (reader)
