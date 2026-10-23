import * as H from '@algosail/plydom/h'
import assert from 'node:assert/strict'
import { access, utimes } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import type { Config } from '../src/app/config.ts'
import { page } from '../src/app/router.ts'
import { mkdir, readText, stat, writeText } from '../src/fs/disk.ts'
import { developing, workerBuild } from '../src/workers/build.ts'
import { inDir } from './temp.ts'

const kit = resolve (import.meta.dirname, '..')
const pageFrom = pathToFileURL (resolve (kit, 'src/app/router.ts')).href
const dataFrom = pathToFileURL (resolve (kit, 'src/app/reply.ts')).href
const islandFrom = pathToFileURL (resolve (kit, 'src/islands/island.ts')).href
const hFrom = import.meta.resolve ('@algosail/plydom/h')
const futureFrom = import.meta.resolve ('@algosail/plyfuture')

const hello = (): Config => ({
  routes: [
    page ({ pattern: '/', view: () => H.p (['hello']) }),
  ],
})

const missing = async (file: string): Promise<boolean> => {
  try {
    await access (file)
    return false
  } catch {
    return true
  }
}

const mtimeOf = async (file: string): Promise<number> => {
  const when = (await stat (file)).mtime
  assert.ok (when !== null)
  return when.getTime ()
}

const withCommand = async (
  command: string | undefined,
  run: () => Promise<void>,
): Promise<void> => {
  const previous = process.env.WRANGLER_COMMAND
  if (command === undefined) delete process.env.WRANGLER_COMMAND
  else process.env.WRANGLER_COMMAND = command
  try {
    await run ()
  } finally {
    if (previous === undefined) delete process.env.WRANGLER_COMMAND
    else process.env.WRANGLER_COMMAND = previous
  }
}

test ('kit/workerBuild — dev and types are the unminified build', () => {
  assert.deepStrictEqual (developing (false, 'dev'), true)
  assert.deepStrictEqual (developing (false, 'types'), true)
  assert.deepStrictEqual (developing (false, 'deploy'), false)
  assert.deepStrictEqual (developing (false, 'versions upload'), false)
  assert.deepStrictEqual (developing (true, 'deploy'), true)
})

test ('kit/workerBuild — writes the record and does not create the entry', () =>
  inDir (async (dir) => {
    await workerBuild (hello (), { root: dir })
    assert.deepStrictEqual (await missing (`${dir}/wrangler.jsonc`), true)
    assert.deepStrictEqual (await missing (`${dir}/worker.ts`), true)
    assert.deepStrictEqual (await missing (`${dir}/dist/worker.ts`), true)
    const record = JSON.parse (await readText (`${dir}/dist/record.json`)) as {
      manifest: unknown
      files: unknown
    }
    assert.deepStrictEqual (typeof record.manifest, 'object')
    assert.deepStrictEqual (record.files, null)
  }))

test ('kit/workerBuild — leaves an existing wrangler.jsonc byte for byte', () =>
  inDir (async (dir) => {
    const before = `// keep this note
{
  "name": "room",
  "main": "./worker.ts",
  "d1_databases": [{ "binding": "DB", "database_name": "room" }],
  "build": { "command": "npm run build" }
}
`
    await writeText (`${dir}/wrangler.jsonc`, before)
    await workerBuild (hello (), { root: dir })
    assert.deepStrictEqual (await readText (`${dir}/wrangler.jsonc`), before)
  }))

test ('kit/workerBuild — a static directory is copied, and the same bytes keep their mtime', () =>
  inDir (async (dir) => {
    await mkdir (`${dir}/static`)
    await writeText (`${dir}/static/lamp.svg`, '<svg/>')
    const application: Config = {
      ...hello (),
      assets: { dir: `${dir}/static` },
    }
    await workerBuild (application, { root: dir })
    assert.deepStrictEqual (await readText (`${dir}/dist/assets/static/lamp.svg`), '<svg/>')
    const record = JSON.parse (await readText (`${dir}/dist/record.json`)) as { files: unknown }
    assert.deepStrictEqual (record.files, '/static/')

    const old = new Date ('2020-01-01T00:00:00Z')
    const written = `${dir}/dist/record.json`
    const lamp = `${dir}/dist/assets/static/lamp.svg`
    await utimes (written, old, old)
    await utimes (lamp, old, old)
    await workerBuild (application, { root: dir })
    const aged = old.getTime ()
    assert.deepStrictEqual (await mtimeOf (written), aged)
    assert.deepStrictEqual (await mtimeOf (lamp), aged)

    await writeText (`${dir}/static/lamp.svg`, '<svg id="n"/>')
    await workerBuild (application, { root: dir })
    assert.deepStrictEqual (await readText (lamp), '<svg id="n"/>')
    assert.deepStrictEqual (await mtimeOf (lamp) === aged, false)
    assert.deepStrictEqual (await mtimeOf (written), aged)
  }))

const deskSource = `import * as H from ${JSON.stringify (hFrom)}
import { island } from ${JSON.stringify (islandFrom)}

const keptOnPurpose = (n: number): string => String (n + 1)

export const mark = island (
  'mark',
  (props: { n: number }) => H.p ([keptOnPurpose (props.n)]),
  import.meta.url,
)
`

const staticApp = `import { data } from ${JSON.stringify (dataFrom)}
import { page } from ${JSON.stringify (pageFrom)}
import * as F from ${JSON.stringify (futureFrom)}
import * as H from ${JSON.stringify (hFrom)}
import { mark } from './desk.ts'

export default {
  routes: [
    page ({
      static: true,
      pattern: '/',
      load: () => F.resolve (data ({ n: 1 })),
      view: () => H.p ([mark ({ n: 1 }), 'hello']),
    }),
  ],
}
`

type BuiltRecord = {
  readonly manifest: { readonly mark?: string }
  readonly files: string | null
  readonly data: unknown
}

const chunkText = async (dir: string, record: BuiltRecord): Promise<string> => {
  const address = record.manifest.mark
  assert.ok (address !== undefined)
  return readText (`${dir}/dist/assets${address}`)
}

test ('kit/workerBuild — wrangler dev skips minify and static data', { timeout: 40_000 }, () =>
  inDir (async (dir) => {
    await writeText (`${dir}/desk.ts`, deskSource)
    await writeText (`${dir}/app.ts`, staticApp)
    const loaded = await import (pathToFileURL (resolve (dir, 'app.ts')).href) as {
      default: Config
    }
    const application = loaded.default

    await withCommand ('', async () => {
      await workerBuild (application, { root: dir })
    })
    const frozen = JSON.parse (await readText (`${dir}/dist/record.json`)) as BuiltRecord
    assert.deepStrictEqual (frozen.data, { '/': { n: 1 } })
    assert.deepStrictEqual (frozen.files, null)
    assert.deepStrictEqual ((await chunkText (dir, frozen)).includes ('keptOnPurpose'), false)

    await withCommand ('dev', async () => {
      await workerBuild (application, { root: dir })
    })
    const live = JSON.parse (await readText (`${dir}/dist/record.json`)) as BuiltRecord
    assert.deepStrictEqual (live.data, null)
    assert.ok ((await chunkText (dir, live)).includes ('keptOnPurpose'))

    await withCommand ('deploy', async () => {
      await workerBuild (application, { root: dir, dev: true })
    })
    const again = JSON.parse (await readText (`${dir}/dist/record.json`)) as BuiltRecord
    assert.deepStrictEqual (again.data, null)
    assert.ok ((await chunkText (dir, again)).includes ('keptOnPurpose'))
  }))
