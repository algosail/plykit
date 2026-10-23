import type { Properties } from 'csstype'
import { admitBlock, compile, hash } from './css.ts'

/** A value written out in full, outside a scale: `width: '[100%]'`. */
type Arbitrary = `[${string}]`

type Scale<Keys extends string> = Keys | Arbitrary

type SpaceProp =
  | 'padding'
  | 'margin'
  | 'gap'
  | 'columnGap'
  | 'rowGap'
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'paddingInline'
  | 'paddingBlock'
  | 'paddingInlineStart'
  | 'paddingInlineEnd'
  | 'paddingBlockStart'
  | 'paddingBlockEnd'
  | 'marginTop'
  | 'marginRight'
  | 'marginBottom'
  | 'marginLeft'
  | 'marginInline'
  | 'marginBlock'
  | 'marginInlineStart'
  | 'marginInlineEnd'
  | 'marginBlockStart'
  | 'marginBlockEnd'

type ColorProp =
  | 'color'
  | 'background'
  | 'backgroundColor'
  | 'borderColor'
  | 'outlineColor'
  | 'fill'
  | 'stroke'
  | 'textDecorationColor'

type Scaled = SpaceProp | ColorProp | 'fontFamily' | 'animationName'

type Widen<P> = {
  readonly [K in keyof P]?: P[K] | Arbitrary
}

type Field<T, K extends string> = K extends keyof T ? T[K] : undefined

type AsKey<K> = K extends string | number ? `${K}` : never

type KeyOf<T> = T extends object ? AsKey<keyof T> : never

type SpaceFields<Keys extends string> = {
  readonly [P in SpaceProp]?: Scale<Keys>
}

type ColorFields<Keys extends string> = {
  readonly [P in ColorProp]?: Scale<Keys>
}

/** One stop of a `@keyframes` rule. A percentage such as `50%` is a stop too. */
export type Frames = {
  readonly from?: Properties
  readonly to?: Properties
  readonly [stop: string]: Properties | undefined
}

/**
 * The table `tokens` reads. Each map is a scale: the key is what a component writes, the value is the CSS.
 */
export type Tokens = {
  readonly color?: { readonly [name: string]: string }
  readonly space?: { readonly [name: string]: string }
  readonly font?: { readonly [name: string]: string }
  readonly media?: { readonly [name: string]: string }
  readonly keyframes?: { readonly [name: string]: Frames }
}

type Rest<T> = Widen<Omit<Properties, Scaled>>
  & SpaceFields<KeyOf<Field<T, 'space'>>>
  & ColorFields<KeyOf<Field<T, 'color'>>> & {
    readonly fontFamily?: Scale<KeyOf<Field<T, 'font'>>>
    readonly animationName?: KeyOf<Field<T, 'keyframes'>>
  }

type Conditions<T> = {
  readonly hover?: Rest<T>
  readonly focus?: Rest<T>
  readonly active?: Rest<T>
} & {
  readonly [K in KeyOf<Field<T, 'media'>>]?: Rest<T>
}

/** One `style` argument: properties, and one level of `hover`, `focus`, `active`, or a media key. */
type Decl<T> = Rest<T> & Conditions<T>

type VariantMap<T> = {
  readonly [axis: string]: { readonly [name: string]: Decl<T> }
}

type PickOf<V> = {
  readonly [K in keyof V]?: keyof V[K] & string
}

type Spec<T, V> = {
  readonly base?: Decl<T>
  readonly variants: V
  readonly defaultVariants?: PickOf<V>
}

type Theme<T> = {
  readonly style: (decl: Decl<T>) => string
  readonly recipe: <const V extends VariantMap<T>>(
    spec: Spec<T, V>,
  ) => (pick?: PickOf<V>) => string
}

const SPACE: ReadonlySet<string> = new Set<SpaceProp> ([
  'padding',
  'margin',
  'gap',
  'columnGap',
  'rowGap',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingInline',
  'paddingBlock',
  'paddingInlineStart',
  'paddingInlineEnd',
  'paddingBlockStart',
  'paddingBlockEnd',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginInline',
  'marginBlock',
  'marginInlineStart',
  'marginInlineEnd',
  'marginBlockStart',
  'marginBlockEnd',
])

const COLOR: ReadonlySet<string> = new Set<ColorProp> ([
  'color',
  'background',
  'backgroundColor',
  'borderColor',
  'outlineColor',
  'fill',
  'stroke',
  'textDecorationColor',
])

const FIXED: ReadonlySet<string> = new Set (['hover', 'focus', 'active'])

const SAFE = /^[A-Za-z0-9_-]+$/

const HOVER = '@media (hover: hover) and (pointer: fine)'

type Table = {
  readonly color: Readonly<Record<string, string>>
  readonly space: Readonly<Record<string, string>>
  readonly font: Readonly<Record<string, string>>
  readonly media: Readonly<Record<string, string>>
  readonly keyframes: Readonly<Record<string, unknown>>
}

type Group = 'color' | 'space' | 'font'

/** One registered rule. A variable has no class. */
export type Atom = {
  readonly id: string
  readonly text: string
  readonly className: string | undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray (value)

const kebab = (prop: string): string => {
  if (prop.startsWith ('--') || prop.startsWith ('-')) return prop
  const dashed = prop.replace (/[A-Z]/g, (char) => `-${char.toLowerCase ()}`)
  return dashed.startsWith ('ms-') ? `-${dashed}` : dashed
}

const suffixOf = (value: string): string =>
  SAFE.test (value) ? value : hash (value)

const varName = (group: Group, key: string): string =>
  `--${group}-${suffixOf (key)}`

const stringMap = (value: unknown): Record<string, string> => {
  if (!isRecord (value)) return {}
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries (value)) {
    if (typeof item === 'string') out[key] = item
  }
  return out
}

const asTable = (table: object): Table => {
  const raw = table as Record<string, unknown>
  return {
    color: stringMap (raw.color),
    space: stringMap (raw.space),
    font: stringMap (raw.font),
    media: stringMap (raw.media),
    keyframes: isRecord (raw.keyframes) ? raw.keyframes : {},
  }
}

const isCondition = (table: Table, key: string): boolean =>
  FIXED.has (key) || Object.hasOwn (table.media, key)

const arbitrary = (value: string): string | undefined =>
  value.startsWith ('[') && value.endsWith (']') && value.length > 2
    ? value.slice (1, -1)
    : undefined

type Use =
  | { readonly tag: 'token'; readonly group: Group; readonly key: string; readonly css: string }
  | { readonly tag: 'frames'; readonly key: string }
  | { readonly tag: 'literal'; readonly css: string }

const interpret = (table: Table) => (prop: string) => (value: unknown): Use | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const text = String (value)
  const raw = arbitrary (text)
  if (raw !== undefined) return { tag: 'literal', css: raw }
  if (prop === 'animationName' && typeof value === 'string' && Object.hasOwn (table.keyframes, value)) {
    return { tag: 'frames', key: value }
  }
  if (typeof value === 'string' && SPACE.has (prop) && Object.hasOwn (table.space, value)) {
    return { tag: 'token', group: 'space', key: value, css: `var(${varName ('space', value)})` }
  }
  if (typeof value === 'string' && COLOR.has (prop) && Object.hasOwn (table.color, value)) {
    return { tag: 'token', group: 'color', key: value, css: `var(${varName ('color', value)})` }
  }
  if (prop === 'fontFamily' && typeof value === 'string' && Object.hasOwn (table.font, value)) {
    return { tag: 'token', group: 'font', key: value, css: `var(${varName ('font', value)})` }
  }
  return { tag: 'literal', css: text }
}

const selectorOf = (condition: string | undefined) => (stem: string): string => {
  const name = `.${stem}`
  if (condition === 'hover') return `${name}:hover`
  if (condition === 'focus') return `${name}:focus`
  if (condition === 'active') return `${name}:active`
  return name
}

const wrap = (table: Table) => (condition: string | undefined) => (rule: string): string => {
  if (condition === 'hover') return `${HOVER} {\n  ${rule}\n}`
  if (condition !== undefined && Object.hasOwn (table.media, condition)) {
    return `@media ${table.media[condition]} {\n  ${rule}\n}`
  }
  return rule
}

const ruleOf = (selector: string) => (prop: string) => (css: string): string =>
  `${selector} { ${kebab (prop)}: ${css} }`

const stemOf = (condition: string | undefined) => (prop: string) => (suffix: string): string => {
  const name = `${kebab (prop)}_${suffix}`
  return condition === undefined ? name : `${condition}_${name}`
}

const variable = (group: Group) => (key: string) => (value: string): Atom => {
  const block = compile (`:root { ${varName (group, key)}: ${value} }`)
  return { id: block.id, text: block.text, className: undefined }
}

const framed = (name: string) => (body: unknown): Atom | undefined => {
  if (!isRecord (body)) return undefined
  const stops = Object.entries (body).flatMap (([stop, style]) => {
    if (!isRecord (style)) return []
    const decls = Object.entries (style).flatMap (([key, value]) =>
      typeof value === 'string' || typeof value === 'number'
        ? [`${kebab (key)}: ${String (value)}`]
        : [],
    )
    return decls.length === 0 ? [] : [`  ${stop} { ${decls.join ('; ')} }`]
  })
  if (stops.length === 0) return undefined
  const raw = [
    `@keyframes ${name} {`,
    ...stops,
    '}',
    `.animation-name_${name} { animation-name: ${name} }`,
  ].join ('\n')
  const block = compile (raw)
  const text = block.text
    .replaceAll (`@keyframes ${name} {`, `@keyframes ${name}_${block.id} {`)
    .replaceAll (`animation-name: ${name}`, `animation-name: ${name}_${block.id}`)
  const className = block.classes[`animation-name_${name}`]
  return className === undefined ? undefined : { id: block.id, text, className }
}

const oneAtom = (
  table: Table,
  condition: string | undefined,
  prop: string,
  value: unknown,
): readonly Atom[] => {
  const use = interpret (table) (prop) (value)
  if (use === undefined) return []
  if (use.tag === 'frames') {
    const atom = framed (use.key) (table.keyframes[use.key])
    return atom === undefined ? [] : [atom]
  }
  const suffix = use.tag === 'token' ? suffixOf (use.key) : suffixOf (use.css)
  const stem = stemOf (condition) (prop) (suffix)
  const raw = wrap (table) (condition) (
    ruleOf (selectorOf (condition) (stem)) (prop) (use.css),
  )
  const block = compile (raw)
  const className = block.classes[stem]
  if (className === undefined) return []
  const atom: Atom = { id: block.id, text: block.text, className }
  return use.tag === 'token'
    ? [variable (use.group) (use.key) (table[use.group][use.key] ?? ''), atom]
    : [atom]
}

const atomsOf = (table: Table) => (decl: object): readonly Atom[] => {
  if (!isRecord (decl)) return []
  const out: Atom[] = []
  for (const [key, value] of Object.entries (decl)) {
    if (isCondition (table, key)) {
      if (!isRecord (value)) continue
      for (const [prop, inner] of Object.entries (value)) {
        if (isCondition (table, prop)) continue
        out.push (...oneAtom (table, key, prop, inner))
      }
      continue
    }
    out.push (...oneAtom (table, undefined, key, value))
  }
  return out
}

const shown = (atoms: readonly Atom[]): string =>
  atoms.flatMap ((one) => one.className === undefined ? [] : [one.className]).join (' ')

const register = (atoms: readonly Atom[]): void => {
  for (const one of atoms) {
    admitBlock ({
      id: one.id,
      text: one.text,
      classes: one.className === undefined ? {} : { atom: one.className },
    })
  }
}

type Slot = {
  readonly condition: string
  readonly prop: string
  readonly value: unknown
}

const slotsOf = (table: Table) => (decl: object) => (into: Map<string, Slot>): void => {
  if (!isRecord (decl)) return
  for (const [key, value] of Object.entries (decl)) {
    if (isCondition (table, key)) {
      if (!isRecord (value)) continue
      for (const [prop, inner] of Object.entries (value)) {
        if (isCondition (table, prop)) continue
        into.set (`${key}\0${prop}`, { condition: key, prop, value: inner })
      }
      continue
    }
    into.set (`\0${key}`, { condition: '', prop: key, value })
  }
}

type RecipeSpec = {
  readonly base: object
  readonly variants: Readonly<Record<string, Readonly<Record<string, object>>>>
  readonly defaults: Readonly<Record<string, string>>
}

const asSpec = (value: object): RecipeSpec => {
  const raw = value as Record<string, unknown>
  const variants: Record<string, Record<string, object>> = {}
  if (isRecord (raw.variants)) {
    for (const [axis, body] of Object.entries (raw.variants)) {
      if (!isRecord (body)) continue
      const names: Record<string, object> = {}
      for (const [name, decl] of Object.entries (body)) {
        if (isRecord (decl)) names[name] = decl
      }
      variants[axis] = names
    }
  }
  const defaults: Record<string, string> = {}
  if (isRecord (raw.defaultVariants)) {
    for (const [axis, name] of Object.entries (raw.defaultVariants)) {
      if (typeof name === 'string') defaults[axis] = name
    }
  }
  return {
    base: isRecord (raw.base) ? raw.base : {},
    variants,
    defaults,
  }
}

const merged = (table: Table) => (spec: RecipeSpec) => (pick: object): object => {
  const chosen: Record<string, string> = { ...spec.defaults }
  if (isRecord (pick)) {
    for (const [axis, name] of Object.entries (pick)) {
      if (typeof name === 'string') chosen[axis] = name
    }
  }
  const slots = new Map<string, Slot> ()
  slotsOf (table) (spec.base) (slots)
  for (const [axis, variants] of Object.entries (spec.variants)) {
    const name = chosen[axis]
    if (name === undefined) continue
    const body = variants[name]
    if (body !== undefined) slotsOf (table) (body) (slots)
  }
  const decl: Record<string, unknown> = {}
  const conds: Record<string, Record<string, unknown>> = {}
  for (const slot of slots.values ()) {
    if (slot.condition === '') {
      decl[slot.prop] = slot.value
      continue
    }
    const box = conds[slot.condition] ?? {}
    box[slot.prop] = slot.value
    conds[slot.condition] = box
  }
  for (const [name, body] of Object.entries (conds)) decl[name] = body
  return decl
}

/**
 * The atoms a declaration registers, without registering them.
 * The same table and the same object always return the same ids.
 */
export const describe = (table: object) => (decl: object): readonly Atom[] =>
  atomsOf (asTable (table)) (decl)

/**
 * The atoms a recipe call wears for one pick, without registering them.
 */
export const describeRecipe = (table: object) => (spec: object) => (pick: object): readonly Atom[] => {
  const ready = asTable (table)
  return atomsOf (ready) (merged (ready) (asSpec (spec)) (pick))
}

const paint = (table: Table) => (decl: object): string => {
  const atoms = atomsOf (table) (decl)
  register (atoms)
  return shown (atoms)
}

/**
 * A token table. `style` and `recipe` turn it into shared classes.
 * Nothing is registered until one of them is called.
 * @example
 * ```ts
 * // tokens :: Table -> { style, recipe }
 * const { style } = tokens ({ space: { 4: '1rem' } })
 * style ({ padding: '4' }) // => 'padding_4_…'
 * ```
 */
export function tokens<const T extends Tokens>(table: T): Theme<T> {
  const ready = asTable (table)
  const style = (decl: Decl<T>): string => paint (ready) (decl)
  const recipe = <const V extends VariantMap<T>>(
    spec: Spec<T, V>,
  ): (pick?: PickOf<V>) => string => {
    const norm = asSpec (spec)
    register (atomsOf (ready) (norm.base))
    for (const variants of Object.values (norm.variants)) {
      for (const body of Object.values (variants)) register (atomsOf (ready) (body))
    }
    return (pick?: PickOf<V>): string =>
      paint (ready) (merged (ready) (norm) (pick ?? {}))
  }
  return { style, recipe }
}
