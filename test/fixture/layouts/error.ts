import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import type { ErrorView } from '../../../src/mod.ts'
import type { App } from '../state.ts'
import { link } from '../ui/text.ts'
import { room } from './room.ts'

export const error: ErrorView<App> = (ctx) =>
  room (ctx) (P.nothing ()) (
    H.section ([
      H.h1 ([String (ctx.error.status)]),
      H.p ([ctx.error.message]),
      H.p ([link ('/', '← back to the reading room')]),
    ]),
  )
