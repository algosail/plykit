import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Style } from '../src/mod.ts'
import {
  collectBeyond,
  collectStyles,
  css,
  resetStyles,
  styleIds,
  styleSheet,
} from '../src/mod.ts'

const fresh = <A>(run: () => A): A => {
  resetStyles ()
  return run ()
}

const sheet = (): string => styleSheet ().replace (/\s+/g, ' ').trim ()

test ('css — renames classes and returns the map', () => {
  const s = fresh (() =>
    css`
      .card {
        padding: 1rem;
      }
    `,
  )
  assert.deepStrictEqual (Object.keys (s), ['card'])
  assert.ok ((s.card).includes ('card_'))
  assert.ok ((sheet ()).includes (`.${s.card}`))
  assert.ok ((sheet ()).includes ('padding: 1rem'))
})

test ('css — one class is renamed everywhere it appears', () => {
  const s = fresh (() =>
    css`
      .card {
        color: red;
      }
      .card:hover {
        color: blue;
      }
      .card > .icon {
        fill: red;
      }
    `,
  )
  assert.deepStrictEqual (Object.keys (s).sort (), ['card', 'icon'])
  const text = sheet ()
  assert.ok ((text).includes (`.${s.card}:hover`))
  assert.ok ((text).includes (`.${s.card} > .${s.icon}`))
  assert.deepStrictEqual (/\.card[^_]/.test (text), false)
  assert.deepStrictEqual (/\.icon[^_]/.test (text), false)
})

test ('css — element selectors are left alone', () => {
  const s = fresh (() =>
    css`
      .app a {
        color: #06c;
      }
      body {
        margin: 0;
      }
    `,
  )
  const text = sheet ()
  assert.ok ((text).includes ('body {'))
  assert.ok ((text).includes (`.${s.app} a {`))
})

test ('css — a dot inside a string, and url(), is content, not a selector', () => {
  fresh (() =>
    css`
      .hero {
        background: url(hero.png);
      }
    `,
  )
  assert.ok ((sheet ()).includes ('url(hero.png)'))

  fresh (() =>
    css`
      .icon {
        background: url("./img/logo.svg");
      }
    `,
  )
  assert.ok ((sheet ()).includes ('url("./img/logo.svg")'))

  fresh (() =>
    css`
      .f {
        font-family: "Helvetica.Neue", sans-serif;
      }
    `,
  )
  assert.ok ((sheet ()).includes ('"Helvetica.Neue"'))

  fresh (() =>
    css`
      .doc a[href$=".pdf"] {
        color: teal;
      }
    `,
  )
  assert.ok ((sheet ()).includes ('[href$=".pdf"]'))
})

test ('css — decimal numbers are not selectors', () => {
  fresh (() =>
    css`
      .t {
        padding: 0.5rem;
        transition: all 0.3s ease;
      }
    `,
  )
  const text = sheet ()
  assert.ok ((text).includes ('0.5rem'))
  assert.ok ((text).includes ('.3s'))
})

test ('css — @media is parsed as usual', () => {
  const s = fresh (() =>
    css`
      @media (min-width: 40rem) {
        .card {
          padding: 2rem;
        }
      }
    `,
  )
  const text = sheet ()
  assert.ok ((text).includes ('@media (min-width: 40rem)'))
  assert.ok ((text).includes (`.${s.card}`))
})

test ('css — the name depends only on the text of the block', () => {
  const first = fresh (() =>
    css`
      .a {
        color: red;
      }
    `,
  )
  const again = fresh (() =>
    css`
      .a {
        color: red;
      }
    `,
  )
  const other = fresh (() =>
    css`
      .a {
        color: blue;
      }
    `,
  )
  assert.deepStrictEqual (first.a, again.a)
  assert.deepStrictEqual (first.a === other.a, false, 'different text — a different name')
})

test ('css — a repeated call does not add the block twice', () => {
  let a: Record<string, string> = {}
  fresh (() => {
    a = css`
      .a {
        color: red;
      }
    `
    css`
      .a {
        color: red;
      }
    `
  })
  assert.deepStrictEqual (
    collectStyles (`<p class="${a.a}"></p>`).split ('<style').length - 1,
    1,
  )
})

test ('collectBeyond — a known block stays out, a new one rides along', () => {
  let kept: Record<string, string> = {}
  let freshBlock: Record<string, string> = {}
  fresh (() => {
    kept = css`
      .kept {
        color: red;
      }
    `
    freshBlock = css`
      .fresh {
        color: blue;
      }
    `
  })
  const markup = `<p class="${kept.kept} ${freshBlock.fresh}"></p>`
  const known = styleIds ().filter ((id) => kept.kept.endsWith (`_${id}`))
  const tags = collectBeyond (known) (markup)
  assert.ok ((tags).includes ('color: blue'))
  assert.deepStrictEqual (tags.includes ('color: red'), false)
  assert.deepStrictEqual (collectBeyond (styleIds ()) (markup), '')
})

test ('collectStyles — the tags carry their own id', () => {
  let a: Record<string, string> = {}
  fresh (() => {
    a = css`
      .a {
        color: red;
      }
    `
  })
  const tags = collectStyles (`<p class="${a.a}"></p>`)
  assert.ok ((tags).includes ('<style data-kit="'))
  assert.ok ((tags).includes ('</style>'))
  assert.deepStrictEqual (tags.split ('<style').length - 1, 1)
})

test ('collectStyles — only the blocks that are in the markup', () => {
  let used: Record<string, string> = {}
  fresh (() => {
    used = css`
      .used {
        color: red;
      }
    `
    css`
      .unused {
        color: blue;
      }
    `
  })
  assert.deepStrictEqual (sheet ().includes ('blue'), true)
  const tags = collectStyles (`<p class="${used.used}"></p>`)
  assert.deepStrictEqual (tags.split ('<style').length - 1, 1)
  assert.ok ((tags).includes ('red'))
  assert.deepStrictEqual (tags.includes ('blue'), false)
  assert.deepStrictEqual (collectStyles ('<p>bare text</p>'), '')
})

test ('collectStyles — a closing tag inside CSS is neutralized', () => {
  fresh (() =>
    css`
      .a::after {
        content: "</style><script>x</script>";
      }
    `,
  )
  const tags = collectStyles (
    `<div class="${
      [...sheet ().matchAll (/a_(\w+)/g)].map ((m) => m[0]).join (' ')
    }"></div>`,
  )
  assert.deepStrictEqual (tags.split ('</style>').length - 1, 1)
  assert.ok ((tags).includes ('<\\/style>'))
  assert.ok ((sheet ()).includes ('"</style><script>x</script>"'))
})

test ('styleSheet — without an id, so it is not confused with an inline sheet', () => {
  fresh (() =>
    css`
      .a {
        color: red;
      }
    `,
  )
  assert.deepStrictEqual (sheet ().includes ('data-kit'), false)
  assert.deepStrictEqual (sheet ().includes ('<style'), false)
})

test ('styleIds — the ids of the blocks, exactly those in the sheet', () => {
  resetStyles ()
  const one = css`
    .a {
      color: red;
    }
  `
  const two = css`
    .b {
      color: blue;
    }
  `
  const ids = styleIds ()
  assert.deepStrictEqual (ids.length, 2)
  assert.deepStrictEqual (ids.some ((id: string) => one.a.endsWith (id)), true)
  assert.deepStrictEqual (ids.some ((id: string) => two.b.endsWith (id)), true)
  for (const id of ids) assert.deepStrictEqual (styleSheet ().includes (id), true)
  resetStyles ()
  assert.deepStrictEqual (styleIds (), [])
})

test ('resetStyles — clears the registry', () => {
  fresh (() =>
    css`
      .a {
        color: red;
      }
    `,
  )
  assert.deepStrictEqual (sheet ().length > 0, true)
  resetStyles ()
  assert.deepStrictEqual ([styleSheet (), collectStyles ('.a_anything')], ['', ''])
})

test ('css — an interpolation goes into the text and into the name', () => {
  const red = fresh (() =>
    css`
      .a {
        color: ${'red'};
      }
    `,
  )
  const blue = fresh (() =>
    css`
      .a {
        color: ${'blue'};
      }
    `,
  )
  assert.deepStrictEqual (red.a === blue.a, false, 'the value changes the block, and so the name')
  fresh (() =>
    css`
      .a {
        padding: ${8}px;
      }
    `,
  )
  assert.ok ((sheet ()).includes ('padding: 8px'))
})

test ('collectStyles — a block with no classes of its own always goes out', () => {
  fresh (() =>
    css`
      :root {
        --brand: #08f;
      }
      body {
        margin: 0;
      }
    `,
  )
  const tags = collectStyles ('<div></div>')
  assert.ok ((tags).includes ('--brand: #08f'))
  assert.ok ((tags).includes ('margin: 0'))
})

test ('collectStyles — a block with classes goes out only when they are worn', () => {
  const s = fresh (() =>
    css`
      .card {
        padding: 1rem;
      }
    `,
  )
  assert.deepStrictEqual (collectStyles ('<div></div>'), '')
  assert.ok ((collectStyles (`<div class="${s.card}"></div>`)).includes ('padding'))
  assert.deepStrictEqual (collectStyles (`<p>${s.card}</p>`), '')
})

test ('kit/collectStyles — a block arrives by its own class, and someone else\'s does not', () => {
  const tags = fresh (() => {
    const worn = css`
      .card {
        color: red;
      }
    `
    css`
      .ghost {
        color: blue;
      }
    `
    css`
      :root {
        --x: 1;
      }
    `
    return collectStyles (
      `<div class="${worn.card} plain"><p class="other">t</p></div>`,
    )
  })
  assert.deepStrictEqual (
    [tags.includes ('.card_'), tags.includes ('.ghost_'), tags.includes ('--x')],
    [true, false, true],
    'worn, unfound, nameless',
  )
})

test ('css — an object renames its classes and can sit below the reader', () => {
  const read = (): string => shown.card
  const shown = fresh (() =>
    css ({
      card: {
        padding: '1rem',
        lineHeight: 1.6,
        selectors: {
          '&:hover': { background: '#eee' },
          '& > .icon': { fill: 'red' },
          '& a': { color: '#7a4b1e' },
        },
        media: {
          '(min-width: 40rem)': { padding: '2rem' },
        },
      },
      icon: {},
      'menu, account': {
        display: 'flex',
        alignItems: 'center',
        gap: '0.9rem',
      },
    }),
  )
  assert.ok (read ().includes ('card_'))
  assert.deepStrictEqual (
    Object.keys (shown).sort (),
    ['account', 'card', 'icon', 'menu'],
  )
  const text = sheet ()
  assert.ok (text.includes (`.${shown.card}:hover`))
  assert.ok (text.includes (`.${shown.card} > .${shown.icon}`))
  assert.ok (text.includes (`.${shown.card} a`))
  assert.ok (text.includes ('@media (min-width: 40rem)'))
  assert.ok (text.includes ('padding: 2rem'))
  assert.ok (text.includes ('line-height: 1.6'))
  assert.ok (text.includes (`.${shown.menu}, .${shown.account}`))
  assert.ok (text.includes ('-webkit-line-clamp') === false)
})

test ('css — a selector key is written as itself, and a bare word is a class', () => {
  fresh (() => {
    css ({
      ':root': { '--brand': '#08f' },
      '&body': { margin: 0 },
    })
    css ({ body: { color: 'red' } })
  })
  const text = sheet ()
  assert.ok (text.includes (':root'))
  assert.ok (text.includes ('--brand: #08f'))
  assert.ok (text.includes ('body {'))
  assert.ok (text.includes ('margin: 0'))
  assert.ok (text.includes ('.body'))
  const worn = collectStyles ('<div></div>')
  assert.ok (worn.includes ('--brand: #08f'))
  assert.ok (worn.includes ('margin: 0'))
  assert.equal (worn.includes ('.body'), false)
})

test ('css — Webkit and ms names gain the leading dash', () => {
  fresh (() => {
    css ({
      clip: {
        WebkitLineClamp: 2,
        msFlexDirection: 'column',
      },
    })
  })
  const text = sheet ()
  assert.ok (text.includes ('-webkit-line-clamp: 2'))
  assert.ok (text.includes ('-ms-flex-direction: column'))
})

test ('css — the type names the classes and refuses a property that is not one', () => {
  const theme = css ({
    card: {
      padding: '1rem',
      opacity: 0.4,
      margin: 0,
      '--brand': '#08f',
    },
    'menu, account': { display: 'flex' },
  })
  const named: string = theme.menu
  assert.equal (typeof theme.account, 'string')
  assert.equal (typeof named, 'string')

  const rule = (style: Style): Style => style
  rule ({
    selectors: {
      '&:hover': {
        // @ts-expect-error colour is not a CSS property
        colour: 'blue',
      },
    },
    media: {
      '(min-width: 40rem)': {
        // @ts-expect-error colour is not a CSS property inside a query
        colour: 'green',
      },
    },
  })

  // @ts-expect-error colour is not a CSS property
  css ({ card: { colour: 'red' } })

  // @ts-expect-error a class the sheet does not name
  theme.nope
})
