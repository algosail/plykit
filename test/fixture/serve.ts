import { dev, listen } from '../../src/nodejs.ts'
import application from './app.ts'

/**
 * Opens the room on this process. Calling it is the effect.
 * @example
 * ```ts
 * // serve :: () -> !Promise Undefined
 * await serve ()
 * ```
 */
export const serve = async (): Promise<void> => {
  await listen (await dev (application))
}

await serve ()
