import * as H from '@algosail/plydom/h'
import type { State } from '../state.ts'
import { layout } from '../../../src/mod.ts'
import { link } from '../ui/text.ts'
import { theme } from '../ui/theme.ts'

export const onShelf = layout<Record<string, never>, State> ({
  view: (ctx) =>
    H.section ([
      H.p ({ class: theme.breadcrumb }, [link ('/', 'Reading Room'), ' · shelf']),
      ctx.slot,
    ]),
})
