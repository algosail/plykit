import * as P from '@algosail/ply'
import type { ClassesOf, Style } from './style.ts'
import { declaredNames, emit } from './style.ts'

export type { Style } from './style.ts'

/** The hash a block is known by, and what a class in it ends with. */
export type BlockId = string

/** A class name as written in the block, and as it leaves it. */
export type ClassName = string

/** The class names a block declared, keyed by the name as written. */
export type Classes = Readonly<P.StrMap<ClassName>>

/** A block worked out from its source: what it is called, and what it says. */
export type Compiled = {
  readonly id: BlockId
  readonly classes: Classes
  readonly text: string
}

type Registered = {
  readonly text: string
  readonly named: boolean
}

const CLASS_ATTR = /class="([^"]*)"/g

const VERBATIM = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|url\([^)]*\)/g
const CLASS = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g

const cell = new Map<BlockId, Registered> ()

const knows = (id: BlockId): boolean => cell.has (id)
const remember = (id: BlockId, block: Registered): void =>
  void cell.set (id, block)
const remembered = (): readonly P.Pair<BlockId, Registered>[] =>
  P.map ((one: readonly [BlockId, Registered]) => P.fromTuple (one)) (
    P.fromIterable (cell),
  )
const forgetAll = (): void => cell.clear ()

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

const step = (h: number, c: string): number =>
  Math.imul (h ^ c.charCodeAt (0), FNV_PRIME) >>> 0

/**
 * FNV-1a, 32 bit, as a fold over the characters.
 * @example
 * ```ts
 * hash ('.a { color: red }') // => '1c9dgl'
 * ```
 */
export const hash = (text: string): BlockId =>
  P.reduce (step) (FNV_OFFSET) (text.split ('')).toString (36)

/** One stretch of a block. */
type Chunk =
  | { readonly tag: 'verbatim'; readonly text: string }
  | { readonly tag: 'selectors'; readonly text: string }

const asVerbatim = (text: string): Chunk => ({ tag: 'verbatim', text })
const asSelectors = (text: string): Chunk => ({ tag: 'selectors', text })

type Walk = { readonly cut: number; readonly chunks: readonly Chunk[] }

const start: Walk = { cut: 0, chunks: [] }

const upTo = (raw: string) => (walk: Walk, skip: RegExpExecArray): Walk => ({
  cut: skip.index + skip[0].length,
  chunks: [
    ...walk.chunks,
    asSelectors (raw.slice (walk.cut, skip.index)),
    asVerbatim (skip[0]),
  ],
})

/** A block cut into the stretches that may be renamed and those that may not. */
const chunksOf = (raw: string): readonly Chunk[] => {
  const walked = P.reduce (upTo (raw)) (start) (
    P.fromIterable (raw.matchAll (VERBATIM)),
  )
  return P.append (asSelectors (raw.slice (walked.cut))) (walked.chunks)
}

const textOf = P.cases<Chunk, string> ({
  verbatim: P.K (''),
  selectors: (c) => c.text,
})

/** Every class name the block declares, in the order it declares them. */
const namesIn: (chunks: readonly Chunk[]) => readonly ClassName[] = P.pipe ([
  P.chain ((one: Chunk) => captured (textOf (one))),
  P.nub,
])

const captured = (text: string): readonly ClassName[] =>
  P.justs (P.firstCaptures (CLASS) (text))

const scopedTo =
  (id: BlockId) => (name: ClassName): P.Pair<string, ClassName> =>
    P.pair (name, `${name}_${id}`)

const classesFor = (id: BlockId): (names: readonly ClassName[]) => Classes =>
  P.pipe ([P.map (scopedTo (id)), P.fromPairs])

const renamed = (classes: Classes) => (text: string): string =>
  text.replace (
    CLASS,
    (whole: string, name: ClassName) =>
      P.maybe_ (
        P.K (whole),
      ) (
        (scoped: ClassName) => `.${scoped}`,
      ) (P.lookup (name) (classes)),
  )

const rewritten = (classes: Classes) =>
  P.cases<Chunk, string> ({
    verbatim: (c) => c.text,
    selectors: (c) => renamed (classes) (c.text),
  })

/**
 * What `css` does before it registers anything: the block's id, its scoped text, and the class names that come out of it.
 * @example
 * ```ts
 * compile ('.a { color: red }').classes // => { a: 'a_1c9dgl' }
 * ```
 */
export const compile = (raw: string): Compiled => {
  const id = hash (raw)
  const chunks = chunksOf (raw)
  const classes = P.pipe ([namesIn, classesFor (id)]) (chunks)
  return {
    id,
    classes,
    text: P.foldMap (P.Concat) (rewritten (classes)) (chunks),
  }
}

const browserSigns: readonly (() => boolean)[] = [
  () => typeof document !== 'undefined',
  () => typeof document.createElement === 'function',
  () => document.head !== null,
]

const itHolds = (sign: () => boolean): boolean => sign ()

const isBrowser = (): boolean => P.all (itHolds) (browserSigns)

const linkedIds = (): readonly BlockId[] =>
  P.maybe_ (
    P.K<readonly BlockId[]> ([]),
  ) (
    (said: string) => said.split (' '),
  ) (
    P.chain ((sheet: Element) =>
      P.fromNullable (sheet.getAttribute ('data-kit-styles')),
    ) (P.fromNullable (document.querySelector ('link[data-kit-styles]'))),
  )

const isLinked = (id: BlockId): boolean => P.elem (id) (linkedIds ())

const isInjected = (id: BlockId): boolean =>
  document.querySelector (`style[data-kit="${id}"]`) !== null

const isAlreadyThere = (id: BlockId): boolean => isLinked (id) || isInjected (id)

const putTag = (text: string) => (id: BlockId): void => {
  const tag = document.createElement ('style')
  tag.setAttribute ('data-kit', id)
  tag.textContent = text
  document.head.appendChild (tag)
}

const inject = (id: BlockId, text: string): void =>
  void P.unless (isAlreadyThere) (P.tap (putTag (text))) (id)

const isEmpty = (m: Classes): boolean => P.sortedKeys (m).length === 0

const asRegistered = (block: Compiled): Registered => ({
  text: block.text,
  named: !isEmpty (block.classes),
})

const registerOnce = (block: Compiled): void =>
  void P.unless ((one: Compiled) => knows (one.id)) (
    P.tap ((one: Compiled) => {
      remember (one.id, asRegistered (one))
      P.when (isBrowser) (P.tap (() => inject (one.id, one.text))) (one)
    }),
  ) (block)

const withNames =
  (block: Compiled) => (names: readonly string[]): Classes =>
    P.reduce ((classes: Classes, name: string): Classes =>
      P.has (name) (classes)
        ? classes
        : P.insert (name) (`${name}_${block.id}`) (classes),
    ) (block.classes) (names)

/**
 * The block an object sheet compiles to, and the class map `css` hands back.
 * Names that the sheet lists but the text never uses are still in the map.
 * @example
 * ```ts
 * compiledSheet ({ card: { padding: '1rem' } }).classes.card // => 'card_…'
 * ```
 */
export const compiledSheet = (
  sheet: object,
): { readonly block: Compiled; readonly classes: Classes } => {
  const block = compile (emit (sheet))
  return { block, classes: withNames (block) (declaredNames (sheet)) }
}

const isTemplate = (value: object): value is TemplateStringsArray =>
  Array.isArray (value)

/**
 * Scoped CSS, from a template string or from an object of rules.
 * The object may sit below the function that reads its class names.
 * @example
 * ```ts
 * // css :: Sheet -> ClassesOf
 * const view = () => el ('div', { class: theme.card }, ['…'])
 * const theme = css ({ card: { padding: '1rem' } })
 * // => <div class="card_1f4k2j">…</div>
 * ```
 */
export function css<const T>(
  sheet: { readonly [K in keyof T]: Style },
): ClassesOf<T>
export function css(
  strings: TemplateStringsArray,
  ...values: readonly (string | number)[]
): Classes
export function css<const T>(
  stringsOrSheet: TemplateStringsArray | { readonly [K in keyof T]: Style },
  ...values: readonly (string | number)[]
): Classes | ClassesOf<T> {
  if (isTemplate (stringsOrSheet)) {
    const block = compile (String.raw ({ raw: stringsOrSheet }, ...values))
    registerOnce (block)
    return block.classes
  }
  const settled = compiledSheet (stringsOrSheet)
  registerOnce (settled.block)
  return settled.classes
}

const forStyleTag = P.replaceAll ('</', '<\\/')

const asStyleTag = (one: P.Pair<BlockId, Registered>): string =>
  `<style data-kit="${one.fst}">${forStyleTag (one.snd.text)}</style>`

const classesWorn = (markup: string): string => {
  let worn = ''
  CLASS_ATTR.lastIndex = 0
  for (
    let found = CLASS_ATTR.exec (markup);
    found !== null;
    found = CLASS_ATTR.exec (markup)
  ) worn += found[1] + ' '
  return worn
}

const isWorn = (worn: string) => (one: P.Pair<BlockId, Registered>): boolean =>
  !one.snd.named || P.includes (`_${one.fst}`) (worn)

const tagsFor =
  (markup: string) =>
  (keep: (one: P.Pair<BlockId, Registered>) => boolean): string => {
    const worn = isWorn (classesWorn (markup))
    return P.foldMap (P.Concat) (asStyleTag) (
      P.filter ((one: P.Pair<BlockId, Registered>) => worn (one) && keep (one)) (
        remembered (),
      ),
    )
  }

/**
 * The blocks a page uses, as `<style>` tags for its `<head>`.
 * @example
 * ```ts
 * // collectStyles :: String -> String
 * `<head>${collectStyles (body)}</head>`
 * // => '<head><style data-kit="1f4k2j">.card_1f4k2j{…}</style></head>'
 * ```
 */
export const collectStyles = (markup: string): string =>
  tagsFor (markup) (() => true)

/**
 * Blocks the markup wears that `known` does not already name.
 * A dev reload compiles a changed block before the next build rewrites the file, and the page carries that block until the file catches up.
 * @example
 * ```ts
 * // collectBeyond :: Array String -> String -> String
 * collectBeyond (styleIds ()) (body) // => ''
 * ```
 */
export const collectBeyond =
  (known: readonly string[]) => (markup: string): string =>
    tagsFor (markup) ((one: P.Pair<BlockId, Registered>) =>
      !P.elem (one.fst) (known),
    )

/**
 * Every registered block as plain CSS, for writing to a file.
 * @example
 * ```ts
 * // styleSheet :: () -> String
 * writeText ('static/app.css', styleSheet ())
 * ```
 */
export const styleSheet = (): string =>
  P.intercalate (P.Concat) ('\n') (
    P.map ((one: P.Pair<BlockId, Registered>) => one.snd.text) (remembered ()),
  )

/**
 * The id of every block in that sheet.
 * @example
 * ```ts
 * // styleIds :: () -> Array String
 * styleIds () // => ['1j0kpzm', '1pr45rm']
 * ```
 */
export const styleIds = (): readonly BlockId[] =>
  P.map ((one: P.Pair<BlockId, Registered>) => one.fst) (remembered ())

/**
 * Empties the registry.
 * @example
 * ```ts
 * // resetStyles :: () -> void
 * resetStyles ()
 * pipe ([tap (() => resetStyles ()), render]) (page)
 * ```
 */
export const resetStyles = (): void => forgetAll ()
