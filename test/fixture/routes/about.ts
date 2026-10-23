import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import type { Route } from '../../../src/mod.ts'
import type { App } from '../state.ts'
import { page } from '../../../src/mod.ts'
import { link } from '../ui/text.ts'

export const about: Route<App> = page<App> ({
  pattern: '/about',
  static: true,
  head: () => ({ title: P.just ('About the reading room') }),
  view: () =>
    H.section ([
      H.h1 (['About the reading room']),
      H.p ([
        'Four books, one lending desk, and as many notes in the margins as you like. ',
        'That is enough to show everything the framework is made of.',
      ]),
      H.p ([link ('/', '← to the shelves')]),
    ]),
})
