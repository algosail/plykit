import * as P from '@algosail/ply'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from '../src/css.ts'
import { absolute, replaceBlocks } from '../src/extract.ts'

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
