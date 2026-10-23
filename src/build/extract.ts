import * as P from '@algosail/ply'
import type { Classes, Compiled } from '../document/css.ts'
import { compile } from '../document/css.ts'

const CALL = /(?<![\w$.])css\s*`/

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

/** Where a `css` call starts, and the template that follows it. */
type Found = {
  readonly at: number
  readonly literal: Literal
}

const callAt = (source: string): P.Maybe<number> =>
  P.fromPredicate (isThere) (source.search (CALL))

const tickFrom = (source: string) => (at: number): P.Maybe<number> =>
  P.fromPredicate (isThere) (source.indexOf ('`', at))

const asFound = (at: number) => (literal: Literal): Found => ({ at, literal })

const literalNear = (source: string): (at: number) => P.Maybe<Literal> =>
  P.pipe ([tickFrom (source), P.chain (literalAt (source))])

const foundFrom = (source: string) => (at: number): P.Maybe<Found> =>
  P.map (asFound (at)) (literalNear (source) (at))

const foundIn = (source: string): P.Maybe<Found> =>
  P.chain (foundFrom (source)) (callAt (source))

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

const beforeIn = (source: string) => (one: Found): Rewrite =>
  asIs (source.slice (0, one.at))

const verbatim = (source: string) => (one: Found): Rewrite =>
  asIs (source.slice (one.at, one.literal.end))

const afterIn = (source: string) => (one: Found): string =>
  source.slice (one.literal.end)

const saidFor =
  (known: ReadonlySet<string>) => (source: string) => (one: Found): Rewrite =>
    P.maybe_ (() => verbatim (source) (one))
             (asClasses)
             (knownIn (known) (one.literal))

const scanning = (known: ReadonlySet<string>) => (source: string): Rewrite =>
  P.maybe_ (
    () => asIs (source),
  ) (
    (one: Found): Rewrite =>
      P.mconcat (Rewritten) ([
        beforeIn (source) (one),
        saidFor (known) (source) (one),
        scanning (known) (afterIn (source) (one)),
      ]),
  ) (foundIn (source))

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
