import type * as D from '@algosail/plydom'
import * as P from '@algosail/ply'
import type { ServerNode } from './node.ts'
import type { PartMode } from './types.ts'
import { isElement } from './node.ts'
import {
  INTO_ATTR,
  MODE_ATTR,
  PART_ATTR,
  PART_HEADER,
  PART_NAME,
} from './types.ts'

export { INTO_ATTR, MODE_ATTR, PART_ATTR, PART_HEADER }
export type { PartMode }

/**
 * Names a region of the page.
 * @example
 * ```ts
 * Dom.ul ({ ...part ('comments'), class: style.list }, items)
 * ```
 */
export function part(id: string): D.Props {
  return { [PART_ATTR]: id }
}

const asMode = (mode: PartMode): D.Props =>
  P.boolean<D.Props> ({ [MODE_ATTR]: mode }) ({}) (mode === 'replace')

/**
 * Aims a link or a form at a region: what it answers replaces that region instead of the page.
 * @example
 * ```ts
 * Dom.form ({ ...into ('comments'), method: 'post' }, [field, send])
 * Dom.a ({ ...into ('feed', 'append'), href: '/feed?after=42' }, ['more'])
 * ```
 */
export function into(id: string, mode: PartMode = 'replace'): D.Props {
  return { ...{ [INTO_ATTR]: id }, ...asMode (mode) }
}

/**
 * Which region this request is asking for, if it is asking for one.
 * @example
 * ```ts
 * asked (new Request ('http://x/', { headers: { 'kit-part': 'comments' } }))
 * // => just('comments')
 * ```
 */
export function asked(request: Request): P.Maybe<string> {
  return P.filter (P.test (PART_NAME)) (
    P.fromNullable (request.headers.get (PART_HEADER)),
  )
}

const attributeOf = (name: string) => (node: ServerNode): P.Maybe<string> =>
  P.mapLookup (name) (node.attributes)

const isElementNode = (node: ServerNode): boolean => isElement (node.kind)

const isPart = (id: string) => (node: ServerNode): boolean =>
  P.elem (id) (attributeOf (PART_ATTR) (node))

const isNamed = (id: string): (node: ServerNode) => boolean =>
  P.allPass ([P.predicate (isElementNode), P.predicate (isPart (id))])

/**
 * The region by that name in a rendered tree.
 * @example
 * ```ts
 * find ('comments') (tree) // => just(<ul data-kit-part="comments">…)
 * ```
 */
export function find(id: string): (tree: ServerNode) => P.Maybe<ServerNode> {
  const named = isNamed (id)
  const deeper = (node: ServerNode): P.Maybe<ServerNode> =>
    P.findMap (walk) (node.childNodes)
  const walk = (node: ServerNode): P.Maybe<ServerNode> =>
    P.ifElse<ServerNode> (named) (P.just) (deeper) (node)
  return walk
}
