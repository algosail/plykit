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

type BorderProp =
  | 'border'
  | 'borderTop'
  | 'borderRight'
  | 'borderBottom'
  | 'borderLeft'
  | 'outline'

type ShadowProp = 'boxShadow' | 'textShadow'

type Scaled = SpaceProp | ColorProp | BorderProp | ShadowProp | 'fontFamily' | 'animationName'

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

type BorderFields<Keys extends string> = {
  readonly [P in BorderProp]?: Keys | NonNullable<Properties[P]> | Arbitrary
}

type ShadowFields<Keys extends string> = {
  readonly [P in ShadowProp]?: Keys | NonNullable<Properties[P]> | Arbitrary
}

type Css<K extends keyof Properties> = NonNullable<Properties[K]> | Arbitrary

/** One stop of a `@keyframes` rule. A percentage such as `50%` is a stop too. */
export type Frames = {
  readonly from?: Properties
  readonly to?: Properties
  readonly [stop: string]: Properties | undefined
}

/** Typography gathered under one name: `text: 'title'`. */
type TextFace<T> = {
  readonly fontFamily?: Scale<KeyOf<Field<T, 'font'>>>
  readonly fontSize?: Css<'fontSize'>
  readonly fontWeight?: Css<'fontWeight'>
  readonly fontStyle?: Css<'fontStyle'>
  readonly lineHeight?: Css<'lineHeight'>
  readonly letterSpacing?: Css<'letterSpacing'>
  readonly textAlign?: Css<'textAlign'>
  readonly textDecoration?: Css<'textDecoration'>
  readonly textTransform?: Css<'textTransform'>
  readonly color?: Scale<KeyOf<Field<T, 'color'>>>
}

/** A border token. An object splits into width, style, and a color token. */
type BorderToken<T> =
  | string
  | {
    readonly width?: Css<'borderWidth'>
    readonly style?: Css<'borderStyle'>
    readonly color?: Scale<KeyOf<Field<T, 'color'>>>
  }

/** A shadow token. The object is offset, blur, spread, and a color token. */
type ShadowToken<T> =
  | string
  | {
    readonly inset?: boolean
    readonly offsetX: string | number
    readonly offsetY: string | number
    readonly blur?: string | number
    readonly spread?: string | number
    readonly color?: Scale<KeyOf<Field<T, 'color'>>>
  }

type Rest<T> = Widen<Omit<Properties, Scaled>>
  & SpaceFields<KeyOf<Field<T, 'space'>>>
  & ColorFields<KeyOf<Field<T, 'color'>>>
  & BorderFields<KeyOf<Field<T, 'border'>>>
  & ShadowFields<KeyOf<Field<T, 'shadow'>>> & {
    readonly fontFamily?: Scale<KeyOf<Field<T, 'font'>>>
    readonly animationName?: KeyOf<Field<T, 'keyframes'>>
  }

type Face<T> = Rest<T> & {
  readonly text?: KeyOf<Field<T, 'text'>>
  readonly layer?: KeyOf<Field<T, 'layer'>>
}

type Conditions<T> = {
  readonly hover?: Face<T>
  readonly focus?: Face<T>
  readonly active?: Face<T>
} & {
  readonly [K in KeyOf<Field<T, 'media'>>]?: Face<T>
}

/** One `style` argument: properties, and one level of `hover`, `focus`, `active`, or a media key. */
type Decl<T> = Face<T> & Conditions<T>

/**
 * The table `tokens` reads.
 * `text` and `layer` are named sets. `border` and `shadow` are composite tokens.
 * `T` is the table itself, so a set can name a sibling token.
 */
export type Tokens<T = object> = {
  readonly color?: { readonly [name: string]: string }
  readonly space?: { readonly [name: string]: string }
  readonly font?: { readonly [name: string]: string }
  readonly media?: { readonly [name: string]: string }
  readonly keyframes?: { readonly [name: string]: Frames }
  readonly text?: { readonly [name: string]: TextFace<T> }
  readonly layer?: { readonly [name: string]: Rest<T> }
  readonly border?: { readonly [name: string]: BorderToken<T> }
  readonly shadow?: { readonly [name: string]: ShadowToken<T> }
}

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

const BORDER: Readonly<Record<string, readonly [string, string, string]>> = {
  border: ['borderWidth', 'borderStyle', 'borderColor'],
  borderTop: ['borderTopWidth', 'borderTopStyle', 'borderTopColor'],
  borderRight: ['borderRightWidth', 'borderRightStyle', 'borderRightColor'],
  borderBottom: ['borderBottomWidth', 'borderBottomStyle', 'borderBottomColor'],
  borderLeft: ['borderLeftWidth', 'borderLeftStyle', 'borderLeftColor'],
  outline: ['outlineWidth', 'outlineStyle', 'outlineColor'],
}

const SHADOW: ReadonlySet<string> = new Set (['boxShadow', 'textShadow'])

const takesColor = (prop: string): boolean =>
  COLOR.has (prop) || prop.endsWith ('Color')

const SAFE = /^[A-Za-z0-9_-]+$/

const HOVER = '@media (hover: hover) and (pointer: fine)'

type Table = {
  readonly color: Readonly<Record<string, string>>
  readonly space: Readonly<Record<string, string>>
  readonly font: Readonly<Record<string, string>>
  readonly media: Readonly<Record<string, string>>
  readonly keyframes: Readonly<Record<string, unknown>>
  readonly text: Readonly<Record<string, unknown>>
  readonly layer: Readonly<Record<string, unknown>>
  readonly border: Readonly<Record<string, unknown>>
  readonly shadow: Readonly<Record<string, unknown>>
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

const recordMap = (value: unknown): Record<string, unknown> => {
  if (!isRecord (value)) return {}
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries (value)) out[key] = item
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
    text: recordMap (raw.text),
    layer: recordMap (raw.layer),
    border: recordMap (raw.border),
    shadow: recordMap (raw.shadow),
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
  if (typeof value === 'string' && takesColor (prop) && Object.hasOwn (table.color, value)) {
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

const bit = (value: unknown): string | undefined => {
  if (typeof value === 'number') return String (value)
  if (typeof value !== 'string') return undefined
  return arbitrary (value) ?? value
}

const shadowOf = (table: Table) => (
  token: unknown,
): { readonly css: string; readonly colors: readonly string[] } | undefined => {
  if (typeof token === 'string') return { css: token, colors: [] }
  if (!isRecord (token)) return undefined
  const x = bit (token.offsetX)
  const y = bit (token.offsetY)
  if (x === undefined || y === undefined) return undefined
  const blur = bit (token.blur)
  const spread = bit (token.spread)
  const colors: string[] = []
  let color: string | undefined
  if (typeof token.color === 'string') {
    const raw = arbitrary (token.color)
    if (raw !== undefined) color = raw
    else if (Object.hasOwn (table.color, token.color)) {
      colors.push (token.color)
      color = `var(${varName ('color', token.color)})`
    } else color = token.color
  }
  const parts: string[] = []
  if (token.inset === true) parts.push ('inset')
  parts.push (x, y)
  if (blur !== undefined || spread !== undefined) parts.push (blur ?? '0')
  if (spread !== undefined) parts.push (spread)
  if (color !== undefined) parts.push (color)
  return { css: parts.join (' '), colors }
}

const written = (
  table: Table,
  condition: string | undefined,
  prop: string,
  use: Exclude<Use, { readonly tag: 'frames' }>,
): readonly Atom[] => {
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

const oneAtom = (
  table: Table,
  condition: string | undefined,
  prop: string,
  value: unknown,
): readonly Atom[] => {
  if (SHADOW.has (prop) && typeof value === 'string' && Object.hasOwn (table.shadow, value)) {
    const painted = shadowOf (table) (table.shadow[value])
    if (painted === undefined) return []
    const vars = painted.colors.flatMap ((key) => {
      const color = table.color[key]
      return color === undefined ? [] : [variable ('color') (key) (color)]
    })
    return [...vars, ...written (table, condition, prop, { tag: 'literal', css: painted.css })]
  }
  const use = interpret (table) (prop) (value)
  if (use === undefined) return []
  if (use.tag === 'frames') {
    const atom = framed (use.key) (table.keyframes[use.key])
    return atom === undefined ? [] : [atom]
  }
  return written (table, condition, prop, use)
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

const place = (into: Map<string, Slot>) => (condition: string) => (prop: string) => (
  value: unknown,
): void => {
  into.set (`${condition}\0${prop}`, { condition, prop, value })
}

const applyProp = (table: Table) => (condition: string) => (prop: string) => (
  value: unknown,
) => (into: Map<string, Slot>): void => {
  const put = place (into) (condition)
  const long = BORDER[prop]
  if (long !== undefined && typeof value === 'string' && Object.hasOwn (table.border, value)) {
    const token = table.border[value]
    if (typeof token === 'string') {
      put (prop) (token)
      return
    }
    if (isRecord (token)) {
      const [width, style, color] = long
      if (token.width !== undefined) put (width) (token.width)
      if (token.style !== undefined) put (style) (token.style)
      if (token.color !== undefined) put (color) (token.color)
      return
    }
  }
  put (prop) (value)
}

/**
 * `text` and `layer` expand first, in source order.
 * A property on the same declaration then overwrites that slot.
 */
const applyDecl = (table: Table) => (decl: object) => (condition: string) => (
  sets: boolean,
) => (into: Map<string, Slot>): void => {
  if (!isRecord (decl)) return
  const nested: [string, object][] = []
  const chosen: [string, string][] = []
  const props: [string, unknown][] = []
  for (const [key, value] of Object.entries (decl)) {
    if (sets && condition === '' && isCondition (table, key) && isRecord (value)) {
      nested.push ([key, value])
      continue
    }
    if (isCondition (table, key)) continue
    if (key === 'text' || key === 'layer') {
      if (sets && typeof value === 'string') chosen.push ([key, value])
      continue
    }
    props.push ([key, value])
  }
  for (const [key, name] of chosen) {
    const body = (key === 'text' ? table.text : table.layer)[name]
    if (isRecord (body)) applyDecl (table) (body) (condition) (false) (into)
  }
  for (const [key, value] of props) applyProp (table) (condition) (key) (value) (into)
  for (const [key, value] of nested) applyDecl (table) (value) (key) (true) (into)
}

const slotsOf = (table: Table) => (decl: object) => (into: Map<string, Slot>): void => {
  applyDecl (table) (decl) ('') (true) (into)
}

const atomsOf = (table: Table) => (decl: object): readonly Atom[] => {
  const slots = new Map<string, Slot> ()
  slotsOf (table) (decl) (slots)
  const out: Atom[] = []
  for (const slot of slots.values ()) {
    const condition = slot.condition === '' ? undefined : slot.condition
    out.push (...oneAtom (table, condition, slot.prop, slot.value))
  }
  return out
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
export function tokens<const T extends Tokens<T>>(table: T): Theme<T> {
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
