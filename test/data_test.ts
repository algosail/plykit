import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Route } from '../src/mod.ts'
import { build, report } from '../src/build/build.ts'
import { stat } from '../src/fs/disk.ts'
import { DATA, data, layout, page, prepare } from '../src/mod.ts'
import { app, serve } from '../src/node/host.ts'
import './fixture/islands/desk.ts'

import './fixture/islands/mark.ts'
import './fixture/islands/reading.ts'
import { inDir } from './temp.ts'

let reads = 0

type Who = { readonly who: string }

const posts = [{ id: 'first', title: 'First' }, {
  id: 'second',
  title: 'Second',
}]

/**
 * Reads "slowly" and counts how many times it was called.
 */
const post: Route<Who> = page<{ title: string }, Who> ({
  pattern: '/blog/:slug',
  static: true,
  paths: () => F.resolve (P.map ((p: { id: string }) => ({ slug: p.id })) (posts)),
  load: (ctx) => {
    reads += 1
    return F.resolve (data ({
      title: posts.find ((p) => p.id === ctx.params.slug)?.title ?? 'none',
    }))
  },
  head: (ctx) => ({ title: P.just (ctx.data.title) }),
  view: (ctx) => H.h1 ([`${ctx.data.title} for ${ctx.state.who}`]),
})

const chrome = layout<{ menu: string }, Who> ({
  load: () => F.resolve (data ({ menu: 'menu' })),
  view: (ctx) => H.div ({ class: 'shell' }, [ctx.data.menu, ctx.slot]),
})

const config = {
  routes: chrome ([post]),
  state: (request: Request) =>
    F.resolve ({
      who: new URL (request.url).searchParams.get ('who') ?? 'guest',
    }),
}

test ('kit/data — prepare reads by address, once for each paths', async () => {
  reads = 0
  const ready = await prepare (config.routes, config)

  assert.deepStrictEqual (Object.keys (ready.data).sort (), ['/blog/first', '/blog/second'])
  assert.deepStrictEqual (ready.data['/blog/second'], { title: 'Second' })
  assert.deepStrictEqual (ready.routes, ['/blog/:slug'])
  assert.deepStrictEqual (ready.refused, [])
  assert.deepStrictEqual (reads, 2)
})

test ('kit/data — the server answers from what was prepared, and load is not called again', () =>
  inDir (async (outDir) => {
    reads = 0
    const built = await build ({ ...config, outDir })
    assert.deepStrictEqual (reads, 2)
    assert.ok ((report (built)).includes ('data: 2 addresses from 1 routes'))

    reads = 0
    const answer = await serve ({ ...config, outDir })
    const res = await answer (new Request ('http://kit.test/blog/first?who=anya'))
    const html = await res.text ()

    assert.ok ((html).includes ('First for anya'))
    assert.ok ((html).includes ('<div class="shell">menu'))
    assert.deepStrictEqual (reads, 0)
  }))

test ('kit/data — addresses outside paths go to a live load', () =>
  inDir (async (outDir) => {
    await build ({ ...config, outDir })

    reads = 0
    const answer = await serve ({ ...config, outDir })
    const res = await answer (new Request ('http://kit.test/blog/third'))
    assert.ok ((await res.text ()).includes ('none for guest'))
    assert.deepStrictEqual (reads, 1)
  }))

test ('kit/data — prebuilt: false puts everything back on the live path', () =>
  inDir (async (outDir) => {
    await build ({ ...config, outDir })

    reads = 0
    const answer = await app ({
      ...config,
      outDir,
      build: false,
      prebuilt: false,
    })
    await (await answer (new Request ('http://kit.test/blog/first'))).text ()
    assert.deepStrictEqual (reads, 1)
  }))

test ('kit/data — without routes a build reads nothing', () =>
  inDir (async (outDir) => {
    reads = 0
    const built = await build ({ outDir })

    assert.deepStrictEqual (reads, 0)
    assert.deepStrictEqual (built.data.tag, 'nothing')
    assert.deepStrictEqual (report (built).includes ('data:'), false)
  }))

test ('kit/data — a build without routes removes the previous build\'s data', () =>
  inDir (async (outDir) => {
    await build ({ ...config, outDir })
    await stat (`${outDir}/${DATA}`)

    reads = 0
    const answer = await app ({ ...config, outDir })
    await assert.rejects (() => stat (`${outDir}/${DATA}`))

    const res = await answer (new Request ('http://kit.test/blog/first?who=anya'))
    assert.ok ((await res.text ()).includes ('First for anya'))
    assert.deepStrictEqual (reads, 1)
  }))
