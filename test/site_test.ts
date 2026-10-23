import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Params, Route, Skipped, Written } from '../src/mod.ts'
import { build, discover, report } from '../src/build/build.ts'
import { siteReport, staticSite } from '../src/build/site.ts'
import { mkdir, readText, stat, writeText } from '../src/fs/disk.ts'
import {
  data,
  endpoint,
  failed,
  json,
  layout,
  page,
  redirect,
} from '../src/mod.ts'
import { app } from '../src/node/host.ts'
import './fixture/islands/desk.ts'

import './fixture/islands/mark.ts'
import './fixture/islands/reading.ts'
import { inDir, inDirs } from './temp.ts'

type Post = { readonly id: string; readonly title: string }

const posts: readonly Post[] = [
  { id: 'first', title: 'First' },
  { id: 'second', title: 'Second' },
]

const about: Route = page ({
  pattern: '/about',
  static: true,
  head: () => ({ title: P.just ('About us') }),
  view: () => H.h1 (['About us']),
})

const home: Route = page ({
  pattern: '/',
  static: true,
  head: () => ({ title: P.just ('Home') }),
  view: () => H.h1 (['Home']),
})

const post: Route = page ({
  pattern: '/blog/[slug]',
  static: true,
  paths: () => F.resolve (P.map ((p: Post): Params => ({ slug: p.id })) (posts)),
  load: (ctx) =>
    F.resolve (data ({
      title: P.fromMaybe ('no such') (
        P.map ((p: Post) => p.title) (
          P.find ((p: Post) => p.id === ctx.params.slug) (posts),
        ),
      ),
    })),
  head: (ctx) => ({ title: P.just (ctx.data.title) }),
  view: (ctx) => H.h1 ([ctx.data.title]),
})

/**
 * A live page: it was not declared static — it will not go into the files.
 */
const live: Route = page ({
  pattern: '/live',
  head: () => ({ title: P.just ('Live') }),
  view: () => H.h1 (['Live']),
})

/**
 * An endpoint with GET — an ordinary file at its own address.
 */
const feed: Route = endpoint ({
  pattern: '/feed.json',
  static: true,
  on: { GET: () => F.resolve (json ({ posts })) },
})

/**
 * An endpoint without GET — there is nothing to write.
 */
const hook: Route = endpoint ({
  pattern: '/hook',
  static: true,
  on: { POST: () => F.resolve (redirect ('/')) },
})

/**
 * A page with a form: the page itself goes out, its POST does not.
 */
const form: Route = page ({
  pattern: '/notes',
  static: true,
  on: { POST: () => F.resolve (failed (400) ('no')) },
  head: () => ({ title: P.just ('Notes') }),
  view: () => H.form ({ method: 'post' }, [H.button (['ok'])]),
})

const chrome = layout ({
  view: (ctx) => H.div ({ class: 'shell' }, [ctx.slot]),
})

const config = {
  routes: chrome ([home, about, post, live, feed, hook, form]),
  lang: 'ru',
}

const whyOf = (skipped: readonly Skipped[], pattern: string): string =>
  P.filter ((s: Skipped) => s.pattern === pattern) (skipped)[0]?.why ?? ''

test ('kit/site — writes what declared itself static', () =>
  inDirs (async ({ out, outDir }) => {
    const done = await staticSite ({ ...config, outDir }, { out })

    const paths = P.map ((w: Written) => w.path) (done.written)
    assert.deepStrictEqual (paths, [
      '/',
      '/about',
      '/blog/first',
      '/blog/second',
      '/feed.json',
      '/notes',
      '404',
    ])

    assert.deepStrictEqual (paths.includes ('/live'), false)

    assert.deepStrictEqual (
      P.map ((w: Written) => w.file) (
        P.filter ((w: Written) => w.path === '/about') (done.written),
      ),
      ['about/index.html'],
    )
    assert.ok ((await readText (`${out}/index.html`)).includes ('<h1>Home'))
    assert.ok ((await readText (`${out}/feed.json`)).includes ('"first"'))

    assert.ok ((await readText (`${out}/blog/second/index.html`)).includes ('<h1>Second'))
    assert.ok ((await readText (`${out}/about/index.html`)).includes ('<div class="shell">'))
  }))

test ('kit/site — says what will not be in the files', () =>
  inDirs (async ({ out, outDir }) => {
    const done = await staticSite ({ ...config, outDir }, { out })

    assert.deepStrictEqual (whyOf (done.skipped, '/hook'), 'no GET')
    assert.ok ((whyOf (done.skipped, '/notes')).includes ('POST'))

    const said = siteReport (done)
    assert.ok ((said).includes ('/hook: no GET'))
    assert.ok ((said).includes ('pages: 7'))
    assert.ok ((said).includes (`written to ${out}`))
  }))

test ('kit/site — 404.html draws the app\'s own error view', () =>
  inDirs (async ({ out, outDir }) => {
    await staticSite ({
      ...config,
      outDir,
      error: (ctx) => H.h1 ([`no: ${ctx.error.status}`]),
    }, { out })

    assert.ok ((await readText (`${out}/404.html`)).includes ('no: 404'))
  }))

test ('kit/site — island chunks land beside the pages', () =>
  inDirs (async ({ out, outDir }) => {
    const done = await staticSite ({
      ...config,
      outDir,
      include: ['navigation'],
    }, { out })

    const chunk = done.beside.find ((one) => one.startsWith ('navigation-'))
    assert.deepStrictEqual (typeof chunk, 'string')
    assert.deepStrictEqual (done.beside.includes ('kit-build.json'), false)
    await stat (`${out}/_kit/${chunk}`)
  }))

test ('kit/site — built under one base, laid out under another', () =>
  inDirs (async ({ out, outDir }) => {
    await build ({ outDir, include: ['navigation'] })

    const done = await staticSite ({
      ...config,
      outDir,
      base: '/assets/',
      include: ['navigation'],
    }, { out, build: false })

    const chunk = done.beside.find ((one) => one.startsWith ('navigation-'))
    assert.deepStrictEqual (typeof chunk, 'string')
    await stat (`${out}/assets/${chunk}`)
    const found = await discover ({
      outDir,
      base: '/assets/',
      include: ['navigation'],
    })
    assert.deepStrictEqual (found.navigation, `/assets/${chunk}`)
  }))

test ('kit/site — a build weighs not only the sheet, but the scripts', () =>
  inDir (async (outDir) => {
    const built = await build ({ outDir, include: ['navigation'] })

    assert.deepStrictEqual (P.sortedKeys (built.islandBytes), P.sortedKeys (built.manifest))

    const file = built.manifest.navigation.slice ('/_kit/'.length)
    const alone = (await stat (`${outDir}/${file}`)).size
    const whole = built.islandBytes.navigation

    assert.deepStrictEqual (whole.raw > alone, true)
    assert.deepStrictEqual (whole.gzip > 0, true)
    assert.deepStrictEqual (whole.gzip < whole.raw, true)
    assert.ok ((report (built)).includes ('scripts: heaviest '))
  }))

test ('kit/site — captures without paths are an error, not silence', () =>
  inDirs (async ({ out, outDir }) => {
    const broken = page ({
      pattern: '/blog/[slug]',
      static: true,
      head: () => ({ title: P.just ('x') }),
      view: () => H.h1 (['x']),
    })

    await assert.rejects (
      () => staticSite ({ routes: [broken], outDir }, { out }),
      (error: unknown) => error instanceof Error && error.message.includes ('paths says where the addresses come from'),
    )
  }))

test ('kit/site — paths for the wrong capture is an error', () =>
  inDirs (async ({ out, outDir }) => {
    const wrong = page ({
      pattern: '/blog/[slug]',
      static: true,
      paths: () => F.resolve ([{ id: 'first' }] as readonly Params[]),
      head: () => ({ title: P.just ('x') }),
      view: () => H.h1 (['x']),
    })

    await assert.rejects (
      () => staticSite ({ routes: [wrong], outDir }, { out }),
      (error: unknown) => error instanceof Error && error.message.includes ('does not build an address'),
    )
  }))

test ('kit/site — names: flat lays a page down as a file beside the others', () =>
  inDirs (async ({ out, outDir }) => {
    const done = await staticSite ({ ...config, outDir }, { out, names: 'flat' })

    assert.deepStrictEqual (
      P.map ((w: Written) => w.file) (
        P.filter ((w: Written) => w.path === '/about') (done.written),
      ),
      ['about.html'],
    )
    assert.ok ((await readText (`${out}/about.html`)).includes ('<h1>About us'))
    assert.ok ((await readText (`${out}/index.html`)).includes ('<h1>Home'))
    await stat (`${out}/blog/first.html`)
    await stat (`${out}/feed.json`)
  }))

test ('kit/site — the assets that leave are exactly the ones served live', () =>
  inDirs (({ out, outDir }) =>
    inDir (async (assets) => {
      await mkdir (`${assets}/img`, { recursive: true })
      await writeText (`${assets}/top.txt`, 'top')
      await writeText (`${assets}/img/logo.svg`, '<svg/>')
      await writeText (`${assets}/notes.log`, 'do not serve')

      const withAssets = {
        ...config,
        outDir,
        assets: {
          dir: assets,
          serves: (name: string) => !name.endsWith ('.log'),
        },
      }
      const answer = await app ({ ...withAssets, build: false })
      const status = async (path: string): Promise<number> =>
        (await answer (new Request (`http://kit.local${path}`))).status

      const done = await staticSite (withAssets, { out, build: false })

      assert.deepStrictEqual (await status ('/static/img/logo.svg'), 200)
      assert.deepStrictEqual (done.beside.includes ('img/logo.svg'), true)
      assert.ok ((await readText (`${out}/static/img/logo.svg`)).includes ('<svg/>'))
      assert.deepStrictEqual (done.beside.includes ('top.txt'), true)
      assert.deepStrictEqual (await status ('/static/notes.log'), 404)
      assert.deepStrictEqual (done.beside.includes ('notes.log'), false)
      await assert.rejects (() => stat (`${out}/static/notes.log`))
    }),
  ))
