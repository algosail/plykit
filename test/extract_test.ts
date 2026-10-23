import * as P from '@algosail/ply'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { replaceAtoms } from '../src/build/atom.ts'
import { absolute, replaceBlocks } from '../src/build/extract.ts'
import { compile, css, resetStyles, styleIds } from '../src/document/css.ts'
import { tokens } from '../src/document/tokens.ts'

const block = (raw: string) => compile (raw)

const said = (out: ReturnType<typeof replaceBlocks>, fallback = ''): string =>
  P.fromMaybe (fallback) (out)

test ('kit/extract — a block is replaced with its own class names', () => {
  const raw = '\n  .counter {\n    display: flex;\n  }\n'
  const one = block (raw)
  const source = `export const style = css\`${raw}\``

  const out = replaceBlocks (source, new Set ([one.id]))
  assert.deepStrictEqual (said (out), `export const style = ${JSON.stringify (one.classes)}`)
  assert.ok ((said (out)).includes (`counter_${one.id}`))
})

test ('kit/extract — an unknown block is left alone', () => {
  const source = 'const s = css`\n  .a { color: red }\n`'
  assert.deepStrictEqual (replaceBlocks (source, new Set (['nobody'])), P.nothing ())
})

test ('kit/extract — an interpolation is left for runtime', () => {
  const source = 'const s = css`.a { color: ${accent} }`'
  const anything = new Set ([block ('.a { color: red }').id])
  assert.deepStrictEqual (replaceBlocks (source, anything), P.nothing ())
})

test ('kit/extract — a property with the same name is not a call', () => {
  const raw = '.a { color: red }'
  const one = block (raw)
  const source = `const a = style.css\`${raw}\``
  assert.deepStrictEqual (replaceBlocks (source, new Set ([one.id])), P.nothing ())

  const longer = `const a = mycss\`${raw}\``
  assert.deepStrictEqual (replaceBlocks (longer, new Set ([one.id])), P.nothing ())
})

test ('kit/extract — several blocks in one file', () => {
  const first = block ('.a { color: red }')
  const second = block ('.b { color: blue }')
  const source = [
    'export const one = css`.a { color: red }`',
    'export const two = css`.b { color: blue }`',
  ].join ('\n')

  const out = replaceBlocks (source, new Set ([first.id, second.id]))
  assert.ok ((said (out)).includes (JSON.stringify (first.classes)))
  assert.ok ((said (out)).includes (JSON.stringify (second.classes)))
  assert.deepStrictEqual (said (out).includes ('css`'), false)
})

test ('kit/extract — a known block beside an unknown one', () => {
  const known = block ('.a { color: red }')
  const source = [
    'export const one = css`.a { color: red }`',
    'export const two = css`.z { color: pink }`',
  ].join ('\n')

  const out = said (replaceBlocks (source, new Set ([known.id])))
  assert.ok ((out).includes (JSON.stringify (known.classes)))
  assert.ok ((out).includes ('css`.z { color: pink }`'))
})

test ('kit/extract — an escaped apostrophe inside a block', () => {
  const raw = ".a::after { content: '\\`' }"
  const one = block (raw)
  const out = replaceBlocks (`const s = css\`${raw}\``, new Set ([one.id]))
  assert.deepStrictEqual (said (out), `const s = ${JSON.stringify (one.classes)}`)
})

test ('kit/extract — a static style call is the same string the call returns', () => {
  resetStyles ()
  const { style } = tokens ({
    space: { 4: '1rem' },
    color: { text: '#111' },
  })
  const card = style ({ padding: '4', color: 'text' })
  const source = [
    'const { style } = tokens({',
    '  space: { 4: \'1rem\' },',
    '  color: { text: \'#111\' },',
    '})',
    'const card = style({ padding: \'4\', color: \'text\' })',
  ].join ('\n')
  const out = replaceAtoms (source, new Set (styleIds ()), new Map ())
  assert.ok (said (out).includes (`const card = ${JSON.stringify (card)}`))
  assert.equal (said (out).includes ('style({'), false)
  resetStyles ()
})

test ('kit/extract — a style imported from the token module', () => {
  resetStyles ()
  const { style } = tokens ({ space: { 4: '1rem' } })
  const card = style ({ padding: '4' })
  const theme = [
    'export const { style } = tokens({',
    '  space: { 4: \'1rem\' },',
    '})',
  ].join ('\n')
  const source = [
    'import { style } from \'./theme.ts\'',
    'const card = style({ padding: \'4\' })',
  ].join ('\n')
  const out = replaceAtoms (source, new Set (styleIds ()), new Map ([['./theme.ts', theme]]))
  assert.ok (said (out).includes (`const card = ${JSON.stringify (card)}`))
  resetStyles ()
})

test ('kit/extract — a value that is not static stays a call', () => {
  const source = [
    'const { style } = tokens({ space: { 4: \'1rem\' } })',
    'const card = style({ padding: n })',
  ].join ('\n')
  assert.deepStrictEqual (replaceAtoms (source, new Set (['anything']), new Map ()), P.nothing ())
})

test ('kit/extract — a static recipe pick is the string the call returns', () => {
  resetStyles ()
  const { recipe } = tokens ({
    color: { text: '#111', surface: '#fff' },
    space: { 4: '1rem' },
  })
  const button = recipe ({
    base: { padding: '4' },
    variants: {
      tone: {
        quiet: { color: 'text' },
        solid: { background: 'surface' },
      },
    },
  })
  const worn = button ({ tone: 'solid' })
  const source = [
    'const { recipe } = tokens({',
    '  color: { text: \'#111\', surface: \'#fff\' },',
    '  space: { 4: \'1rem\' },',
    '})',
    'const button = recipe({',
    '  base: { padding: \'4\' },',
    '  variants: {',
    '    tone: {',
    '      quiet: { color: \'text\' },',
    '      solid: { background: \'surface\' },',
    '    },',
    '  },',
    '})',
    'const worn = button({ tone: \'solid\' })',
  ].join ('\n')
  const out = said (replaceAtoms (source, new Set (styleIds ()), new Map ()))
  assert.ok (out.includes (`const worn = ${JSON.stringify (worn)}`))
  assert.ok (out.includes ('const button = recipe({'))
  resetStyles ()
})

test ('kit/extract — relative imports become absolute', () => {
  const source = [
    "import { css } from '../kit/mod.ts'",
    "export * from './neighbour.ts'",
    "const late = await import('../../deep/x.ts')",
    "const untouched = 'jsr:@std/assert'",
  ].join ('\n')

  const out = absolute (source, 'file:///app/islands/counter.ts')
  assert.ok ((out).includes ("from 'file:///app/kit/mod.ts'"))
  assert.ok ((out).includes ("from 'file:///app/islands/neighbour.ts'"))
  assert.ok ((out).includes ("import('file:///deep/x.ts')"))
  assert.ok ((out).includes ("'jsr:@std/assert'"))
})
