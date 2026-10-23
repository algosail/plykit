import type { Properties } from 'csstype'

/** A custom property, kept under the name it has in CSS. */
type Custom = {
  readonly [name in `--${string}`]?: string | number
}

/**
 * One rule: CSS properties, selectors nested under it, and `@media` queries.
 * Names are camel case, so the editor can complete them.
 */
export type Style = Properties & Custom & {
  readonly selectors?: { readonly [selector: string]: Style }
  readonly media?: { readonly [query: string]: Style }
}

type Trim<S extends string> = S extends ` ${infer R}` | `${infer R} `
  ? Trim<R>
  : S

/** Class names a sheet key contributes. A selector key contributes none. */
type ClassNames<K> = K extends string
  ? K extends `${infer A},${infer B}`
    ? ClassNames<Trim<A>> | ClassNames<Trim<B>>
    : K extends `&${string}`
        | `@${string}`
        | `:${string}`
        | `.${string}`
        | `#${string}`
        | `[${string}`
        | `${string}${' ' | '>' | '+' | '~'}${string}`
      ? never
      : K
  : never

/** The class names `css` returns for a sheet, one string for each class key. */
export type ClassesOf<T> = {
  readonly [K in ClassNames<keyof T> & string]: string
}

/** A value inside a sheet: a declaration, or a nested rule. */
export type Node = string | number | Sheet

/** An object of rules, as `css` receives it and as a static call is read back. */
export type Sheet = { readonly [key: string]: Node }

const NAME = /-?[_a-zA-Z][_a-zA-Z0-9-]*/

const CLASS_LIST = new RegExp (
  `^${NAME.source}(?:\\s*,\\s*${NAME.source})*$`,
)

const RESERVED = new Set (['selectors', 'media'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray (value)

/**
 * A bare word is a class. Several words with commas share one rule.
 * Anything else is a selector, and a leading `&` is not part of it: `&body` is `body`.
 */
const selectorOf = (key: string): string =>
  CLASS_LIST.test (key)
    ? key.split (',').map ((one) => `.${one.trim ()}`).join (', ')
    : key.startsWith ('&')
      ? key.slice (1).trim ()
      : key

/** Class names a sheet declares as keys, in the order of those keys. */
export const declaredNames = (sheet: object): readonly string[] =>
  Object.keys (sheet).flatMap ((key) =>
    CLASS_LIST.test (key)
      ? key.split (',').map ((one) => one.trim ())
      : [],
  )

/**
 * `fontSize` becomes `font-size`, `WebkitLineClamp` becomes `-webkit-line-clamp`.
 * `msFlexDirection` becomes `-ms-flex-direction`. A custom property is already dashed.
 */
const kebab = (prop: string): string => {
  if (prop.startsWith ('--') || prop.startsWith ('-')) return prop
  const dashed = prop.replace (/[A-Z]/g, (char) => `-${char.toLowerCase ()}`)
  return dashed.startsWith ('ms-') ? `-${dashed}` : dashed
}

const declarations = (style: Record<string, unknown>): readonly string[] =>
  Object.entries (style).flatMap (([key, value]) =>
    RESERVED.has (key) || (typeof value !== 'string' && typeof value !== 'number')
      ? []
      : [`${kebab (key)}: ${String (value)}`],
  )

/** `&` stands for the selector this rule was opened with. Without it, the text is kept. */
const nest = (parent: string) => (selector: string): string =>
  selector.includes ('&') ? selector.replaceAll ('&', parent) : selector

const indent = (text: string): string =>
  text.split ('\n').map ((line) => line.length === 0 ? line : `  ${line}`).join ('\n')

const ruleOf = (selector: string) => (style: Record<string, unknown>): string => {
  const parts: string[] = []
  const decls = declarations (style)
  if (decls.length > 0) parts.push (`${selector} { ${decls.join ('; ')} }`)

  const nested = style.selectors
  if (isRecord (nested)) {
    for (const [sel, body] of Object.entries (nested)) {
      if (!isRecord (body)) continue
      const inner = ruleOf (nest (selector) (sel)) (body)
      if (inner.length > 0) parts.push (inner)
    }
  }

  const queries = style.media
  if (isRecord (queries)) {
    for (const [query, body] of Object.entries (queries)) {
      if (!isRecord (body)) continue
      const inner = ruleOf (selector) (body)
      if (inner.length > 0) parts.push (`@media ${query} {\n${indent (inner)}\n}`)
    }
  }

  return parts.join ('\n')
}

/**
 * The sheet as CSS text, with class names still as written.
 * `compile` renames them. The text, not the TypeScript spacing, is what the hash is of.
 * @example
 * ```ts
 * emit ({ card: { padding: '1rem' } }) // => '.card { padding: 1rem }'
 * ```
 */
export const emit = (sheet: object): string =>
  Object.entries (sheet).flatMap (([key, value]) => {
    if (!isRecord (value)) return []
    const text = ruleOf (selectorOf (key)) (value)
    return text.length > 0 ? [text] : []
  }).join ('\n')
