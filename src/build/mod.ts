/** Island compiler. Writes `.kit`. Does not know about Wrangler or `dist/`. */
export { KIT_DIR, build, chunkDir, discover, PUBLIC_PREFIX, report } from './build.ts'
export type {
  Built,
  Inlined,
  KitIsland,
  Manifest,
  Options as BuildOptions,
  Where,
} from './build.ts'

/** `kit-data.json` left in that directory. */
export { readPrebuilt } from './read.ts'

/**
 * Copies a finished `.kit` into the worker directory: `dist/assets`, `_headers`, `record.json`.
 * Does not deploy.
 */
export { stage } from '../workers/stage.ts'
export type { StageOptions, Staged } from '../workers/stage.ts'

/**
 * What `npm run build` calls. Wrangler then bundles the application's `worker.ts`.
 * Calls `build`, then `stage`. Does not read `wrangler.jsonc` or write the entry.
 */
export { workerBuild } from '../workers/build.ts'
export type { WorkerBuildOptions, WorkerBuilt } from '../workers/build.ts'

/** HTML pages in a directory. Not a Worker. */
export { siteReport, staticSite } from './site.ts'
export type { Site, SiteOptions, Skipped, Written } from './site.ts'
