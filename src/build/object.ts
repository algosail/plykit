import * as P from '@algosail/ply'
import type { Node, Sheet } from '../document/style.ts'

const skip = (source: string) => (at: number): number => {
  let i = at
  while (i < source.length) {
    const c = source[i]
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f') {
      i += 1
      continue
    }
    if (source.startsWith ('//', i)) {
      const nl = source.indexOf ('\n', i + 2)
      i = nl < 0 ? source.length : nl + 1
      continue
    }
    if (source.startsWith ('/*', i)) {
      const end = source.indexOf ('*/', i + 2)
      i = end < 0 ? source.length : end + 2
      continue
    }
    return i
  }
  return i
}

/** Index just after a quoted span, or `-1` when the span never closes. */
const endOfQuote = (source: string) => (at: number): number => {
  const q = source[at]
  if (q !== '"' && q !== "'" && q !== '`') return -1
  let i = at + 1
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2
      continue
    }
    if (source[i] === q) return i + 1
    i += 1
  }
  return -1
}

/** Index just after the `)` that closes the `(` at `open`, or `-1`. */
const closeOf = (source: string) => (open: number): number => {
  let depth = 0
  let i = open
  while (i < source.length) {
    if (source.startsWith ('//', i)) {
      const nl = source.indexOf ('\n', i + 2)
      i = nl < 0 ? source.length : nl + 1
      continue
    }
    if (source.startsWith ('/*', i)) {
      const end = source.indexOf ('*/', i + 2)
      i = end < 0 ? source.length : end + 2
      continue
    }
    const c = source[i]
    if (c === '"' || c === "'" || c === '`') {
      const end = endOfQuote (source) (i)
      if (end < 0) return -1
      i = end
      continue
    }
    if (c === '(' || c === '{' || c === '[') {
      depth += 1
      i += 1
      continue
    }
    if (c === ')' || c === '}' || c === ']') {
      depth -= 1
      i += 1
      if (depth === 0) return i
      continue
    }
    i += 1
  }
  return -1
}

type Read =
  | { readonly tag: 'keep'; readonly at: number; readonly value: Node }
  | { readonly tag: 'drop'; readonly at: number }
  | { readonly tag: 'miss' }

const keep = (at: number, value: Node): Read => ({ tag: 'keep', at, value })
const drop = (at: number): Read => ({ tag: 'drop', at })
const miss: Read = { tag: 'miss' }

const SIMPLE: Readonly<Record<string, string>> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  0: '\0',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '`': '`',
}

const hexAt = (source: string) => (at: number) => (size: number): P.Maybe<number> => {
  const hex = source.slice (at, at + size)
  return /^[0-9a-fA-F]+$/.test (hex) && hex.length === size
    ? P.just (Number.parseInt (hex, 16))
    : P.nothing ()
}

/** A quoted string, cooked the way JavaScript cooks it, or nothing when it is not static. */
const readString = (source: string) => (at: number): Read => {
  const q = source[at]
  if (q !== '"' && q !== "'") return miss
  let i = at + 1
  let out = ''
  while (i < source.length) {
    const c = source[i]
    if (c === '\\') {
      const n = source[i + 1]
      if (n === undefined || n === '\n' || n === '\r') return miss
      if (n === 'x') {
        const code = hexAt (source) (i + 2) (2)
        if (code.tag === 'nothing') return miss
        out += String.fromCharCode (code.value)
        i += 4
        continue
      }
      if (n === 'u' && source[i + 2] === '{') {
        const end = source.indexOf ('}', i + 3)
        const body = end < 0 ? '' : source.slice (i + 3, end)
        if (!/^[0-9a-fA-F]{1,6}$/.test (body)) return miss
        out += String.fromCodePoint (Number.parseInt (body, 16))
        i = end + 1
        continue
      }
      if (n === 'u') {
        const code = hexAt (source) (i + 2) (4)
        if (code.tag === 'nothing') return miss
        out += String.fromCharCode (code.value)
        i += 6
        continue
      }
      out += SIMPLE[n] ?? n
      i += 2
      continue
    }
    if (c === q) return keep (i + 1, out)
    if (c === '\n') return miss
    out += c
    i += 1
  }
  return miss
}

/** A template with no hole. A `${` that is not escaped makes the call a runtime one. */
const readTemplate = (source: string) => (at: number): Read => {
  if (source[at] !== '`') return miss
  let i = at + 1
  let out = ''
  while (i < source.length) {
    const c = source[i]
    if (c === '\\') {
      const n = source[i + 1]
      if (n === undefined || n === '\n' || n === '\r') return miss
      out += SIMPLE[n] ?? n
      i += 2
      continue
    }
    if (source.startsWith ('${', i)) return miss
    if (c === '`') return keep (i + 1, out)
    out += c
    i += 1
  }
  return miss
}

const IDENT = /^[A-Za-z_$][\w$]*/

const NUMBER = /^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/

const readNumber = (source: string) => (at: number): Read => {
  let i = at
  let sign = 1
  if (source[i] === '+' || source[i] === '-') {
    sign = source[i] === '-' ? -1 : 1
    i += 1
  }
  if (source[i] === '0' && /[0-9xXbo]/i.test (source[i + 1] ?? '')) return miss
  const found = NUMBER.exec (source.slice (i))
  if (found === null) return miss
  const end = i + found[0].length
  if (source[end] === 'n' || source[end] === '_') return miss
  const value = sign * Number (found[0])
  return Number.isFinite (value) ? keep (end, value) : miss
}

const readKeyword = (source: string) => (at: number): Read => {
  const found = IDENT.exec (source.slice (at))
  if (found === null) return miss
  return found[0] === 'true' || found[0] === 'false' || found[0] === 'null'
    ? drop (at + found[0].length)
    : miss
}

const readValue = (source: string) => (at: number): Read => {
  const i = skip (source) (at)
  const c = source[i]
  if (c === '"' || c === "'") return readString (source) (i)
  if (c === '`') return readTemplate (source) (i)
  if (c === '{') return readObject (source) (i)
  if (c === '+' || c === '-' || c === '.' || (c !== undefined && c >= '0' && c <= '9')) {
    return readNumber (source) (i)
  }
  return readKeyword (source) (i)
}

const readKey = (source: string) => (at: number): Read => {
  const c = source[at]
  if (c === '"' || c === "'") return readString (source) (at)
  if (c === '`') return readTemplate (source) (at)
  const found = IDENT.exec (source.slice (at))
  return found === null ? miss : keep (at + found[0].length, found[0])
}

const isText = (value: Node): value is string => typeof value === 'string'

const readObject = (source: string) => (at: number): Read => {
  if (source[at] !== '{') return miss
  const out: Record<string, Node> = {}
  let i = at + 1
  for (;;) {
    i = skip (source) (i)
    if (source[i] === '}') return keep (i + 1, out)
    const key = readKey (source) (i)
    if (key.tag !== 'keep' || !isText (key.value)) return miss
    i = skip (source) (key.at)
    if (source[i] !== ':') return miss
    const value = readValue (source) (i + 1)
    if (value.tag === 'miss') return miss
    if (value.tag === 'keep') out[key.value] = value.value
    i = skip (source) (value.at)
    if (source[i] === ',') {
      i += 1
      continue
    }
    if (source[i] === '}') return keep (i + 1, out)
    return miss
  }
}

const isSheet = (value: Node): value is Sheet =>
  typeof value === 'object' && value !== null

/** The object between the parentheses, when every value in it is static and nothing follows it. */
const readSheet = (source: string) => (at: number): Read => {
  const value = readValue (source) (at)
  if (value.tag !== 'keep' || !isSheet (value.value)) return miss
  const after = skip (source) (value.at)
  return source[after] === ')' ? keep (after + 1, value.value) : miss
}

/** What `css(` holds: a static object, or the whole call left as written. */
export type Argument =
  | { readonly tag: 'sheet'; readonly end: number; readonly sheet: Sheet }
  | { readonly tag: 'leave'; readonly end: number }

const asSheet = (end: number) => (sheet: Sheet): Argument => ({
  tag: 'sheet',
  end,
  sheet,
})

const asLeave = (end: number): Argument => ({ tag: 'leave', end })

/**
 * The argument of `css(`, from the `(` at `open`.
 * A static object comes back as a sheet. Anything else comes back as the span to leave as written.
 * @example
 * ```ts
 * // readArgument :: String -> Number -> Maybe Argument
 * readArgument ('css({ card: { padding: "1rem" } })', 3)
 * // => just ({ tag: 'sheet', end: 34, sheet: { card: { padding: '1rem' } } })
 * ```
 */
export const readArgument = (source: string) => (open: number): P.Maybe<Argument> => {
  if (source[open] !== '(') return P.nothing ()
  const end = closeOf (source) (open)
  if (end < 0) return P.nothing ()
  const read = readSheet (source) (open + 1)
  return read.tag === 'keep' && isSheet (read.value) && read.at === end
    ? P.just (asSheet (end) (read.value))
    : P.just (asLeave (end))
}
