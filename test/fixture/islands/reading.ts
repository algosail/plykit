import * as P from '@algosail/ply'
import * as D from '@algosail/plydom'
import * as H from '@algosail/plydom/h'
import * as S from '@algosail/plystream'
import type { Entry } from '../records/list.ts'
import { css, island } from '../../../src/mod.ts'

/** Its own styles, so they are bundled with it and with nothing else. */
export const style = css`
  .list {
    list-style: none;
    padding: 0;
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid #f0ece2;
  }
  .entry button {
    margin-left: auto;
    border: 0;
    background: none;
    cursor: pointer;
    color: #a9a093;
  }
  .add,
  .clear {
    border: 1px solid #ded6c6;
    border-radius: 0.25rem;
    background: #fffdf8;
    cursor: pointer;
    padding: 0.2rem 0.6rem;
  }
  .clear[disabled] {
    color: #c7c0b3;
    cursor: default;
  }
  .left {
    color: #8a8275;
  }
`

/** What the page gives the list: the list itself, as the server seeded it. */
export type Props = { readonly seed: readonly Entry[] }

/** One change to the list. */
export type Change = (items: readonly Entry[]) => readonly Entry[]

/**
 * The number for the next entry is not state, but a question to the list: it already knows which numbers are taken.
 * @example
 * ```ts
 * // nextId :: Array Entry -> Number
 * nextId ([{ id: 4, title: 'Solaris', read: false }])
 * // => 5
 * ```
 */
export const nextId = (items: readonly Entry[]): number =>
  P.reduce ((n: number, e: Entry) => P.max (n) (P.add (1) (e.id))) (1) (items)

const blank = (text: string): boolean => P.equals<string> ('') (text)

const trimmed = (title: string): P.Maybe<string> =>
  P.fromPredicate (P.complement (blank)) (P.trim (title))

/**
 * Write down what was brought.
 * @example
 * ```ts
 * // adding :: String -> Change
 * adding ('  The Hobbit  ') ([])
 * // => [{ id: 1, title: 'The Hobbit', read: false }]
 * ```
 */
export const adding = (title: string): Change => (items) =>
  P.maybe_ (() => items) ((text: string) =>
    P.append ({ id: nextId (items), title: text, read: false }) (items),
  ) (trimmed (title))

const sameId = (id: number) => (e: Entry): boolean => P.equals (id) (e.id)

const flipped = (e: Entry): Entry => P.set ('read') (P.not (e.read)) (e)

const isRead = (e: Entry): boolean => e.read

/**
 * This entry is read, or not again.
 * @example
 * ```ts
 * // toggling :: Number -> Change
 * toggling (1) ([{ id: 1, title: 'a', read: false }])[0].read
 * // => true
 * ```
 */
export const toggling = (id: number): Change =>
  P.map (P.ifElse (sameId (id)) (flipped) (P.I))

/** This entry is gone. */
export const removing = (id: number): Change => P.reject (sameId (id))

/** What was read is gone. */
export const clearingRead: Change = P.reject (isRead)

/** How many are still unread. */
export const countLeft = (items: readonly Entry[]): number =>
  P.size (P.reject (isRead) (items))

/** Nothing to clear. */
export const noneRead = (items: readonly Entry[]): boolean =>
  P.not (P.any (isRead) (items))

/**
 * A view of one side of the list, quiet until that side has changed.
 * @example
 * ```ts
 * // part :: (Array Entry -> a) -> HeldStream (Array Entry) -> HeldStream a
 * part (countLeft) (items)
 * // => HeldStream Number
 * ```
 */
export function part<A>(
  read: (items: readonly Entry[]) => A,
): (items: S.HeldStream<readonly Entry[]>) => S.HeldStream<A> {
  return (items) =>
    S.skipRepeats ((a: A, b: A) => P.equals (a, b)) (P.map (read) (items))
}

/** Present as `checked=""` when on, and omitted when off. */
const checkedAttr = (on: boolean): string | null =>
  on
    ? ''
    : null

const saidIn = (field: string) => (e: Event): string =>
  D.fieldOf (field) (D.prevented (e))

/** A row is markup, and it is given nothing but its entry. */
const Row = (entry: S.HeldStream<Entry>) => {
  const read = P.map ((e: Entry) => e.read) (entry)
  return H.li ({ class: style.entry }, [
    H.input ({
      type: 'checkbox',
      checked: P.map (checkedAttr) (read),
      '.checked': read,
    }).use ({ marked: 'change' }),
    H.span ([P.map ((e: Entry) => e.title) (entry)]),
    H.button ({ type: 'button' }, ['×']).use ({ dropped: 'click' }),
  ])
}

/** What the markup names, and where that is read from. */
type Heard = {
  readonly typed: S.Stream<Event>
  readonly added: S.Stream<Event>
  readonly marked: S.Stream<readonly [number, Event]>
  readonly dropped: S.Stream<readonly [number, Event]>
  readonly cleared: S.Stream<Event>
}

/**
 * The list, and what it shows.
 * @example
 * ```ts
 * // reading :: Props -> Child
 * section ([reading ({ seed: [] })])
 * ```
 */
export const reading = island ('reading', (props: Props, on: Heard) => {
  const added = S.multicast (P.map (saidIn ('title')) (on.added))

  const draft = S.holdWith ('') (
    S.mergeArray<string> ([
      P.map (D.valueOf) (on.typed),
      P.map (() => '') (added),
    ]),
  )

  const items = S.hold (
    (was: readonly Entry[], apply: Change) => apply (was),
    props.seed,
  ) (
    S.mergeArray<Change> ([
      P.map (adding) (added),
      P.map (([id]: readonly [number, Event]) => toggling (id)) (on.marked),
      P.map (([id]: readonly [number, Event]) => removing (id)) (on.dropped),
      P.map (() => clearingRead) (on.cleared),
    ]),
  )
  const left = part (countLeft) (items)
  const idle = part (noneRead) (items)

  const withTyped = D.use ({ typed: 'input' })
  const withAdded = D.use ({ added: 'submit' })
  const withRowEvents = D.use ({ marked: 'marked', dropped: 'dropped' })
  const withCleared = D.use ({ cleared: 'click' })

  return H.div ([
    withAdded (H.form ({}, [
      withTyped (H.input ({
        name: 'title',
        placeholder: 'what else to read',
        value: draft,
        '.value': draft,
      })),
      H.button ({ class: style.add, type: 'submit' }, ['add']),
    ])),
    H.ul ({ class: style.list }, [
      withRowEvents (D.rows ((e: Entry) => e.id) (Row) (items)),
    ]),
    H.p ({ class: style.left }, ['left: ', left]),
    H.p ([
      withCleared (H.button ({
        class: style.clear,
        type: 'button',
        disabled: P.map (checkedAttr) (idle),
      }, ['clear finished'])),
    ]),
  ])
}, import.meta.url)
