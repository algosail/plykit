import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Config, Loaded, Route } from '../src/mod.ts'
import type { State } from './fixture/app.ts'
import { build, discover, report } from '../src/build/build.ts'
import { readText, writeText } from '../src/fs/disk.ts'
import {
  collectStyles,
  data,
  endpoint,
  failed,
  handler,
  json,
  layout,
  page,
  redirect,
  ROOT_ID,
  text,
  withHeader,
} from '../src/mod.ts'
import { app, dev, serve } from '../src/node/host.ts'
import { error, routes, state } from './fixture/app.ts'
import { theme } from './fixture/ui/theme.ts'
import { inDir, inDirs } from './temp.ts'

const chunkOf = (manifest: Record<string, string>) => (name: string): string =>
  manifest[name].split ('/').at (-1)!

await discover ({ include: ['navigation', 'live'] })

const bare = handler ({ routes, state })
const respond = handler ({ routes, error, state })

/**
 * Asks for a page and takes the root markup out of it.
 */
const request = async (
  path: string,
): Promise<{ status: number; html: string; body: string }> => {
  const res = await respond (new Request (`http://kit.test${path}`))
  const html = await res.text ()
  const open = `<div id="${ROOT_ID}">`
  const from = html.indexOf (open) + open.length
  return {
    status: res.status,
    html,
    body: html.slice (from, html.lastIndexOf ('</div>')),
  }
}

test ('kit/server — renders a page with its layout and its title', async () => {
  const { status, html, body } = await request ('/')
  assert.deepStrictEqual (status, 200)
  assert.ok ((html).includes ('<title>Reading Room</title>'))
  assert.ok ((body).includes (`<div class="${theme.page}">`))
  assert.ok ((body).includes ('<h1>Reading Room</h1>'))
  assert.ok ((body).includes ('<h2>Shelves</h2>'))
  assert.ok ((body).includes ('<h2>Latest notes</h2>'))
  assert.ok ((body).includes ('read it again and still did not understand'))
  assert.deepStrictEqual (body.includes ('nothing in the margins yet'), false)
  assert.ok ((body).includes ('<a href="/shelf/fantastika">Science fiction · 2</a>'))
  assert.ok ((body).includes ('<a href="/shelf/proza">Prose · 1</a>'))
})

test ('kit/server — the margins feed lists a note even when few exist', async () => {
  const res = await respond (new Request ('http://kit.test/feed.xml'))
  const xml = await res.text ()
  assert.deepStrictEqual (res.status, 200)
  assert.ok ((xml).includes ('read it again and still did not understand'))
})

test ('kit/server — a route param reaches load', async () => {
  const { status, body, html } = await request ('/book/solaris')
  assert.deepStrictEqual (status, 200)
  assert.ok ((html).includes ('<title>Solaris</title>'))
  assert.ok ((body).includes ('About an ocean that answers'))
})

test ('kit/server — the head gets the same context as the view', async () => {
  const { html } = await request ('/book/solaris')
  assert.ok ((html).includes ('<title>Solaris</title>'))
  assert.ok ((html).includes ('<meta property="og:url" content="http://kit.test/book/solaris">'))
})

test ('kit/server — the head sees both the captures and the state', async () => {
  const seen: string[] = []
  const spy: Route<State> = page ({
    pattern: '/head/[slug]',
    load: () => F.resolve (data ({})),
    head: (ctx) => {
      seen.push (
        `${ctx.params.slug} ${ctx.routeId} ${
          ctx.state.reader.tag === 'just' ? 'someone' : 'nobody'
        }`,
      )
      return { title: P.just (ctx.params.slug), meta: [] }
    },
    view: () => H.p (['—']),
  })
  const res = await handler ({ routes: [spy], state }) (
    new Request ('http://kit.test/head/one'),
  )
  assert.ok ((await res.text ()).includes ('<title>one</title>'))
  assert.deepStrictEqual (seen, ['one /head/[slug] nobody'])
})

test ('kit/server — without its own error view kit draws a bare one', async () => {
  const res = await bare (new Request ('http://kit.test/nope'))
  const html = await res.text ()
  assert.deepStrictEqual (res.status, 404)
  assert.ok ((html).includes ('<h1>404</h1>'))
  assert.ok ((html).includes ('no route matches /nope'))
  assert.deepStrictEqual (html.includes (theme.page), false)
})

test ('kit/server — its own error view covers both a 404 and a refusal from load', async () => {
  const nope = await request ('/nope')
  assert.deepStrictEqual (nope.status, 404)
  assert.ok ((nope.body).includes (`<div class="${theme.page}">`))
  assert.ok ((nope.body).includes ('<a href="/about">About the reading room</a>'))
  assert.deepStrictEqual (nope.body.includes ('/shelf/'), false)

  const missing = await request ('/book/missing')
  assert.deepStrictEqual (missing.status, 404)
  assert.ok ((missing.html).includes ('no book missing'))
  assert.ok ((missing.body).includes (`<div class="${theme.page}">`))
})

test ('kit/server — a deferred load: both a refusal and a throw', async () => {
  const late = (after: () => Loaded<Record<string, never>>): Route =>
    page<Record<string, never>> ({
      pattern: '/late',
      load: () =>
        P.chain ((_done: void) => F.resolve (after ())) (
          F.after (0)<unknown, void> (undefined),
        ),
      view: () => H.p (['it arrived']),
    })

  const refused = await handler ({
    routes: [late (() => failed (503) ('the source is silent'))],
  }) (new Request ('http://kit.test/late'))
  assert.deepStrictEqual (refused.status, 503)
  assert.ok ((await refused.text ()).includes ('the source is silent'))

  const thrown = await handler ({
    routes: [late (() => {
      throw new Error ('it broke off')
    })],
  }) (new Request ('http://kit.test/late'))
  assert.deepStrictEqual (thrown.status, 500)
  assert.ok ((await thrown.text ()).includes ('it broke off'))
})

test ('kit/server — a redirect answers with Location and no body', async () => {
  const away: Route = page<Record<string, never>> ({
    pattern: '/old',
    load: () => F.resolve (redirect ('/about', 302)),
    view: () => H.p (['should not be drawn']),
  })
  const res = await handler ({ routes: [...routes, away], state }) (
    new Request ('http://kit.test/old'),
  )
  assert.deepStrictEqual (res.status, 302)
  assert.deepStrictEqual (res.headers.get ('location'), '/about')
  await res.body?.cancel ()
})

test ('kit/build — styles leave as a file named from its own contents', () =>
  inDir (async (outDir) => {
    const built = await build ({
      outDir,
    })

    assert.deepStrictEqual (
      /^\/_kit\/styles-[A-Za-z0-9_-]{8}\.css$/.test (built.styles ?? ''),
      true,
    )
    const name = (built.styles ?? '').slice ('/_kit/'.length)
    const text = await readText (`${outDir}/${name}`)
    assert.ok ((text).includes ('.page_'))
    assert.deepStrictEqual (text.includes ('data-kit'), false)
    assert.deepStrictEqual (built.files.includes (name), true)

    assert.deepStrictEqual (built.styleBytes.raw, new TextEncoder ().encode (text).length)
    assert.deepStrictEqual (built.styleBytes.gzip > 0, true)
    assert.deepStrictEqual (built.styleBytes.gzip < built.styleBytes.raw, true)
    assert.deepStrictEqual (built.styleIds.length > 0, true)

    const again = await build ({
      outDir,
    })
    assert.deepStrictEqual (again.styles, built.styles)
  }))

test ('kit/app — a page links the styles and does not carry them', () =>
  inDir (async (outDir) => {
    const serve = await app ({
      routes,
      error,
      state,
      outDir,
    })

    const res = await serve (new Request ('http://kit.test/about'))
    const html = await res.text ()

    assert.ok ((html).includes ('<link rel="stylesheet" href="/_kit/styles-'))
    assert.deepStrictEqual (html.includes ('<style'), false)

    const ids = /data-kit-styles="([^"]*)"/.exec (html)?.[1] ?? ''
    assert.deepStrictEqual (ids.split (' ').length > 1, true)
    const sheetText = await readText (
      `${outDir}/${(/href="\/_kit\/([^"]+)"/.exec (html) ?? ['', ''])[1]}`,
    )
    for (const id of ids.split (' ')) {
      assert.ok ((sheetText).includes (id))
    }

    const href = /href="(\/_kit\/styles-[^"]+)"/.exec (html)?.[1] ?? ''
    const sheet = await serve (new Request (`http://kit.test${href}`))
    assert.deepStrictEqual (sheet.status, 200)
    assert.deepStrictEqual (sheet.headers.get ('content-type'), 'text/css; charset=utf-8')
    assert.ok ((String (sheet.headers.get ('cache-control'))).includes ('immutable'))
    await sheet.body?.cancel ()
  }))

test ('kit/build — an island chunk is named from its contents and cached forever', () =>
  inDir (async (outDir) => {
    const made = await build ({ outDir })
    const file = chunkOf (made.manifest) ('mark')

    assert.deepStrictEqual (/^mark-[A-Za-z0-9_-]{8}\.js$/.test (file), true)
    assert.ok ((made.manifest.mark).includes ('/_kit/mark-'))

    const again = await build ({ outDir })
    assert.deepStrictEqual (again.manifest.mark, made.manifest.mark)
  }))

test ('kit/build — an island chunk has class names, not rules', () =>
  inDir (async (outDir) => {
    const made = await build ({ outDir })

    const chunk = await readText (
      `${outDir}/${chunkOf (made.manifest) ('mark')}`,
    )
    assert.deepStrictEqual (chunk.includes ('display: flex'), false)
    assert.ok ((chunk).includes ('mark_'))

    const name = /mark_[a-z0-9]+/.exec (chunk)?.[0] ?? ''
    const sheet = await readText (
      `${outDir}/${
        (await readText (`${outDir}/kit-build.json`)).match (
          /styles-[A-Za-z0-9_-]+\.css/,
        )?.[0]
      }`,
    )
    assert.ok ((sheet).includes (name))
  }))

test ('kit/build — with styles inlined, extraction does not happen', () =>
  inDir (async (outDir) => {
    const made = await build ({
      outDir,
      extract: false,
    })

    const chunk = await readText (
      `${outDir}/${chunkOf (made.manifest) ('mark')}`,
    )
    assert.ok ((chunk).includes ('display: flex'))
  }))

test ('kit/app — an app can leave the styles inside the page', () =>
  inDir (async (outDir) => {
    const serve = await app ({
      routes,
      error,
      state,
      outDir,
      styles: collectStyles,
    })

    const html = await (await serve (new Request ('http://kit.test/about')))
      .text ()
    assert.ok ((html).includes ('<style data-kit'))
    assert.deepStrictEqual (html.includes ('rel="stylesheet"'), false)
  }))

test ('kit/app — live, once included, brings its own route with it', () =>
  inDir (async (outDir) => {
    const serve = await app ({
      routes,
      error,
      state,
      include: ['navigation', 'live'],
      outDir,
    })

    const stream = await serve (new Request ('http://kit.test/live'))
    assert.deepStrictEqual (stream.status, 426)
    assert.deepStrictEqual (stream.headers.get ('upgrade'), 'websocket')
    await stream.body?.cancel ()
  }))

test ('kit/app — without live that path is not there', () =>
  inDir (async (outDir) => {
    const serve = await app ({
      routes,
      error,
      state,
      include: ['navigation'],
      outDir,
    })

    const res = await serve (new Request ('http://kit.test/live'))
    assert.deepStrictEqual (res.status, 404)
    await res.body?.cancel ()
  }))

test ('kit/app — a route of your own on the same path stays yours', () =>
  inDir (async (outDir) => {
    const mine: Route<State> = endpoint ({
      pattern: '/live',
      on: { GET: () => F.resolve (text ('mine')) },
    })
    const serve = await app ({
      routes: [...routes, mine],
      error,
      state,
      include: ['live'],
      outDir,
    })

    const res = await serve (new Request ('http://kit.test/live'))
    assert.deepStrictEqual (await res.text (), 'mine')
  }))

const shouting: Route<State> = endpoint ({
  pattern: '/api/who',
  on: {
    GET: () => F.resolve (withHeader ('x-who') ('anya—') (json ({ ok: true }))),
  },
})

test ('kit/app — a header that does not fit in bytes is a 500 here too', () =>
  inDir (async (outDir) => {
    const ask = await app ({
      routes: [...routes, shouting],
      error,
      state,
      outDir,
    })

    const res = await ask (new Request ('http://kit.test/api/who'))
    assert.deepStrictEqual (res.status, 500)
    assert.deepStrictEqual (res.headers.get ('content-type'), 'application/json')
    assert.deepStrictEqual (typeof (await res.json ()).error, 'string')
  }))

test ('kit/app — your own scripts stay on the document beside the reload chunk', () =>
  inDir (async (outDir) => {
    const ask = await app ({
      routes,
      error,
      state,
      outDir,
      always: ['/mine.js'],
      include: ['reload'],
    })

    const html = await (await ask (new Request ('http://kit.test/about'))).text ()
    assert.ok ((html).includes ('src="/mine.js"'))
    assert.ok ((html).includes ('src="/_kit/reload-'))
  }))

test ('kit/dev — the log sees everything that left, and the status it left with', () =>
  inDir (async (outDir) => {
    const lines: string[] = []
    const wrote = console.log
    console.log = (line: string) => {
      lines.push (String (line))
    }
    let chunk = ''
    try {
      const ask = await dev ({
        routes: [...routes, shouting],
        error,
        state,
        outDir,
      })
      const html = await (await ask (new Request ('http://kit.test/about')))
        .text ()
      chunk = /src="(\/_kit\/reload-[^"]+)"/.exec (html)?.[1] ?? ''
      const file = await ask (new Request (`http://kit.test${chunk}`))
      await file.body?.cancel ()
      const broken = await ask (new Request ('http://kit.test/api/who'))
      await broken.body?.cancel ()
    } finally {
      console.log = wrote
    }

    assert.deepStrictEqual (lines.length, 3)
    assert.ok ((lines[1]).includes (chunk))
    assert.ok ((lines[2]).includes ('/api/who → 500'))
  }))

test ('kit/app — dev, build, and serve take the same object', () =>
  inDir (async (outDir) => {
    const config: Config = {
      routes: [page ({
        pattern: '/',
        head: () => ({ title: P.just ('Home') }),
        view: () => H.h1 (['Home']),
      })],
      outDir,
    }

    const built = await build (config)
    assert.deepStrictEqual (built.tag, 'built')
    assert.ok ((report (built)).includes ('islands:'))

    const before = await readText (`${outDir}/kit-build.json`)
    const answering = await serve (config)
    const answered = await answering (new Request ('http://kit.test/'))
    assert.ok ((await answered.text ()).includes ('<h1>Home'))
    assert.deepStrictEqual (await readText (`${outDir}/kit-build.json`), before)
  }))

test ('kit/router — a layout reads its own, and reads it along with the page', async () => {
  const started: number[] = []
  const shell = layout<{ who: string }> ({
    load: () => {
      started.push (Date.now ())
      return P.map (() => data ({ who: 'menu' })) (
        F.after (20)<unknown, void> (undefined),
      )
    },
    view: (ctx) => H.div ({ class: 'shell' }, [H.p ([ctx.data.who]), ctx.slot]),
  })
  const inner: Route = page ({
    pattern: '/x',
    load: () => {
      started.push (Date.now ())
      return P.map (() => data ({ n: 7 })) (F.after (20)<unknown, void> (undefined))
    },
    head: () => ({ title: P.just ('x') }),
    view: (ctx) => H.span ([String ((ctx.data as { n: number }).n)]),
  })

  const html = await (await handler ({ routes: shell ([inner]) }) (
    new Request ('http://kit.test/x'),
  )).text ()

  assert.ok ((html).includes ('<div class="shell">'))
  assert.ok ((html).includes ('menu'))
  assert.ok ((html).includes ('<span>7'))
  assert.deepStrictEqual (Math.abs (started[0] - started[1]) < 15, true)
})

test ('kit/router — a layout that refused answers for the page', async () => {
  let drew = false
  const guarded = layout<Record<string, never>> ({
    load: () => F.resolve (redirect ('/enter')),
    view: (ctx) => H.div ([ctx.slot]),
  })
  const inner: Route = page ({
    pattern: '/x',
    head: () => ({ title: P.just ('x') }),
    view: () => {
      drew = true
      return H.span (['not allowed'])
    },
  })

  const res = await handler ({ routes: guarded ([inner]) }) (
    new Request ('http://kit.test/x'),
  )
  assert.deepStrictEqual ([res.status, res.headers.get ('location')], [303, '/enter'])
  assert.deepStrictEqual (drew, false)
  await res.body?.cancel ()
})

test ('kit/router — layouts nest, each with its own', async () => {
  const outer = layout<{ a: string }> ({
    load: () => F.resolve (data ({ a: 'outside' })),
    view: (ctx) =>
      H.div ({ class: 'outer' }, [H.strong ([ctx.data.a]), ctx.slot]),
  })
  const middle = layout<{ b: string }> ({
    load: () => F.resolve (data ({ b: 'inside' })),
    view: (ctx) => H.div ({ class: 'inner' }, [H.em ([ctx.data.b]), ctx.slot]),
  })
  const leaf: Route = page ({
    pattern: '/x',
    head: () => ({ title: P.just ('x') }),
    view: () => H.span (['leaf']),
  })

  const html = await (await handler ({
    routes: outer (middle ([leaf])),
  }) (new Request ('http://kit.test/x'))).text ()

  const at = (needle: string) => html.indexOf (needle)
  assert.deepStrictEqual (at ('class="outer"') < at ('class="inner"'), true)
  assert.deepStrictEqual (at ('class="inner"') < at ('<span>leaf'), true)
  assert.ok ((html).includes ('outside'))
  assert.ok ((html).includes ('inside'))
})

test ('kit/router — a layout without its own load is drawn with empty data', async () => {
  const plain = layout ({
    view: (ctx) => H.div ({ class: 'plain' }, [ctx.slot]),
  }) ([
    page ({
      pattern: '/x',
      head: () => ({ title: P.just ('x') }),
      view: () => H.span (['inside']),
    }),
  ])
  const html = await (await handler ({ routes: plain }) (
    new Request ('http://kit.test/x'),
  )).text ()
  assert.ok ((html).includes ('<div class="plain"><span>inside'))
})

async function islandsReading(dir: string): Promise<URL> {
  const kit = new URL ('../src/mod.ts', import.meta.url).href
  const h = import.meta.resolve ('@algosail/plydom/h')
  await writeText (
    `${dir}/reader.ts`,
    [
      `import { island } from '${kit}'`,
      `import * as H from '${h}'`,
      `const said = process.env.KIT_PUBLIC_SAID ?? 'default'`,
      `const other = process.env.KIT_PUBLIC_MISSING ?? 'fallback'`,
      `const kept = process.env.KIT_PRIVATE_KEPT ?? 'no'`,
      `export const reader = island('reader', () => H.p([\`\${said} \${other} \${kept}\`]), import.meta.url)`,
    ].join ('\n'),
  )
  return new URL (`file://${dir}/reader.ts`)
}

test ('kit/build — KIT_PUBLIC_ is filled into the chunk, and the rest stays a read', () =>
  inDirs (async ({ out: home, outDir }) => {
    process.env.KIT_PUBLIC_SAID = 'value'
    delete process.env.KIT_PUBLIC_MISSING
    process.env.KIT_PRIVATE_KEPT = 'secret'

    await import ((await islandsReading (home)).href)
    const built = await build ({ outDir, minify: false })
    const chunk = await readText (
      `${outDir}/${chunkOf (built.manifest) ('reader')}`,
    )

    assert.ok ((chunk).includes ('"value"'))
    assert.ok ((chunk).includes ('void 0'))
    assert.deepStrictEqual (chunk.includes ('KIT_PUBLIC_SAID'), false)
    assert.deepStrictEqual (chunk.includes ('KIT_PUBLIC_MISSING'), false)

    assert.ok ((chunk).includes ('process.env.KIT_PRIVATE_KEPT'))
    assert.deepStrictEqual (chunk.includes ('secret'), false)

    assert.deepStrictEqual (built.env.put, {
      KIT_PUBLIC_SAID: 'value',
      KIT_PUBLIC_MISSING: null,
    })
    assert.deepStrictEqual (built.env.left, ['KIT_PRIVATE_KEPT'])
    const said = report (built)
    assert.ok ((said).includes ('environment: '))
    assert.ok ((said).includes ('KIT_PUBLIC_SAID'))
    assert.ok ((said).includes ('KIT_PUBLIC_MISSING — unset'))
    assert.ok ((said).includes ('island reads KIT_PRIVATE_KEPT'))
  }))
