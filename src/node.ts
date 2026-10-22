import type * as D from '@algosail/plydom'
import * as P from '@algosail/ply'

/** What a node is: an element, a run of text, or a comment. */
export type Kind =
  | { readonly tag: 'element' }
  | { readonly tag: 'text' }
  | { readonly tag: 'comment' }

const anElement: Kind = { tag: 'element' }
const someText: Kind = { tag: 'text' }
const aComment: Kind = { tag: 'comment' }

/**
 * A node's kind — the same numbers the DOM uses.
 * @example
 * ```ts
 * node.nodeType === ELEMENT // => an element
 * node.nodeType === TEXT // => text
 * node.nodeType === COMMENT // => a comment; hydration walks them
 * ```
 */
export const ELEMENT = 1
export const TEXT = 3
export const COMMENT = 8

const numberOf = P.cases<Kind, number> ({
  element: P.K (ELEMENT),
  text: P.K (TEXT),
  comment: P.K (COMMENT),
})

const nameOf = (kind: Kind) => (localName: string): string =>
  P.cases<Kind, string> ({
    element: P.K (localName.toUpperCase ()),
    text: P.K ('#text'),
    comment: P.K ('#comment'),
  }) (kind)

const textOf =
  (kind: Kind) => (own: string, children: readonly string[]): string =>
    P.cases<Kind, string> ({
      element: P.K (P.joinWith ('') (children)),
      text: P.K (own),
      comment: P.K (own),
    }) (kind)

/**
 * Whether it is an element — the only kind with a tag, attributes, and children.
 * @example
 * ```ts
 * // isElement :: Kind -> Boolean
 * isElement (node.kind)
 * // => true for <ul>, false for text and a comment
 * ```
 */
export const isElement: (kind: Kind) => boolean = P.cases<Kind, boolean> ({
  element: P.K (true),
  text: P.K (false),
  comment: P.K (false),
})

const isBlank = (s: string): boolean => s === ''

/** A node in a server-rendered tree. */
export type ServerNode = {
  readonly tag: 'server-node'
  /** What this node is, as a sum. */
  readonly kind: Kind
  readonly nodeType: number
  readonly nodeName: string
  readonly localName: string
  readonly namespaceURI: string | null
  /** Character data, for text and comment nodes. */
  data: string
  /** Own children, in document order. */
  readonly childNodes: ServerNode[]
  parentNode: ServerNode | null
  /** Attributes, in the order they were first set. */
  readonly attributes: Map<string, string>
  /** The bag `dom.ts` writes named CSS properties into. */
  readonly style: Record<string, string>
  readonly firstChild: ServerNode | null
  readonly nextSibling: ServerNode | null
  textContent: string
  insertBefore(node: ServerNode, ref: ServerNode | null): ServerNode
  removeChild(node: ServerNode): ServerNode
  contains(node: ServerNode): boolean
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
  addEventListener(): void
  removeEventListener(): void
  splitText(): ServerNode
}

const isSame = (one: ServerNode) => (other: ServerNode): boolean =>
  one === other

const placeOf = (
  children: readonly ServerNode[],
  node: ServerNode,
): P.Maybe<number> => P.findIndex (isSame (node)) (children)

const lastPlaceOf = (
  children: readonly ServerNode[],
  node: ServerNode,
): P.Maybe<number> =>
  P.fromPredicate ((at: number) => at >= 0) (children.lastIndexOf (node))

const refuse = (said: string): never => {
  throw new Error (said)
}

function makeNode(
  kind: Kind,
  localName: string,
  data: string,
  namespaceURI: string | null,
): ServerNode {
  const self: ServerNode = {
    tag: 'server-node',
    kind,
    nodeType: numberOf (kind),
    nodeName: nameOf (kind) (localName),
    localName,
    namespaceURI,
    data,
    childNodes: [],
    parentNode: null,
    attributes: new Map<string, string> (),
    style: {},

    get firstChild() {
      return P.fromMaybe<ServerNode | null> (null) (P.head (self.childNodes))
    },

    get nextSibling() {
      const after = (parent: ServerNode): P.Maybe<ServerNode> =>
        P.chain ((at: number) => P.index (at + 1) (parent.childNodes)) (
          placeOf (parent.childNodes, self),
        )
      return P.pipe ([
        P.fromNullable<ServerNode>,
        P.chain (after),
        P.fromMaybe<ServerNode | null> (null),
      ]) (self.parentNode)
    },

    get textContent() {
      return textOf (kind) (
        self.data,
        P.map ((c: ServerNode) => c.textContent) (self.childNodes),
      )
    },

    /** Replaces every child with one text node, as the DOM property does. */
    set textContent(value: string) {
      P.forEach ((child: ServerNode) => {
        child.parentNode = null
      }) (self.childNodes)
      self.childNodes.length = 0
      P.unless (isBlank) (
        P.tap ((said: string) => self.insertBefore (text (said), null)),
      ) (value)
    },

    insertBefore(node: ServerNode, ref: ServerNode | null): ServerNode {
      P.forEach ((was: ServerNode) => {
        was.removeChild (node)
      }) (P.toArray (P.fromNullable (node.parentNode)))
      const at = P.fromMaybe (self.childNodes.length) (
        P.chain ((one: ServerNode) => lastPlaceOf (self.childNodes, one)) (
          P.fromNullable (ref),
        ),
      )
      self.childNodes.splice (at, 0, node)
      node.parentNode = self
      return node
    },

    removeChild(node: ServerNode): ServerNode {
      const at = P.maybe_<number> (
        () => refuse ('removeChild: the node to be removed is not a child'),
      ) (P.I<number>) (placeOf (self.childNodes, node))
      self.childNodes.splice (at, 1)
      node.parentNode = null
      return node
    },

    contains(node: ServerNode): boolean {
      return P.any (isSame (self)) (ancestryOf (node))
    },

    setAttribute(name: string, value: string): void {
      self.attributes.set (name, value)
    },

    removeAttribute(name: string): void {
      self.attributes.delete (name)
    },

    /** Listeners never reach a server render, so binding one is a no-op. */
    addEventListener(): void {},

    removeEventListener(): void {},

    /** Only hydration splits text, and a server render never hydrates. */
    splitText(): ServerNode {
      return refuse ('splitText: a server render never hydrates')
    },
  }

  return self
}

const ancestryOf = (node: ServerNode | null): readonly ServerNode[] =>
  P.maybe_ (
    P.K<readonly ServerNode[]> ([]),
  ) (
    (one: ServerNode) => P.prepend (one) (ancestryOf (one.parentNode)),
  ) (P.fromNullable (node))

const element = (localName: string) => (ns: string | null): ServerNode =>
  makeNode (anElement, localName, '', ns)

const text = (data: string): ServerNode =>
  makeNode (someText, '#text', data, null)

const comment = (data: string): ServerNode =>
  makeNode (aComment, '#comment', data, null)

/**
 * Creates a detached element to render into.
 * @example
 * ```ts
 * // root :: () -> ServerNode
 * mount (App (), root () as unknown as Node)
 * ```
 */
export const root = (): ServerNode => element ('kit-root') (null)

/**
 * The `Backend` that makes `next/dom` build a `ServerNode` tree.
 * @example
 * ```ts
 * // serverBackend :: Backend
 * const previous = setBackend (serverBackend)
 * ```
 */
export const serverBackend: D.Backend = {
  element: (tag: string) => element (tag) (null) as unknown as Element,
  elementNS: (ns: string, tag: string) =>
    element (tag) (ns) as unknown as Element,
  text: (data: string) => text (data) as unknown as Text,
  comment: (data: string) => comment (data) as unknown as Comment,
}
