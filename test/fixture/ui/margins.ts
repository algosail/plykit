import type * as D from '@algosail/plydom'
import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'

import type { Note } from '../records/notes.ts'
import type { Reader } from '../records/readers.ts'
import { csrfProps, into, part } from '../../../src/mod.ts'
import { notesOf } from '../live.ts'
import { button } from './button.ts'
import { noteList } from './notes.ts'
import { quiet } from './text.ts'
import { theme } from './theme.ts'

/** Everything the region needs to know, and nothing more. */
export type Margins = {
  readonly book: string
  readonly notes: readonly Note[]
  /** The name of whoever has the book, or `null` if it is in place. */
  readonly heldBy: string | null
  readonly reader: P.Maybe<Reader>
  readonly request: Request
}

const intoNotes = (book: string): D.Props => into (notesOf (book))

const sameName = (name: string) => (r: Reader): boolean => P.equals (name) (r.name)

const heldByReader = (m: Margins) => (heldBy: string): boolean =>
  P.fromMaybe (false) (P.map (sameName (heldBy)) (m.reader))

const loanButton = (m: Margins, value: string, label: string): D.View =>
  button ({
    action: `/book/${m.book}`,
    name: 'lend',
    value,
    label,
    props: intoNotes (m.book),
  }) (m.request)

const returnButton = (m: Margins): D.View => loanButton (m, 'yes', 'return')

const borrowButton = (m: Margins): D.View => loanButton (m, 'no', 'borrow')

const signInToBorrow = (): D.Child =>
  quiet ('sign in above to borrow a book')

const offerBorrow = (m: Margins) => (_reader: Reader): D.Child =>
  borrowButton (m)

const borrowLine = (m: Margins): D.Child =>
  P.maybe_ (signInToBorrow) (offerBorrow (m)) (m.reader)

const giveBack = (m: Margins) => (_name: string): D.Child => returnButton (m)

const outWith = (name: string): D.Child => quiet (`out with ${name}`)

const whileHeld = (m: Margins) => (heldBy: string): D.Child =>
  P.ifElse (heldByReader (m)) (giveBack (m)) (outWith) (heldBy)

const whenInPlace = (m: Margins) => (): D.Child => borrowLine (m)

const loanLine = (m: Margins): D.Child =>
  P.maybe_ (whenInPlace (m)) (whileHeld (m)) (P.fromNullable (m.heldBy))

const compose = (m: Margins) => (r: Reader): D.View =>
  H.form ({ ...intoNotes (m.book), class: theme.compose, method: 'post' }, [
    H.input (csrfProps (m.request)),
    H.input ({ name: 'text', placeholder: `what will you say, ${r.name}?` }),
    H.button ({ class: theme.button, type: 'submit' }, ['write']),
  ])

const signedOutLine = (said: string) => (): D.Child => quiet (said)

const whenSignedIn =
  (m: Margins) =>
  (said: string) =>
  (offer: (r: Reader) => D.Child): D.Child =>
    P.maybe_ (signedOutLine (said)) (offer) (m.reader)

const noteLine = (n: Note) => ({ by: H.strong ([`${n.by}: `]), said: n.text })

/** The notes under a book, the borrow or return button, and the field for a new note. */
export const margins = (m: Margins): D.View =>
  H.section ({ ...part (notesOf (m.book)) }, [
    noteList ('nobody has written here yet') (P.map (noteLine) (m.notes)),
    loanLine (m),
    whenSignedIn (m) ('sign in to write in the margins') (compose (m)),
  ])
