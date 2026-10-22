#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Config } from './app.ts'
import type { KitIsland } from './build.ts'
import { dev, serve } from './app.ts'
import { build, chunkDir, report } from './build.ts'
import { writeText } from './disk.ts'
import { listen } from './listen.ts'
import { publish, wranglerConfig } from './publish.ts'
import { siteReport, staticSite } from './site.ts'

const usage = [
  'plykit dev [--app app.ts]',
  'plykit build [--app app.ts] [--target workers|node|static] [--name name]',
  'plykit preview [--app app.ts]',
].join ('\n')

type Target = 'workers' | 'node' | 'static'

type Flags = {
  readonly command: string
  readonly app: string
  readonly target: string | undefined
  readonly name: string | undefined
}

const take = (args: readonly string[], name: string): string | undefined => {
  const at = args.indexOf (name)
  const value = at < 0 ? undefined : args[at + 1]
  return value === undefined || value.startsWith ('--') ? undefined : value
}

const readFlags = (argv: readonly string[]): Flags => ({
  command: argv[0]?.startsWith ('--') ? '' : (argv[0] ?? ''),
  app: take (argv, '--app') ?? 'app.ts',
  target: take (argv, '--target'),
  name: take (argv, '--name'),
})

const targetOf = (asked: string | undefined): Target | undefined => {
  if (asked === undefined || asked === 'workers') return 'workers'
  if (asked === 'node' || asked === 'static') return asked
  return undefined
}

const isConfig = (value: unknown): value is Config =>
  typeof value === 'object' && value !== null && 'routes' in value

const loading = async (file: string): Promise<Config> => {
  const loaded = await import (pathToFileURL (resolve (file)).href) as {
    default?: unknown
  }
  if (!isConfig (loaded.default)) {
    throw new Error (`plykit: ${file} must default-export the app config`)
  }
  return loaded.default
}

const nameOf = async (asked: string | undefined): Promise<string> => {
  if (asked !== undefined) return asked
  try {
    const parsed = JSON.parse (await readFile ('package.json', 'utf8')) as {
      name?: string
    }
    return parsed.name ?? 'kit'
  } catch {
    return 'kit'
  }
}

const settled = (config: Config): Config =>
  config.outDir !== undefined || config.assets !== undefined
    ? config
    : { ...config, outDir: 'dist/chunks' }

const devCommand = async (config: Config): Promise<void> => {
  const running = await listen (await dev (settled (config)))
  console.log (`http://localhost:${running.port}`)
}

const wantsLive = (include: readonly KitIsland[] | undefined): boolean =>
  include?.includes ('live') ?? false

const fromHere = (appFile: string): string => {
  const rel = relative (resolve ('dist'), resolve (appFile))
  return rel.startsWith ('.') ? rel : `./${rel}`
}

const workerSource = (appFile: string, live: boolean): string => {
  const imported = live
    ? "import { KitLive, worker } from '@algosail/plykit/workers'"
    : "import { worker } from '@algosail/plykit/workers'"
  const exposed = live ? 'export { KitLive }\n' : ''
  return `${imported}
import application from ${JSON.stringify (fromHere (appFile))}
import record from './record.json' with { type: 'json' }

${exposed}export default worker(application, { record })
`
}

const serverSource = (appFile: string): string =>
  `import { listen, serve } from '@algosail/plykit/node'
import application from ${JSON.stringify (fromHere (appFile))}

const config =
  application.outDir !== undefined || application.assets !== undefined
    ? application
    : { ...application, outDir: 'dist/chunks' }

const running = await listen(await serve(config))
console.log('http://localhost:' + running.port)
`

const writeWorker = async (
  appFile: string,
  name: string,
  live: boolean,
): Promise<void> => {
  await writeText ('dist/worker.ts', workerSource (appFile, live))
  try {
    await access ('wrangler.jsonc')
    console.log ('wrangler.jsonc left in place. main: ./dist/worker.ts')
  } catch {
    await writeText ('wrangler.jsonc', wranglerConfig ({
      name,
      main: './dist/worker.ts',
      assets: './dist/assets',
      live,
    }))
  }
}

const writeNode = async (appFile: string): Promise<void> => {
  await writeText ('dist/server.ts', serverSource (appFile))
}

const writeStatic = async (config: Config): Promise<void> => {
  console.log (siteReport (await staticSite (config, {
    out: resolve ('dist'),
    build: false,
  })))
}

const buildCommand = async (
  config: Config,
  target: Target,
  name: string,
  appFile: string,
): Promise<void> => {
  const asked = settled (config)
  const outDir = await chunkDir (asked)
  const built = await build ({ ...asked, outDir })
  console.log (report (built))
  if (target === 'static') return writeStatic (asked)
  const laid = await publish ({
    outDir,
    to: resolve ('dist'),
    assets: config.assets,
    base: config.base,
  })
  if (target === 'node') await writeNode (appFile)
  else await writeWorker (appFile, name, wantsLive (config.include))
  console.log (laid.assets)
  console.log (laid.record)
  console.log (target === 'node' ? 'dist/server.ts' : 'dist/worker.ts')
}

const previewCommand = async (config: Config): Promise<void> => {
  const running = await listen (await serve (settled (config)))
  console.log (`http://localhost:${running.port}`)
}

const main = async (): Promise<void> => {
  const argv = process.argv.slice (2)
  if (argv.length === 0 || argv[0] === '--help') {
    console.log (usage)
    if (argv.length === 0) process.exitCode = 1
    return
  }
  const flags = readFlags (argv)
  if (flags.command === '') {
    console.log (usage)
    process.exitCode = 1
    return
  }
  if (
    flags.command !== 'dev' &&
    flags.command !== 'build' &&
    flags.command !== 'preview'
  ) {
    console.log (usage)
    process.exitCode = 1
    return
  }
  if (flags.command === 'build') {
    const target = targetOf (flags.target)
    if (target === undefined) {
      console.log (usage)
      process.exitCode = 1
      return
    }
    const config = await loading (flags.app)
    const name = target === 'workers' ? await nameOf (flags.name) : ''
    return buildCommand (config, target, name, flags.app)
  }
  const config = await loading (flags.app)
  if (flags.command === 'dev') return devCommand (config)
  return previewCommand (config)
}

await main ()
