import * as P from '@algosail/ply'
import type { Classes, Compiled } from '../document/css.ts'
import { compile } from '../document/css.ts'
import { endOfCall } from './literal.ts'

const CALL = /(?<![\w$.])css\s*(`|\()/

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]*)\2/g

const LITERAL = /^`(?:\\[\s\S]|[^`\\])*`/

const ESCAPED = /\\[\s\S]/g

const isThere = (at: number): boolean => at >= 0

/** One template literal in a source: where it is, and what is inside it. */
type Literal = {
  readonly start: number
  readonly end: number
  readonly raw: string
  /** A block built from a value only the browser will know cannot be read. */
  readonly interpolated: boolean
}

const hasHole = (raw: string): boolean =>
  raw.replace (ESCAPED, '').includes ('${')

const asLiteral = (tick: number) => (found: string): Literal => ({
  start: tick,
  end: tick + found.length,
  raw: found.slice (1, -1),
  interpolated: hasHole (found),
})

const wholeOf = (one: P.Matched): string => one.match

const literalFrom = (said: string): P.Maybe<string> =>
  P.map (wholeOf) (P.match (LITERAL) (said))

const literalAt = (source: string) => (tick: number): P.Maybe<Literal> =>
  P.map (asLiteral (tick)) (literalFrom (source.slice (tick)))

/** Where a `css` call starts, and which mark follows the name. */
type Mark = {
  readonly at: number
  readonly kind: '`' | '('
}

const asMark = (at: number) => (kind: '`' | '('): Mark => ({ at, kind })

const markIn = (source: string): P.Maybe<Mark> => {
  const found = source.match (CALL)
  const kind = found?.[1]
  return found === null || found.index === undefined || (kind !== '`' && kind !== '(')
    ? P.nothing ()
    : P.just (asMark (found.index) (kind))
}

const tickFrom = (source: string) => (at: number): P.Maybe<number> =>
  P.fromPredicate (isThere) (source.indexOf ('`', at))

/** A `css` call the scanner can see: a template, or a call left as written. */
type Spot =
  | { readonly tag: 'literal'; readonly at: number; readonly literal: Literal }
  | { readonly tag: 'leave'; readonly at: number; readonly end: number }

const literalNear = (source: string): (at: number) => P.Maybe<Literal> =>
  P.pipe ([tickFrom (source), P.chain (literalAt (source))])

const asLiteralSpot = (at: number) => (literal: Literal): Spot => ({
  tag: 'literal',
  at,
  literal,
})

const spotFromLiteral = (source: string) => (mark: Mark): P.Maybe<Spot> =>
  P.map (asLiteralSpot (mark.at)) (literalNear (source) (mark.at))

const asLeave = (at: number) => (end: number): Spot => ({ tag: 'leave', at, end })

const spotFromCall = (source: string) => (mark: Mark): P.Maybe<Spot> => {
  const open = source.indexOf ('(', mark.at)
  if (open < 0) return P.nothing ()
  const end = endOfCall (source) (open)
  return end < 0 ? P.nothing () : P.just (asLeave (mark.at) (end))
}

const spotFrom = (source: string) => (mark: Mark): P.Maybe<Spot> =>
  mark.kind === '`'
    ? spotFromLiteral (source) (mark)
    : spotFromCall (source) (mark)

const spotIn = (source: string): P.Maybe<Spot> =>
  P.chain (spotFrom (source)) (markIn (source))

const isPlain = (literal: Literal): boolean => !literal.interpolated

const compiled = (literal: Literal): Compiled => compile (literal.raw)

const isKnown = (known: ReadonlySet<string>) => (block: Compiled): boolean =>
  known.has (block.id)

const classesOf = (block: Compiled): Classes => block.classes

const knownIn = (
  known: ReadonlySet<string>,
): (literal: Literal) => P.Maybe<Classes> =>
  P.pipe ([
    P.fromPredicate (isPlain),
    P.map (compiled),
    P.filter (isKnown (known)),
    P.map (classesOf),
  ])

/** A piece of the answer, and whether anything in it was replaced. */
type Rewrite = {
  readonly text: string
  readonly changed: boolean
}

const Rewritten: P.MonoidDict<P.Nullary<Rewrite>> = {
  empty: (): Rewrite => ({ text: '', changed: false }),
  concat: (a: Rewrite, b: Rewrite): Rewrite => ({
    text: P.concat (a.text) (b.text),
    changed: a.changed || b.changed,
  }),
}

const asIs = (text: string): Rewrite => ({ text, changed: false })

const asClasses = (classes: Classes): Rewrite => ({
  text: JSON.stringify (classes),
  changed: true,
})

const endOf = (one: Spot): number =>
  one.tag === 'literal' ? one.literal.end : one.end

const beforeIn = (source: string) => (one: Spot): Rewrite =>
  asIs (source.slice (0, one.at))

const verbatim = (source: string) => (one: Spot): Rewrite =>
  asIs (source.slice (one.at, endOf (one)))

const afterIn = (source: string) => (one: Spot): string =>
  source.slice (endOf (one))

const saidFor =
  (known: ReadonlySet<string>) => (source: string) => (one: Spot): Rewrite => {
    if (one.tag === 'leave') return verbatim (source) (one)
    return P.maybe_ (() => verbatim (source) (one)) (asClasses) (knownIn (known) (one.literal))
  }

const scanning = (known: ReadonlySet<string>) => (source: string): Rewrite =>
  P.maybe_ (
    () => asIs (source),
  ) (
    (one: Spot): Rewrite =>
      P.mconcat (Rewritten) ([
        beforeIn (source) (one),
        saidFor (known) (source) (one),
        scanning (known) (afterIn (source) (one)),
      ]),
  ) (spotIn (source))

const wasChanged = (one: Rewrite): boolean => one.changed

const textOf = (one: Rewrite): string => one.text

const ifChanged: (done: Rewrite) => P.Maybe<string> = P.pipe ([
  P.fromPredicate (wasChanged),
  P.map (textOf),
])

/**
 * The same source with every known block replaced by its class names, or nothing where there was nothing to replace.
 * @example
 * ```ts
 * // replaceBlocks :: String -> Set String -> Maybe String
 * replaceBlocks ('const s = css`.a { color: red }`', new Set (['1c9dgl']))
 * // => just ('const s = {"a":"a_1c9dgl"}')
 * ```
 */
export const replaceBlocks = (
  source: string,
  known: ReadonlySet<string>,
): P.Maybe<string> => ifChanged (scanning (known) (source))

/**
 * The same source with its relative imports written out in full, so it reads the same from anywhere.
 * @example
 * ```ts
 * absolute ("from './a.ts'", 'file:///app/b.ts')
 * // => "from 'file:///app/a.ts'"
 * ```
 */
export function absolute(source: string, moduleUrl: string): string {
  return source.replace (
    SPECIFIER,
    (_whole: string, head: string, quote: string, spec: string) =>
      `${head}${quote}${new URL (spec, moduleUrl).href}${quote}`,
  )
}
