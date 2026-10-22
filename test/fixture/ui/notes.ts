import type * as D from '@algosail/plydom'
import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import { vacant } from './text.ts'
import { theme } from './theme.ts'

/** One written line: who or where it came from, and what was said. */
export type Line = {
  readonly by: D.Child
  readonly said: string
}

const line = (one: Line): D.View => H.li ([one.by, one.said])

/** The notes, or the italic line that stands for none of them. */
const listed = (lines: readonly Line[]): D.View =>
  H.ul ({ class: theme.notes }, P.map (line) (lines))

const noLines = (lines: readonly Line[]): boolean => P.isEmpty (lines)

const showEmpty = (nothing: string) => (_lines: readonly Line[]): D.View =>
  vacant (nothing)

export const noteList = (nothing: string) => (lines: readonly Line[]): D.View =>
  P.ifElse (noLines) (showEmpty (nothing)) (listed) (lines)
