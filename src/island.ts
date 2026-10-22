import * as P from '@algosail/ply'
import * as D from '@algosail/plydom'
import * as S from '@algosail/plystream'
import type { Json } from './types.ts'

/** An island as the framework sees it: a way to build it again from props that have been through JSON. */
export type Island = {
  readonly tag: 'island'
  readonly rebuild: (props: Json) => D.View
}

const OPEN = 'kit:'
const CLOSE = '/kit'

const NAME_TEXT = '(?:@[A-Za-z0-9_.-]+\\/)?[A-Za-z_$][A-Za-z0-9_$.-]*'

const NAME = new RegExp (`^${NAME_TEXT}$`)

const MARKER = new RegExp (`^kit:(${NAME_TEXT}) ([\\s\\S]*)$`)

const IN_MARKUP = new RegExp (`<!--kit:(${NAME_TEXT}) `, 'g')

const known = new Map<string, Island> ()

const claimed = new WeakSet<Node> ()

type Alive = { readonly dsp: Disposable; readonly open: Node }
const live: Alive[] = []

const refuse = (said: string): never => {
  throw new Error (said)
}

/** One island as it was declared: what it answers to, and where it lives. */
export type Declared = {
  readonly name: string
  readonly module: string
}

const declaredIn = new Map<string, Declared> ()

/**
 * Every island declared so far, for whoever bundles them.
 * @example
 * ```ts
 * // declared :: () -> [Declared]
 * declared ()
 * // => [{ name: 'counter', module: 'file:///…/counter.ts' }]
 * ```
 */
export function declared(): readonly Declared[] {
  return P.sortBy ((one: Declared) => one.name) ([...declaredIn.values ()])
}

const whyBadName = (name: string): string =>
  `island: ${JSON.stringify (name)} is not a name an island can have — ` +
  'either a bare name or a scoped one, `@somebody/counter`, and no spaces'

const whyNowhere = (name: string): string =>
  `island: ${name} needs the module it was declared in. Pass import.meta.url.`

const whyTaken = (name: string) => (already: Declared): string =>
  `island: two islands named ${name} — one in ${already.module}`

const claiming = (name: string) => (module: string): void => {
  P.forEach ((already: Declared) => refuse (whyTaken (name) (already))) (
    P.fromNullable (declaredIn.get (name)),
  )
  declaredIn.set (name, { name, module })
}

const isBlank = (module: string): boolean => module === ''

const declaring =
  (name: string) => (module: string) => (isle: Island): void => {
    P.unless (P.test (NAME)) ((bad: string) => refuse (whyBadName (bad))) (name)
    P.when (isBlank) (() => refuse (whyNowhere (name))) (module)
    claiming (name) (module)
    known.set (name, isle)
  }

const escaped: (said: string) => string = P.pipe ([
  P.replaceAll ('<', '\\u003c'),
  P.replaceAll ('>', '\\u003e'),
])

const asJson = (props: Json): string => JSON.stringify (props)

const encodeProps: (props: Json) => string = P.pipe ([asJson, escaped])

const parsed = (said: string): Json => JSON.parse (said) as Json

const decodeProps: (text: string) => P.Maybe<Json> = P.pipe ([
  P.encase (parsed),
  P.eitherToMaybe<unknown, Json>,
])

/**
 * Names a component and puts a marker around it.
 * @example
 * ```ts
 * // island :: (String, (Props, On, Start) -> View, String) -> Island & (p -> Child)
 * export const counter = island (
 *   'counter',
 *   (props: { from: number }, on: { bumped: Stream<Event> }) => {
 *     const count = hold ((n: number) => n + 1, props.from) (on.bumped)
 *     return p ([button (['+']).use ({ bumped: 'click' }), count])
 *   },
 *   import.meta.url,
 * )
 * // in a page: section ([h1 (['Hits']), counter ({ from: 0 })])
 * ```
 */
export function island<
  P extends Json,
  H extends D.Outs = D.None,
  R extends D.View | S.Source<D.Child> = D.View,
>(
  name: string,
  setup: (props: P, on: H, start: D.Start) => R,
  moduleUrl: string,
): Island & ((props: P) => D.Child) {
  const build = D.component (
    setup as unknown as (
      props: P,
      on: Record<string, S.Source<unknown>>,
      start: D.Start,
    ) => D.View | S.Source<D.Child>,
  )

  const place = (props: P): D.Child => [
    D.comment (`${OPEN}${name} ${encodeProps (props)}`),
    build (props),
    D.comment (CLOSE),
  ]

  const self = Object.defineProperties (place, {
    tag: { value: 'island', enumerable: true },
    rebuild: {
      value: (props: Json): D.View => build (props as P),
      enumerable: true,
    },
  }) as Island & ((props: P) => D.Child)

  declaring (name) (moduleUrl) (self)
  return self
}

/**
 * The islands a rendered page uses, in the order they appear and without repeats.
 * @example
 * ```ts
 * // used :: String -> Array String
 * used ('<div><!--kit:counter {"from":1}-->1<!--/kit--></div>')
 * // => ['counter']
 * ```
 */
export const used: (markup: string) => readonly string[] = P.pipe ([
  P.pipe ([P.firstCaptures (IN_MARKUP), P.justs]),
  P.nub,
])

const COMMENT_NODE = 8

const isComment = (n: Node): n is Comment => n.nodeType === COMMENT_NODE

type Marker = { readonly node: ChildNode; readonly parent: Node }

const dataIn = (marker: Marker): string => (marker.node as Comment).data

const asMarker = (parent: Node) => (child: ChildNode): readonly Marker[] => [
  { node: child, parent },
]

const under = (root: Node): (child: ChildNode) => readonly Marker[] =>
  P.ifElse<ChildNode> (isComment) (asMarker (root)) (markers)

const markers = (root: Node): readonly Marker[] =>
  P.chain (under (root)) (Array.from (root.childNodes))

/** One island in the page: what to rebuild, from what, and where. */
type Slot = {
  readonly island: Island
  readonly name: string
  readonly props: Json
  readonly bracket: D.Bracket
}

/** An opening marker that was read: where it is, and what it says. */
type Started = {
  readonly marker: Marker
  readonly name: string
  readonly props: Json
}

const asStarted =
  (marker: Marker) => (name: string) => (props: Json): Started => ({
    marker,
    name,
    props,
  })

const readIn = (marker: Marker) => (one: P.Matched): P.Maybe<Started> =>
  P.chain ((name: string) =>
    P.chain ((props: string) =>
      P.map (asStarted (marker) (name)) (decodeProps (props)),
    ) (one.groups[1]),
  ) (one.groups[0])

const groupsIn = (marker: Marker): P.Maybe<P.Matched> =>
  P.match (MARKER) (dataIn (marker))

const opened = (marker: Marker): P.Maybe<Started> =>
  P.chain (readIn (marker)) (groupsIn (marker))

const islandNamed = (name: string): P.Maybe<Island> =>
  P.fromNullable (known.get (name))

const asSlot = (start: Started) => (close: Marker) => (isle: Island): Slot => ({
  island: isle,
  name: start.name,
  props: start.props,
  bracket: {
    parent: start.marker.parent,
    open: start.marker.node,
    close: close.node,
  },
})

const slotFor = (close: Marker) => (start: Started): P.Maybe<Slot> =>
  P.map (asSlot (start) (close)) (islandNamed (start.name))

const asList = (one: P.Maybe<Slot>): readonly Slot[] => P.toArray (one)

const closing = (
  close: Marker,
): (start: P.Maybe<Started>) => readonly Slot[] =>
  P.pipe ([P.chain (slotFor (close)), asList])

/** What a marker in the markup is. */
type Mark =
  | { readonly tag: 'opens' }
  | { readonly tag: 'closes' }
  | { readonly tag: 'other' }

const opens: Mark = { tag: 'opens' }
const closes: Mark = { tag: 'closes' }
const other: Mark = { tag: 'other' }

const isOpen = (marker: Marker): boolean => P.startsWith (OPEN) (dataIn (marker))

const isClose = (marker: Marker): boolean => dataIn (marker) === CLOSE

const closeOrPlain = (marker: Marker): Mark =>
  P.boolean<Mark> (other) (closes) (isClose (marker))

const markOf = (marker: Marker): Mark =>
  P.boolean<Mark> (closeOrPlain (marker)) (opens) (isOpen (marker))

/** Where the scan is: how deep inside an island, which opening marker is waiting for its close, and what has been found so far. */
type Scan = {
  readonly depth: number
  readonly start: P.Maybe<Started>
  readonly found: readonly Slot[]
}

const nothingScanned: Scan = {
  depth: 0,
  start: P.nothing<Started> (),
  found: [],
}

const isOutermost = (depth: number): boolean => depth === 1

const isFresh = (marker: Marker): boolean => !claimed.has (marker.node)

const startedAt = (marker: Marker): P.Maybe<Started> =>
  P.chain (opened) (P.fromPredicate (isFresh) (marker))

const deeper = (acc: Scan) => (_: Marker): Scan => ({
  ...acc,
  depth: acc.depth + 1,
})

const starting = (acc: Scan) => (marker: Marker): Scan => ({
  ...acc,
  depth: acc.depth + 1,
  start: startedAt (marker),
})

const opening = (acc: Scan) => (marker: Marker): Scan =>
  P.boolean<(one: Marker) => Scan> (deeper (acc)) (starting (acc)) (
    isOutermost (acc.depth + 1),
  ) (marker)

const upFrom = (depth: number): number => Math.max (0, depth - 1)

const shallower = (acc: Scan) => (_: Marker): Scan => ({
  ...acc,
  depth: upFrom (acc.depth),
})

const finishing = (acc: Scan) => (marker: Marker): Scan => ({
  depth: 0,
  start: P.nothing<Started> (),
  found: P.concat (acc.found) (closing (marker) (acc.start)),
})

const closingAt = (acc: Scan) => (marker: Marker): Scan =>
  P.boolean<(one: Marker) => Scan> (shallower (acc)) (finishing (acc)) (
    upFrom (acc.depth) === 0,
  ) (marker)

const staying = (acc: Scan) => (_: Marker): Scan => acc

const stepping = (acc: Scan, marker: Marker): Scan =>
  P.cases<Mark, (one: Marker) => Scan> ({
    opens: P.K (opening (acc)),
    closes: P.K (closingAt (acc)),
    other: P.K (staying (acc)),
  }) (markOf (marker)) (marker)

const slots = (root: Node): readonly Slot[] =>
  P.reduce (stepping) (nothingScanned) (markers (root)).found

const built = (slot: Slot): Alive => ({
  dsp: D.hydrateIn (slot.bracket) (() => slot.island.rebuild (slot.props)),
  open: slot.bracket.open,
})

const sayFailed = (slot: Slot) => (thrown: unknown): void =>
  console.error (
    `[kit] island ${slot.name} did not come to life`,
    thrown,
  )

const pushing = (one: Alive): void => void live.push (one)

const reviving = (slot: Slot): void => {
  claimed.add (slot.bracket.open)
  P.either (sayFailed (slot)) (pushing) (P.encase (built) (slot))
}

/**
 * Brings every island under a root to life: the ones this bundle knows about, each exactly once.
 * @example
 * ```ts
 * // hydrateIslands :: Node -> Node
 * register ({ counter })
 * hydrateIslands (document.body)
 * // => document.body, brought to life
 * ```
 */
export function hydrateIslands(root: Node): Node {
  P.forEach (reviving) (slots (root))
  return root
}

const takingDown = (one: Alive): void => void S.dispose (one.dsp)

const keeping = (rest: readonly Alive[]): void => {
  live.length = 0
  live.push (...rest)
}

/**
 * Takes down every island on the page.
 * @example
 * ```ts
 * // resetIslands :: () -> void
 * resetIslands ()
 * pipe ([tap (() => resetIslands ()), swapMarkup]) (root)
 * ```
 */
export function resetIslands(): void {
  P.forEach (takingDown) (live)
  keeping ([])
}

const isInside = (root: Node) => (one: Alive): boolean =>
  one.open === root || root.contains (one.open)

/**
 * Takes down the islands inside one node — what a partial does before the region they live in is replaced.
 * @example
 * ```ts
 * // resetIslandsIn :: Node -> void
 * resetIslandsIn (document.querySelector ('[data-kit-part="comments"]'))
 * ```
 */
export function resetIslandsIn(root: Node): void {
  const [inside, elsewhere] = P.partition (isInside (root)) (live)
  P.forEach (takingDown) (inside)
  keeping (elsewhere)
}
