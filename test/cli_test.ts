import type { ChildProcess } from 'node:child_process'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { readText, writeText } from '../src/disk.ts'
import { inDir } from './temp.ts'

const kit = resolve (import.meta.dirname, '..')
const cli = resolve (kit, 'src/cli.ts')
const pageFrom = pathToFileURL (resolve (kit, 'src/router.ts')).href
const hFrom = import.meta.resolve ('@algosail/plydom/h')

const appSource = `import { page } from ${JSON.stringify (pageFrom)}
import * as H from ${JSON.stringify (hFrom)}

export default {
  routes: [
    page({ pattern: '/', view: () => H.p(['hello']) }),
  ],
}
`

type Done = {
  readonly code: number | null
  readonly out: string
  readonly err: string
}

const finished = (
  cwd: string,
  args: readonly string[],
): Promise<Done> =>
  new Promise ((resolvePromise, reject) => {
    const child = spawn (process.execPath, [cli, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const outStream = child.stdout
    const errStream = child.stderr
    if (outStream === null || errStream === null) {
      reject (new Error ('plykit: no pipes'))
      return
    }
    let out = ''
    let err = ''
    const timer = setTimeout (() => {
      child.kill ('SIGKILL')
      reject (new Error (`plykit ${args.join (' ')} did not finish\n${out}\n${err}`))
    }, 20_000)
    outStream.setEncoding ('utf8')
    errStream.setEncoding ('utf8')
    outStream.on ('data', (chunk: string) => {
      out += chunk
    })
    errStream.on ('data', (chunk: string) => {
      err += chunk
    })
    child.once ('error', (error) => {
      clearTimeout (timer)
      reject (error)
    })
    child.once ('close', (code) => {
      clearTimeout (timer)
      resolvePromise ({ code, out, err })
    })
  })

type Running = {
  readonly url: string
  readonly stop: () => Promise<void>
}

const untilUrl = (
  cwd: string,
  args: readonly string[],
): Promise<Running> =>
  new Promise ((resolvePromise, reject) => {
    const child: ChildProcess = spawn (process.execPath, [cli, ...args], {
      cwd,
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const outStream = child.stdout
    const errStream = child.stderr
    if (outStream === null || errStream === null) {
      reject (new Error ('plykit: no pipes'))
      return
    }
    let out = ''
    let err = ''
    let settled = false
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      clearTimeout (timer)
      child.kill ('SIGKILL')
      reject (error)
    }
    const timer = setTimeout (() => {
      fail (new Error (`plykit ${args.join (' ')} did not open a port\n${out}\n${err}`))
    }, 25_000)
    const stop = (): Promise<void> =>
      new Promise ((done) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          done ()
          return
        }
        const force = setTimeout (() => child.kill ('SIGKILL'), 2_000)
        child.once ('close', () => {
          clearTimeout (force)
          done ()
        })
        child.kill ()
      })
    outStream.setEncoding ('utf8')
    errStream.setEncoding ('utf8')
    outStream.on ('data', (chunk: string) => {
      out += chunk
      const found = out.match (/http:\/\/localhost:\d+/)
      if (found === null || settled) return
      settled = true
      clearTimeout (timer)
      resolvePromise ({ url: found[0], stop })
    })
    errStream.on ('data', (chunk: string) => {
      err += chunk
    })
    child.once ('error', (error) => fail (error))
    child.once ('close', (code) => {
      fail (new Error (`plykit ${args.join (' ')} exited with ${code}\n${out}\n${err}`))
    })
  })

const writeApp = (dir: string): Promise<void> =>
  writeText (`${dir}/app.ts`, appSource)

const missing = async (file: string): Promise<boolean> => {
  try {
    await access (file)
    return false
  } catch {
    return true
  }
}

test ('plykit with no command prints help and exits with an error', () =>
  inDir (async (dir) => {
    const none = await finished (dir, [])
    assert.deepStrictEqual (none.code, 1, none.err)
    assert.ok ((none.out).includes ('plykit dev'))
    const help = await finished (dir, ['--help'])
    assert.deepStrictEqual (help.code, 0, help.err)
    assert.ok ((help.out).includes ('plykit build'))
    assert.ok ((help.out).includes ('--target workers|node|static'))
    const unknown = await finished (dir, ['nope'])
    assert.deepStrictEqual (unknown.code, 1, unknown.err)
    assert.ok ((unknown.out).includes ('plykit preview'))
  }))

test ('plykit build writes the worker and does not overwrite someone else\'s wrangler.jsonc', () =>
  inDir (async (dir) => {
    await writeApp (dir)
    const first = await finished (dir, ['build', '--app', 'app.ts', '--name', 'room'])
    assert.deepStrictEqual (first.code, 0, `${first.err}\n${first.out}`)
    const wrangler = await readText (`${dir}/wrangler.jsonc`)
    assert.ok ((wrangler).includes ('"name": "room"'))
    assert.ok ((wrangler).includes ('"main": "./dist/worker.ts"'))
    assert.deepStrictEqual (wrangler.includes ('KitLive'), false)
    const worker = await readText (`${dir}/dist/worker.ts`)
    assert.ok ((worker).includes ("from '@algosail/plykit/workers'"))
    assert.ok ((worker).includes ('app.ts'))
    assert.ok ((worker).includes ("from './record.json'"))
    assert.deepStrictEqual (worker.includes ('KitLive'), false)
    assert.deepStrictEqual (worker.includes ('node:fs'), false)
    assert.deepStrictEqual (worker.includes ("from './build"), false)
    const record = JSON.parse (await readText (`${dir}/dist/record.json`)) as {
      manifest: unknown
    }
    assert.deepStrictEqual (typeof record.manifest, 'object')
    const again = await finished (dir, ['build', '--name', 'other'])
    assert.deepStrictEqual (again.code, 0, `${again.err}\n${again.out}`)
    assert.ok ((again.out).includes ('wrangler.jsonc left in place. main: ./dist/worker.ts'))
    assert.deepStrictEqual (await readText (`${dir}/wrangler.jsonc`), wrangler)
    const named = await finished (dir, ['build', '--target', 'workers'])
    assert.deepStrictEqual (named.code, 0, `${named.err}\n${named.out}`)
    assert.ok ((named.out).includes ('dist/worker.ts'))
    assert.deepStrictEqual (await readText (`${dir}/wrangler.jsonc`), wrangler)
  }))

test ('plykit build --target node writes the server and leaves wrangler.jsonc alone', () =>
  inDir (async (dir) => {
    await writeApp (dir)
    const node = await finished (dir, ['build', '--target', 'node', '--name', 'room'])
    assert.deepStrictEqual (node.code, 0, `${node.err}\n${node.out}`)
    assert.ok ((node.out).includes ('dist/server.ts'))
    assert.deepStrictEqual (node.out.includes ('wrangler.jsonc'), false)
    assert.deepStrictEqual (await missing (`${dir}/wrangler.jsonc`), true)
    assert.deepStrictEqual (await missing (`${dir}/dist/worker.ts`), true)
    const server = await readText (`${dir}/dist/server.ts`)
    assert.ok ((server).includes ("from '@algosail/plykit/node'"))
    assert.ok ((server).includes ('listen(await serve(config))'))
    assert.ok ((server).includes ('app.ts'))
    assert.ok ((server).includes ("outDir: '.kit'"))
    assert.deepStrictEqual (server.includes ('@algosail/plykit/workers'), false)
    const record = JSON.parse (await readText (`${dir}/dist/record.json`)) as {
      manifest: unknown
    }
    assert.deepStrictEqual (typeof record.manifest, 'object')

    const worker = await finished (dir, ['build', '--target', 'workers', '--name', 'room'])
    assert.deepStrictEqual (worker.code, 0, `${worker.err}\n${worker.out}`)
    const wrangler = await readText (`${dir}/wrangler.jsonc`)
    const again = await finished (dir, ['build', '--target', 'node'])
    assert.deepStrictEqual (again.code, 0, `${again.err}\n${again.out}`)
    assert.deepStrictEqual (again.out.includes ('wrangler.jsonc'), false)
    assert.deepStrictEqual (await readText (`${dir}/wrangler.jsonc`), wrangler)
    assert.ok ((await readText (`${dir}/dist/worker.ts`)).includes ('worker(application'))
    assert.ok ((await readText (`${dir}/dist/server.ts`)).includes ('serve(config)'))
  }))

test ('plykit build --target static writes pages and does not write a server entry', () =>
  inDir (async (dir) => {
    await writeText (`${dir}/app.ts`, appSource.replace (
      'page({ pattern:',
      'page({ static: true, pattern:',
    ))
    const built = await finished (dir, ['build', '--target', 'static'])
    assert.deepStrictEqual (built.code, 0, `${built.err}\n${built.out}`)
    assert.ok ((built.out).includes ('pages:'))
    assert.ok ((await readText (`${dir}/dist/index.html`)).includes ('hello'))
    assert.deepStrictEqual ((await readText (`${dir}/dist/404.html`)).length > 0, true)
    assert.deepStrictEqual (await missing (`${dir}/dist/worker.ts`), true)
    assert.deepStrictEqual (await missing (`${dir}/dist/server.ts`), true)
    assert.deepStrictEqual (await missing (`${dir}/dist/record.json`), true)
    assert.deepStrictEqual (await missing (`${dir}/wrangler.jsonc`), true)
  }))

test ('plykit build with an unknown target prints help', () =>
  inDir (async (dir) => {
    const bad = await finished (dir, ['build', '--target', 'deno'])
    assert.deepStrictEqual (bad.code, 1, bad.err)
    assert.ok ((bad.out).includes ('--target workers|node|static'))
    assert.deepStrictEqual (await missing (`${dir}/app.ts`), true)
  }))

test ('plykit preview serves the built page', { timeout: 50_000 }, () =>
  inDir (async (dir) => {
    await writeApp (dir)
    const built = await finished (dir, ['build', '--name', 'room'])
    assert.deepStrictEqual (built.code, 0, `${built.err}\n${built.out}`)
    const running = await untilUrl (dir, ['preview'])
    try {
      assert.deepStrictEqual (running.url.endsWith (':0'), false)
      const response = await fetch (`${running.url}/`)
      assert.deepStrictEqual (response.status, 200)
      assert.ok ((await response.text ()).includes ('hello'))
    } finally {
      await running.stop ()
    }
  }))

test ('plykit dev serves the page on the port it was given', { timeout: 40_000 }, () =>
  inDir (async (dir) => {
    await writeApp (dir)
    const running = await untilUrl (dir, ['dev'])
    try {
      assert.deepStrictEqual (running.url.endsWith (':0'), false)
      const response = await fetch (`${running.url}/`)
      assert.deepStrictEqual (response.status, 200)
      assert.ok ((await response.text ()).includes ('hello'))
    } finally {
      await running.stop ()
    }
  }))
