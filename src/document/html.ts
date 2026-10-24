import * as P from '@algosail/ply'
import type { Kind, ServerNode } from './node.ts'
import { isElement } from './node.ts'

const VOID: Set<string> = P.setFromIterable ([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

const OPAQUE: Set<string> = P.setFromIterable ([
  'script',
  'style',
  'textarea',
  'title',
])

const TABLE_SECTIONS: Set<string> = P.setFromIterable ([
  'caption',
  'colgroup',
  'thead',
  'tbody',
  'tfoot',
])

const CLOSES_P: Set<string> = P.setFromIterable ([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'fieldset',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
])

const isOneOf = (these: Set<string>) => (tag: string): boolean =>
  P.setMember (tag) (these)

/** One character, and what it has to be written as instead. */
type Escape = P.Pair<string, string>

const IN_TEXT: readonly Escape[] = [
  P.pair ('&', '&amp;'),
  P.pair ('<', '&lt;'),
  P.pair ('>', '&gt;'),
]

const IN_ATTRIBUTE: readonly Escape[] = [
  ...IN_TEXT,
  P.pair ('"', '&quot;'),
]

const escapedBy = (table: readonly Escape[]) => (s: string): string =>
  P.reduce ((said: string, one: Escape) => P.replaceAll (one.fst, one.snd) (said)) (
    s,
  ) (table)

/**
 * Escapes text content.
 * @example
 * ```ts
 * // escapeText :: String -> String
 * escapeText ('a & <b>')
 * // => 'a &amp; &lt;b&gt;'
 * ```
 */
export const escapeText: (s: string) => string = escapedBy (IN_TEXT)

/**
 * Escapes an attribute value, which additionally may not contain the quote that delimits it.
 * @example
 * ```ts
 * // escapeAttribute :: String -> String
 * escapeAttribute ('say "hi" & <go>')
 * // => 'say &quot;hi&quot; &amp; &lt;go&gt;'
 * ```
 */
export const escapeAttribute: (s: string) => string = escapedBy (IN_ATTRIBUTE)

/**
 * Escapes comment data.
 * @example
 * ```ts
 * // escapeComment :: String -> String
 * escapeComment ('note --> <img src=x>')
 * // => 'note --&gt; <img src=x&gt;'
 * ```
 */
export const escapeComment: (s: string) => string = P.replaceAll ('>', '&gt;')

const NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/

const isName = (one: string): boolean => NAME.test (one)

const cssName = (property: string): string =>
  property.replace (/[A-Z]/g, (c: string) => `-${c.toLowerCase ()}`)

const isSet = (one: P.Pair<string, string>): boolean => one.snd !== ''

const CSS_NAME = /^-{0,2}[A-Za-z][A-Za-z0-9-]*$/

const QUOTED = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g

const BREAKS = /[;{}]/

const isDeclaration = (one: P.Pair<string, string>): boolean =>
  isSet (one) && CSS_NAME.test (one.fst) &&
  !BREAKS.test (one.snd.replace (QUOTED, ''))

const asDeclaration = (one: P.Pair<string, string>): string =>
  `${cssName (one.fst)}: ${one.snd};`

const isWritten = (said: string): boolean => said !== ''

const asStyle = (said: string): string => ` style="${escapeAttribute (said)}"`

const styleOf = (node: ServerNode): Readonly<P.StrMap<string>> => node.style

const declarationsOf: (style: Readonly<P.StrMap<string>>) => string = P.pipe (
  P.sortedPairs,
  P.filter (isDeclaration),
  P.map (asDeclaration),
  P.joinWith (' '),
)

const styleAttribute: (node: ServerNode) => string = P.pipe (
  styleOf,
  declarationsOf,
  P.fromPredicate (isWritten),
  P.maybe_ (P.K ('')) (asStyle),
)

/**
 * One attribute as it is written inside a tag, leading space and all.
 * @example
 * ```ts
 * // asAttribute :: Pair String String -> String
 * asAttribute (pair ('rel', 'preload'))
 * // => ' rel="preload"'
 * ```
 */
export const asAttribute = (one: P.Pair<string, string>): string =>
  P.boolean ('') (` ${one.fst}="${escapeAttribute (one.snd)}"`) (isName (one.fst))

const attributesIn = (
  node: ServerNode,
): readonly (readonly [string, string])[] => P.fromIterable (node.attributes)

const attributesOf: (node: ServerNode) => string = P.pipe (
  attributesIn,
  P.map ((one: readonly [string, string]) => P.fromTuple (one)),
  P.foldMap (P.Concat) (asAttribute),
)

const openTag = (node: ServerNode): string =>
  `<${node.localName}${attributesOf (node)}${styleAttribute (node)}>`

const isVoid = (node: ServerNode): boolean => isOneOf (VOID) (node.localName)

const hasName = (node: ServerNode): boolean => isName (node.localName)

const asTag: (node: ServerNode) => string = P.ifElse (isVoid) (openTag) (
  (node: ServerNode) =>
    `${openTag (node)}${serializeChildren (node)}</${node.localName}>`,
)

const asElement: (node: ServerNode) => string = P.ifElse (hasName) (asTag) (
  P.K (''),
)

/**
 * Renders a node and everything under it, tag included.
 * @example
 * ```ts
 * // serializeNode :: ServerNode -> String
 * serializeNode (listNode)
 * // => '<ul data-kit-part="comments"><li>…</li></ul>'
 * ```
 */
export const serializeNode = (node: ServerNode): string =>
  P.cases<Kind, string> ({
    element: () => asElement (node),
    text: () => escapeText (node.data),
    comment: () => `<!--${escapeComment (node.data)}-->`,
  }) (node.kind)

/**
 * Renders a node's children without the node itself, which is what a render root wants: the container is scaffolding, not output.
 * @example
 * ```ts
 * // serializeChildren :: ServerNode -> String
 * serializeChildren (root ())
 * // => '<main>…</main>'
 * ```
 */
export const serializeChildren = (node: ServerNode): string =>
  P.foldMap (P.Concat) (serializeNode) (node.childNodes)

/** A place where the markup will parse back differently than it was built. */
export type Hazard = {
  readonly path: string
  readonly problem: string
}

/** One element, as much of it as a rule needs to judge. */
type Spot = {
  readonly tag: string
  /** What it sits directly inside, where it sits inside anything. */
  readonly parent: P.Maybe<string>
  /** Ancestors of this node, the root first. */
  readonly trail: readonly string[]
  readonly hasChildren: boolean
}

/** One way markup can come back different. */
type Rule = (spot: Spot) => P.Maybe<Hazard>

const pathOf = (spot: Spot): string =>
  P.joinWith (' > ') (P.append (spot.tag) (spot.trail))

const complains = (spot: Spot) => (problem: string): P.Maybe<Hazard> =>
  P.just ({ path: pathOf (spot), problem })

const fine = P.nothing<Hazard> ()

const isInside = (parent: string) => (spot: Spot): boolean =>
  P.fromMaybe (false) (P.map ((one: string) => one === parent) (spot.parent))

const nothingWrong = P.K (fine)

const opaqueWithChildren: Rule = P.ifElse (
  (spot: Spot) => isOneOf (OPAQUE) (spot.tag) && spot.hasChildren,
) ((spot: Spot) =>
  complains (spot) (
    `a parser reads <${spot.tag}> content as raw text, so the anchor ` +
      'comment inside it comes back as literal text and hydration ' +
      'will not adopt it',
  ),
) (nothingWrong)

const bareRowInTable: Rule = P.ifElse (
  (spot: Spot) => isInside ('table') (spot) && !isOneOf (TABLE_SECTIONS) (spot.tag),
) ((spot: Spot) =>
  complains (spot) (`a parser inserts <tbody> around <${spot.tag}> here`),
) (nothingWrong)

const blockInsideParagraph: Rule = P.ifElse (
  (spot: Spot) => isInside ('p') (spot) && isOneOf (CLOSES_P) (spot.tag),
) ((spot: Spot) => complains (spot) (`a parser closes <p> before <${spot.tag}>`)) (
  nothingWrong,
)

const nestedAnchor: Rule = P.ifElse (
  (spot: Spot) => isInside ('a') (spot) && spot.tag === 'a',
) ((spot: Spot) => complains (spot) ('a parser closes <a> before a nested <a>')) (
  nothingWrong,
)

const rules: readonly Rule[] = [
  opaqueWithChildren,
  bareRowInTable,
  blockInsideParagraph,
  nestedAnchor,
]

const spotAt = (node: ServerNode, trail: readonly string[]): Spot => ({
  tag: node.localName,
  parent: P.last (trail),
  trail,
  hasChildren: node.childNodes.length > 0,
})

const judged = (
  node: ServerNode,
  trail: readonly string[],
): readonly Hazard[] => {
  const spot = spotAt (node, trail)
  return P.concat (under (node, P.append (node.localName) (trail))) (
    P.filterMap ((rule: Rule) => rule (spot)) (rules),
  )
}

const isElementNode = (node: ServerNode): boolean => isElement (node.kind)

const nothingUnder = P.K<readonly Hazard[]> ([])

const walkingIn = (
  trail: readonly string[],
): (node: ServerNode) => readonly Hazard[] =>
  P.ifElse (isElementNode) ((one: ServerNode) => judged (one, trail)) (
    nothingUnder,
  )

const under = (
  node: ServerNode,
  trail: readonly string[],
): readonly Hazard[] => P.chain (walkingIn (trail)) (node.childNodes)

/**
 * Walks a rendered tree for constructs an HTML parser rewrites, which would make the client build disagree with the server markup and fall back to a full client render.
 * @example
 * ```ts
 * // hazards :: ServerNode -> Array Hazard
 * hazards (renderedTable)
 * // => [{ path: 'table > tr', problem: 'a parser inserts <tbody> here' }]
 * ```
 */
export const hazards = (node: ServerNode): readonly Hazard[] => under (node, [])
