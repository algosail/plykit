import type { KitIsland } from '../build/build.ts'
import type { StaticOptions } from '../fs/static.ts'
import type { Options as HandlerOptions } from './server.ts'
import type { Context, Middleware } from './types.ts'

type Given<C extends Context> = Omit<HandlerOptions<C>, 'chunks' | 'through' | 'styleLink'>

/** How to run an app. */
export type Options<C extends Context = Context> = Given<C> & {
  /** What every page and every endpoint goes through — the list `answer` takes, in the same order: the first is the outermost. */
  readonly through?: readonly Middleware<C>[]
  /** Where the island chunks are written. */
  readonly outDir?: URL | string
  /** The URL prefix the chunks are served under. */
  readonly base?: string
  /** Build the islands at start-up, which is the default and is what `dev` does. */
  readonly build?: boolean
  readonly minify?: boolean
  /** A directory of files to serve beside the pages — pictures, fonts, a favicon. */
  readonly assets?: StaticOptions
  /** kit's own islands this app wants: `['navigation', 'live']`. */
  readonly include?: readonly KitIsland[]
  /** Whether to answer a static page from what a build read, instead of reading it again. */
  readonly prebuilt?: boolean
}

/** How an app is written down: exactly the options the Node host and `worker` take. */
export type Config<C extends Context = Context> = Options<C>
