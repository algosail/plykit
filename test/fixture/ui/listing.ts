import type * as D from '@algosail/plydom'
import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import { link, quiet, vacant } from './text.ts'
import { theme } from './theme.ts'

/** One row: a title you can open, gray text beside it, and a button when there is one. */
export type Row = {
  readonly href: string
  readonly title: string
  /** Gray text beside the title — an author, who holds it, how many. */
  readonly beside?: string
  /** The button at the end of the row, when the row has one. */
  readonly doing?: D.Child
}

const beside = (one: Row): readonly D.Child[] =>
  P.toArray (P.map (quiet) (P.fromNullable (one.beside)))

const doing = (one: Row): readonly D.Child[] =>
  P.toArray (P.fromNullable (one.doing))

const row = (one: Row): D.View =>
  H.li ([link (one.href, one.title), ...beside (one), ...doing (one)])

/**
 * The rows, or the italic line that stands for none of them.
 * @example
 * ```ts
 * // listing :: String -> Array Row -> View
 * listing ('this shelf is empty') ([{ href: '/book/hobbit', title: 'The Hobbit' }])
 * ```
 */
const listed = (rows: readonly Row[]): D.View =>
  H.ul ({ class: theme.listing }, P.map (row) (rows))

const noRows = (rows: readonly Row[]): boolean => P.isEmpty (rows)

const showEmpty = (nothing: string) => (_rows: readonly Row[]): D.View =>
  vacant (nothing)

export const listing = (nothing: string) => (rows: readonly Row[]): D.View =>
  P.ifElse (noRows) (showEmpty (nothing)) (listed) (rows)
