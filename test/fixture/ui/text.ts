import type * as D from '@algosail/plydom'
import * as H from '@algosail/plydom/h'
import { theme } from './theme.ts'

/** A link showing `text`. */
export const link = (href: string, text: string): D.View =>
  H.a ({ href }, [text])

/** Gray text beside a title: an author, who holds it, how many. */
export const quiet = (said: string): D.View =>
  H.span ({ class: theme.quiet }, [said])

/** The italic line a list shows when it has nothing. */
export const vacant = (said: string): D.View =>
  H.p ({ class: theme.vacant }, [said])
