import type { Config } from '@algosail/plykit'
import * as H from '@algosail/plydom/h'
import { page } from '@algosail/plykit'

const home = page ({
  pattern: '/',
  view: () => H.p (['hello']),
})

const application: Config = {
  routes: [home],
  assets: { dir: new URL ('./static/', import.meta.url) },
}

export default application
