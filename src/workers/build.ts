import { resolve } from 'node:path'
import type { Config } from '../app/config.ts'
import type { Built } from '../build/build.ts'
import { build, chunkDir, KIT_DIR, report } from '../build/build.ts'
import { stage } from './stage.ts'

/** What `workerBuild` takes besides the app. */
export type WorkerBuildOptions = {
  /**
   * Unminified chunks, and static loads stay live.
   * `wrangler dev` and `wrangler types` set `WRANGLER_COMMAND` to the same effect.
   */
  readonly dev?: boolean
  /** The application root. The current directory when omitted. */
  readonly root?: string
}

/** What `workerBuild` wrote, and the island build it started from. */
export type WorkerBuilt = {
  readonly built: Built
  readonly assets: string
  readonly record: string
}

/**
 * A dev build: no minify, and static loads stay live.
 * `wrangler dev` and `wrangler types` set `WRANGLER_COMMAND`.
 * @example
 * ```ts
 * developing (false, 'dev') // => true
 * developing (false, 'deploy') // => false
 * ```
 */
export const developing = (
  asked = false,
  command: string | undefined = process.env.WRANGLER_COMMAND,
): boolean => asked || command === 'dev' || command === 'types'

/**
 * What Wrangler runs before it bundles.
 * `build` writes `.kit`. `stage` copies that into `dist/assets` and `dist/record.json`.
 * The worker entry and `wrangler.jsonc` belong to the application. This does not read or write them.
 * @example
 * ```ts
 * import application from './app.ts'
 * await workerBuild ({
 *   ...application,
 *   assets: { dir: new URL ('./static/', import.meta.url) },
 * })
 * ```
 */
export async function workerBuild(
  config: Config,
  options: WorkerBuildOptions = {},
): Promise<WorkerBuilt> {
  const root = resolve (options.root ?? '.')
  const asked = config.outDir !== undefined
    ? config
    : { ...config, outDir: resolve (root, KIT_DIR) }
  const outDir = await chunkDir (asked)
  const devMode = developing (options.dev ?? false)
  const built = await build (
    devMode
      ? { ...asked, outDir, minify: false, routes: undefined }
      : { ...asked, outDir },
  )
  console.log (report (built))
  const laid = await stage ({
    outDir,
    to: resolve (root, 'dist'),
    assets: config.assets,
    base: config.base,
  })
  console.log (laid.assets)
  console.log (laid.record)
  return { built, assets: laid.assets, record: laid.record }
}
