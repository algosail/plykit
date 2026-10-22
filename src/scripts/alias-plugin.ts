import type { Plugin } from 'esbuild'
import { fileURLToPath } from 'node:url'

/**
 * Resolves `file://` imports to paths esbuild can read.
 * @example
 * ```ts
 * esbuild.build ({ plugins: [aliasPlugin ()] })
 * ```
 */
export const aliasPlugin = (): Plugin => ({
  name: 'file-url',
  setup(build) {
    build.onResolve ({ filter: /^file:\/\// }, (args) => ({
      path: fileURLToPath (args.path),
    }))
  },
})
