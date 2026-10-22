import * as P from '@algosail/ply'
import type { Params } from './types.ts'

/** One piece of a route pattern: a literal, a single-segment capture, or a capture that swallows everything left. */
export type Segment =
  | { readonly tag: 'static'; readonly value: string }
  | { readonly tag: 'param'; readonly name: string }
  | { readonly tag: 'rest'; readonly name: string }

/** A parsed route pattern. */
export type Pattern = readonly Segment[]

/**
 * What a segment is, answered once per question.
 * @example
 * ```ts
 * // segment :: Cases Segment b -> Segment -> b
 * const nameOf = segment ({ static: constant (''), param: ownName, rest: ownName })
 * ```
 */
export const segment = <B>(on: P.Cases<Segment, B>): (seg: Segment) => B =>
  P.cases<Segment, B> (on)

const ownName = (seg: { readonly name: string }): string => seg.name

/** The name a capture goes by; a literal goes by none. */
export const nameOf: (seg: Segment) => string = segment ({
  static: P.K (''),
  param: ownName,
  rest: ownName,
})

const isRest: (seg: Segment) => boolean = segment ({
  static: P.K (false),
  param: P.K (false),
  rest: P.K (true),
})

const isEmpty = (s: string): boolean => s === ''

const segmentsOf = (path: string): readonly string[] =>
  P.reject (isEmpty) (P.splitOn ('/') (path))

const asRest = (name: string): Segment => ({ tag: 'rest', name })
const asParam = (name: string): Segment => ({ tag: 'param', name })
const asStatic = (value: string): Segment => ({ tag: 'static', value })

const captureOf = (name: string): Segment =>
  P.maybe_ (P.K (asParam (name))) (asRest) (P.stripPrefix ('...') (name))

const bracketsOf = (raw: string): P.Maybe<string> =>
  P.chain (P.stripSuffix (']')) (P.stripPrefix ('[') (raw))

const parseSegment = (raw: string): Segment =>
  P.maybe_ (P.K (asStatic (raw))) (captureOf) (bracketsOf (raw))

const hasEarlyRest = (parsed: Pattern): boolean =>
  P.any (isRest) (P.fromMaybe<readonly Segment[]> ([]) (P.init (parsed)))

const hasBrackets = (parsed: Pattern): boolean =>
  P.any ((s: Segment) => /[[\]]/.test (nameOf (s))) (parsed)

const whyEarlyRest = (pattern: string): string =>
  `route pattern ${pattern}: a rest segment must come last`

const whyBrackets = (pattern: string): string =>
  `route pattern ${pattern}: a capture's name cannot hold brackets. ` +
  "kit has no optional segment; `[[lang]]` is the i18n package's marker, " +
  'and `translated` takes it out before a route is built'

/** What a pattern can be wrong about, and what to say when it is. */
type Complaint = readonly [
  (parsed: Pattern) => boolean,
  (pattern: string) => string,
]

const complaints: readonly Complaint[] = [
  [hasEarlyRest, whyEarlyRest],
  [hasBrackets, whyBrackets],
]

const complaintOf = (pattern: string) => (parsed: Pattern): P.Maybe<string> =>
  P.findMap<Complaint, string> (([holds, say]: Complaint) =>
    P.voidRight (say (pattern)) (P.fromPredicate (holds) (parsed)),
  ) (complaints)

const refuse = (said: string): never => {
  throw new Error (said)
}

const checked = (pattern: string) => (parsed: Pattern): Pattern =>
  P.maybe_ (P.K (parsed)) (refuse) (complaintOf (pattern) (parsed))

/**
 * Parses a whole pattern.
 * @example
 * ```ts
 * // parsePattern :: String -> Pattern
 * parsePattern ('/blog/[slug]')
 * // => [{ tag: 'static', value: 'blog' }, { tag: 'param', name: 'slug' }]
 * ```
 */
export const parsePattern = (pattern: string): Pattern =>
  checked (pattern) (P.map (parseSegment) (segmentsOf (pattern)))

const isCapture: (seg: Segment) => boolean = segment ({
  static: P.K (false),
  param: P.K (true),
  rest: P.K (true),
})

/**
 * Whether a pattern captures anything.
 * @example
 * ```ts
 * // hasCaptures :: String -> Boolean
 * hasCaptures ('/blog/[slug]') // => true
 * hasCaptures ('/about') // => false
 * ```
 */
export const hasCaptures: (pattern: string) => boolean = P.pipe ([
  parsePattern,
  P.any (isCapture),
])

type Caught = readonly P.Pair<string, string>[]

/** No match at all, and a match that caught nothing. */
const missed: P.Maybe<Caught> = P.nothing<Caught> ()
const nothingToCatch: P.Maybe<Caught> = P.just<Caught> ([])

const decoded = (part: string): string =>
  P.fromMaybe (part) (P.maybeEncase (decodeURIComponent) (part))

const partsOf: (path: string) => readonly string[] = P.pipe ([
  segmentsOf,
  P.map (decoded),
])

const caughtOne = (name: string, part: string): P.Maybe<Caught> =>
  P.just<Caught> ([P.pair (name, part)])

const meets = (seg: Segment, part: string): P.Maybe<Caught> =>
  segment<P.Maybe<Caught>> ({
    static: (s) => P.boolean (missed) (nothingToCatch) (s.value === part),
    param: (s) => caughtOne (s.name, part),
    rest: (s) => caughtOne (s.name, part),
  }) (seg)

const pairedWith = (seg: Segment, part: string): readonly [Segment, string] => [
  seg,
  part,
]

const meetsPair = (both: readonly [Segment, string]): P.Maybe<Caught> =>
  meets (both[0], both[1])

const meetsEach = (segs: Pattern, parts: readonly string[]): P.Maybe<Caught> =>
  P.map ((each: readonly Caught[]): Caught => P.join (each)) (
    P.traverse (P.Maybe) (meetsPair) (P.zipWith (pairedWith) (segs) (parts)),
  )

const hasAsMany = (segs: Pattern) => (parts: readonly string[]): boolean =>
  segs.length === parts.length

/** These segments against exactly these parts. */
const meetsExactly =
  (segs: Pattern) => (parts: readonly string[]): P.Maybe<Caught> =>
    P.chain ((same: readonly string[]) => meetsEach (segs, same)) (
      P.fromPredicate (hasAsMany (segs)) (parts),
    )

/** What becomes of the parts left over once the fixed segments have had theirs. */
type Tail = (leftover: readonly string[]) => P.Maybe<Caught>

const isNone = (xs: readonly unknown[]): boolean => xs.length === 0

const nothingLeft: Tail = (leftover: readonly string[]): P.Maybe<Caught> =>
  P.map (P.K<Caught> ([])) (P.fromPredicate (isNone) (leftover))

const swallowedBy =
  (name: string): Tail => (leftover: readonly string[]): P.Maybe<Caught> =>
    caughtOne (name, P.joinWith ('/') (leftover))

const noName = P.K (P.nothing<string> ())

/** The name a trailing rest segment goes by, where the pattern has one. */
const restOf = (pattern: Pattern): P.Maybe<string> =>
  P.chain (segment ({
    static: noName,
    param: noName,
    rest: (s) => P.just (s.name),
  })) (P.last (pattern))

/** How a pattern is read: the segments that must meet, and what takes the rest. */
type Reading = { readonly fixed: Pattern; readonly tail: Tail }

const exactly = (pattern: Pattern): Reading => ({
  fixed: pattern,
  tail: nothingLeft,
})

const upToRest = (pattern: Pattern) => (name: string): Reading => ({
  fixed: P.fromMaybe<readonly Segment[]> ([]) (P.init (pattern)),
  tail: swallowedBy (name),
})

const readingOf = (pattern: Pattern): Reading =>
  P.maybe_ (P.K (exactly (pattern))) (upToRest (pattern)) (restOf (pattern))

const andAlso = (a: Caught) => (b: Caught): Caught => P.concat (a) (b)

const paramsOf = (all: Caught): Params => P.fromPairs (all)

/**
 * Matches a path against a pattern, handing back the captures on success.
 * @example
 * ```ts
 * // match :: Pattern -> String -> Maybe Params
 * match (parsePattern ('/blog/[slug]')) ('/blog/hello')
 * // => just({ slug: 'hello' })
 * match (parsePattern ('/blog/[slug]')) ('/blog/yes')
 * // => just({ slug: 'yes' })
 * match (parsePattern ('/blog/[slug]')) ('/blog')
 * // => nothing()
 * ```
 */
export function match(pattern: Pattern): (path: string) => P.Maybe<Params> {
  const reading = readingOf (pattern)
  const upTo = reading.fixed.length
  const meetsFixed = meetsExactly (reading.fixed)

  const against = (parts: readonly string[]): P.Maybe<Caught> =>
    P.lift2 (andAlso) (
      meetsFixed (P.fromMaybe<readonly string[]> ([]) (P.take (upTo) (parts))),
    ) (
      reading.tail (P.fromMaybe<readonly string[]> ([]) (P.drop (upTo) (parts))),
    )

  return P.pipe ([partsOf, against, P.map (paramsOf)])
}

/** How tightly a segment pins a path down. */
const precision: (seg: Segment) => number = segment ({
  static: P.K (2),
  param: P.K (1),
  rest: P.K (0),
})

const byPrecision = (a: number, b: number): P.Ordering => P.compare (b, a)

const ABSENT = 0.5

const precisionAt = (p: Pattern) => (i: number): number =>
  i < p.length ? precision (p[i]) : ABSENT

/**
 * Orders two patterns from most specific to least, so a route table can be sorted once and then matched in order.
 * @example
 * ```ts
 * // compare :: Pattern -> Pattern -> Ordering
 * compare (parsePattern ('/blog/new')) (parsePattern ('/blog/[slug]'))
 * // => lt   — the literal sorts first
 * ```
 */
export const compare = (a: Pattern) => (b: Pattern): P.Ordering =>
  P.mconcat (P.Ordering) (
    P.map ((i: number) => byPrecision (precisionAt (a) (i), precisionAt (b) (i))) (
      P.range (0) (Math.max (a.length, b.length)),
    ),
  )

const leadsAway: readonly P.Predicate<string>[] = [
  P.predicate ((value: string) => !value.startsWith ('/')),
  P.predicate ((value: string) => value.startsWith ('//')),
  P.predicate ((value: string) => value.includes ('\\')),
]

const staysHere: (value: string) => boolean = P.predicateNot (
  P.anyPass (leadsAway),
)

/**
 * A path that leads back into this site, and nothing else.
 * @example
 * ```ts
 * localPath ('/blog') // => just ('/blog')
 * localPath ('//evil.test') // => nothing ()
 * localPath ('https://evil.test')// => nothing ()
 * ```
 */
export const localPath: (value: string) => P.Maybe<string> = P.fromPredicate (
  staysHere,
)
