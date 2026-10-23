import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  collectBeyond,
  collectStyles,
  css,
  resetStyles,
  styleIds,
  styleSheet,
  tokens,
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

const theme = () =>
  tokens ({
    color: { text: '#111', muted: '#888', surface: '#fff', accent: '#08f' },
    space: { 0: '0', 2: '0.5rem', 4: '1rem', 8: '2rem' },
    font: { serif: 'Georgia, serif' },
    media: { md: '(min-width: 40rem)' },
    keyframes: {
      spin: {
        from: { transform: 'rotate(0deg)' },
        to: { transform: 'rotate(360deg)' },
      },
    },
  })

test ('tokens — one padding is one block, worn only when the class is', () => {
  const { style } = fresh (theme)
  const read = (): string => shown
  const shown = style ({ padding: '4', color: 'text' })
  const again = style ({ padding: '4' })
  assert.ok (read ().includes ('padding_4_'))
  assert.ok (shown.split (' ').includes (again))
  assert.equal (sheet ().split ('.padding_4_').length - 1, 1)
  const bare = collectStyles ('<div></div>')
  assert.ok (bare.includes ('--space-4'))
  assert.ok (bare.includes ('--color-text'))
  assert.equal (bare.includes ('.padding_4_'), false)
  const worn = collectStyles (`<div class="${shown}"></div>`)
  assert.ok (worn.includes ('.padding_4_'))
  assert.ok (worn.includes ('var(--color-text)'))
})

test ('tokens — hover, media, and an arbitrary value', () => {
  const { style } = fresh (theme)
  const shown = style ({
    hover: { background: 'surface' },
    md: { padding: '8' },
    width: '[100%]',
    display: 'flex',
    WebkitLineClamp: 2,
    msFlexDirection: 'column',
  })
  const text = sheet ()
  assert.ok (text.includes ('@media (hover: hover) and (pointer: fine)'))
  assert.ok (text.includes (`:hover`))
  assert.ok (text.includes ('@media (min-width: 40rem)'))
  assert.ok (text.includes ('padding: var(--space-8)'))
  assert.ok (text.includes ('background: var(--color-surface)'))
  assert.ok (text.includes ('width: 100%'))
  assert.ok (text.includes ('display: flex'))
  assert.ok (text.includes ('-webkit-line-clamp: 2'))
  assert.ok (text.includes ('-ms-flex-direction: column'))
  assert.ok (shown.includes ('hover_background_surface_'))
  assert.ok (shown.includes ('md_padding_8_'))
})

test ('tokens — a keyframe ships with the class that names it', () => {
  const { style } = fresh (theme)
  const shown = style ({ animationName: 'spin' })
  const id = shown.slice (shown.lastIndexOf ('_') + 1)
  const text = sheet ()
  assert.ok (text.includes (`@keyframes spin_${id}`))
  assert.ok (text.includes (`animation-name: spin_${id}`))
  assert.ok (text.includes (`.${shown}`))
  assert.equal (collectStyles ('<div></div>').includes ('@keyframes'), false)
  assert.ok (collectStyles (`<i class="${shown}"></i>`).includes (`@keyframes spin_${id}`))
})

test ('tokens — a later variant wins, and an unused one is still registered', () => {
  const { recipe } = fresh (theme)
  const button = recipe ({
    base: { padding: '4', color: 'text' },
    variants: {
      tone: {
        quiet: { color: 'muted' },
        solid: { color: 'surface', padding: '8' },
      },
      size: {
        sm: { padding: '0' },
      },
    },
    defaultVariants: { tone: 'quiet' },
  })
  const quiet = button ()
  assert.ok (quiet.includes ('padding_4_'))
  assert.ok (quiet.includes ('color_muted_'))
  assert.equal (quiet.includes ('padding_8_'), false)
  const small = button ({ tone: 'solid', size: 'sm' })
  assert.ok (small.includes ('padding_0_'))
  assert.ok (small.includes ('color_surface_'))
  assert.equal (small.includes ('padding_8_'), false)
  assert.equal (small.includes ('padding_4_'), false)
  assert.ok (sheet ().includes ('padding: var(--space-8)'))
})

test ('tokens — the type refuses a property or a token that is not one', () => {
  const { style, recipe } = theme ()
  const card: string = style ({
    padding: '4',
    paddingTop: '[13px]',
    color: 'text',
    display: 'flex',
    lineHeight: 1.6,
    animationName: 'spin',
    hover: { background: 'surface' },
    md: { padding: '0' },
  })
  const button = recipe ({
    base: { padding: '4' },
    variants: {
      tone: {
        quiet: { color: 'text' },
        solid: { background: 'surface' },
      },
    },
    defaultVariants: { tone: 'quiet' },
  })
  const named: string = button ({ tone: 'solid' })
  assert.equal (typeof card, 'string')
  assert.equal (typeof named, 'string')

  // @ts-expect-error colour is not a property
  style ({ colour: 'red' })

  // @ts-expect-error accnet is not a color token
  style ({ color: 'accnet' })

  // @ts-expect-error hovver is not a condition
  style ({ hovver: { color: 'text' } })

  // @ts-expect-error colour is not a property inside hover
  style ({ hover: { colour: 'red' } })

  // @ts-expect-error hover does not nest under a media key
  style ({ md: { hover: { color: 'text' } } })

  // @ts-expect-error nope is not a tone
  button ({ tone: 'nope' })
})
