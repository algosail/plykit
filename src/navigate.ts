import * as P from '@algosail/ply'
import * as D from '@algosail/plydom'
import type { Island } from './island.ts'
import type { PartMode } from './types.ts'
import {
  hydrateIslands,
  island,
  resetIslands,
  resetIslandsIn,
} from './island.ts'
import {
  INTO_ATTR,
  MODE_ATTR,
  PART_ATTR,
  PART_HEADER,
  PART_NAME,
  ROOT_ID,
} from './types.ts'

const isBrowser = (): boolean =>
  typeof document !== 'undefined' &&
  typeof document.createElement === 'function'

const nothingToDo = (): Promise<void> => Promise.resolve ()

const swallowed = (): null => null

const attrOf = (name: string) => (el: Element): P.Maybe<string> =>
  P.fromNullable (el.getAttribute (name))

const has = (name: string) => (el: Element): boolean => el.hasAttribute (name)

const found = (selector: string) => (where: ParentNode): readonly Element[] =>
  Array.from (where.querySelectorAll (selector))

const removing = (tag: Element): void => tag.remove ()

const adopting = (tag: Element): void => {
  document.head.appendChild (tag.cloneNode (true))
}

/** Two ends of one swap: what came, and what it replaces. */
type Swap = { readonly arriving: Element; readonly here: Element }

const asSwap = (arriving: Element) => (here: Element): Swap => ({
  arriving,
  here,
})

const isAnchor = (node: Node): boolean => (node as Element).localName === 'a'

const itself = (node: Node): P.Maybe<Element> => P.just (node as Element)

const anchorAt = (node: Node): P.Maybe<Element> =>
  P.ifElse<Node> (isAnchor) (itself) (above) (node)

const above = (node: Node): P.Maybe<Element> =>
  P.chain (anchorAt) (P.fromNullable (node.parentNode as Node | null))

const anchorOf = (event: Event): P.Maybe<Element> =>
  P.chain (anchorAt) (P.fromNullable (event.target as Node | null))

const aimedAway: (anchor: Element) => boolean = P.anyPass ([
  P.predicate (has ('target')),
  P.predicate (has ('download')),
])

const asUrl = (href: string): URL => new URL (href, location.href)

const urlOf: (href: string) => P.Maybe<URL> = P.pipe ([asUrl, P.just])

const isHere = (url: URL): boolean => url.origin === location.origin

const isSamePage = (url: URL): boolean =>
  url.pathname === location.pathname && url.search === location.search

const hasHash = (url: URL): boolean => url.hash !== ''

const jumpsWithin: (url: URL) => boolean = P.predicateAnd (
  P.predicate (isSamePage),
) (P.predicate (hasHash))

const ours: (url: URL) => boolean = P.predicateAnd (P.predicate (isHere)) (
  P.predicateNot (P.predicate (jumpsWithin)),
)

const handled: (anchor: Element) => P.Maybe<Element> = P.fromPredicate (
  P.predicateNot (P.predicate (aimedAway)),
)

const linkable: (url: URL) => P.Maybe<URL> = P.fromPredicate (ours)

const linkIn: (anchor: Element) => P.Maybe<URL> = P.pipe ([
  handled,
  P.chain (attrOf ('href')),
  P.chain (urlOf),
  P.chain (linkable),
])

const wasHandled = (event: MouseEvent): boolean => event.defaultPrevented
const isSecondary = (event: MouseEvent): boolean => event.button !== 0
const withMeta = (event: MouseEvent): boolean => event.metaKey
const withCtrl = (event: MouseEvent): boolean => event.ctrlKey
const withShift = (event: MouseEvent): boolean => event.shiftKey
const withAlt = (event: MouseEvent): boolean => event.altKey

const elsewhere: readonly ((event: MouseEvent) => boolean)[] = [
  wasHandled,
  isSecondary,
  withMeta,
  withCtrl,
  withShift,
  withAlt,
]

const plainly: (event: MouseEvent) => P.Maybe<MouseEvent> = P.fromPredicate (
  P.predicateNot (P.anyPass (elsewhere.map (P.predicate))),
)

const linkTarget: (event: MouseEvent) => P.Maybe<URL> = P.pipe ([
  plainly,
  P.chain (anchorOf),
  P.chain (linkIn),
])

const KIT_STYLE = 'style[data-kit]'
const LINKED = 'link[rel]'
const META = 'meta[name]'
const MODULE = 'script[type="module"][src]'

const styleFor = (id: string): string => `style[data-kit="${id}"]`

const standing = (id: string): boolean =>
  document.head.querySelector (styleFor (id)) !== null

const isNewStyle = (tag: Element): boolean =>
  P.fromMaybe (false) (
    P.map (P.predicateNot (P.predicate (standing))) (attrOf ('data-kit') (tag)),
  )

const adoptStyles = (next: ParentNode): void => {
  P.forEach (adopting) (P.filter (isNewStyle) (found (KIT_STYLE) (next)))
}

const linkKey = (el: Element): string =>
  `${el.getAttribute ('rel')}|${el.getAttribute ('href')}`

const keysOf = (tags: readonly Element[]): Set<string> =>
  new Set (P.map (linkKey) (tags))

const among = (keys: Set<string>) => (tag: Element): boolean =>
  keys.has (linkKey (tag))

const adoptLinks = (next: Document): void => {
  const here = found (LINKED) (document.head)
  const arriving = found (LINKED) (next.head)
  P.forEach (removing) (P.reject (among (keysOf (arriving))) (here))
  P.forEach (adopting) (P.reject (among (keysOf (here))) (arriving))
}

const adoptMeta = (next: Document): void => {
  P.forEach (removing) (found (META) (document.head))
  P.forEach (adopting) (found (META) (next.head))
}

const adoptHead = (next: Document): void => {
  document.title = next.title
  adoptStyles (next)
  adoptLinks (next)
  adoptMeta (next)
}

const importing = (src: string): Promise<unknown> =>
  (import (asUrl (src).href) as Promise<unknown>).catch (swallowed)

const sourcesIn = (next: ParentNode): readonly string[] =>
  P.filterMap (attrOf ('src')) (found (MODULE) (next))

const loadChunks = async (next: ParentNode): Promise<void> => {
  await Promise.all (P.map (importing) (sourcesIn (next)))
}

const giveUp = (url: URL): void => {
  location.href = url.href
}

const giving = (url: URL) => (): Promise<void> => {
  giveUp (url)
  return Promise.resolve ()
}

const BUSY = 'aria-busy'
let waiting = 0

const busy = (el: Element): void => el.setAttribute (BUSY, 'true')

const idle = (el: Element): void => el.removeAttribute (BUSY)

const lastOne = (_root: Element): boolean => waiting === 0

const clearing = (where: P.Maybe<Element>) => (): void => {
  waiting -= 1
  P.forEach (idle) (P.filter (lastOne) (P.just (document.documentElement)))
  P.forEach (idle) (where)
}

const marked = (where: P.Maybe<Element>): () => void => {
  waiting += 1
  busy (document.documentElement)
  P.forEach (busy) (where)
  return P.once (clearing (where))
}

const inFlight =
  (where: P.Maybe<Element>) => (run: () => Promise<void>): Promise<void> => {
    const done = marked (where)
    return run ().finally (done)
  }

type Starts = (run: () => void) => {
  readonly ready: Promise<void>
  readonly updateCallbackDone: Promise<void>
  readonly finished: Promise<void>
}

type Transitioning = Document & { startViewTransition?: Starts }

const startsIn = (): P.Maybe<Starts> =>
  P.fromNullable ((document as Transitioning).startViewTransition)

const wantsMotion = (): boolean =>
  globalThis.matchMedia?. ('(prefers-reduced-motion: reduce)')?.matches !== true

const crossing = (): P.Maybe<Starts> =>
  P.boolean (P.nothing<Starts> ()) (startsIn ()) (wantsMotion ())

const atOnce = (change: () => void) => (): Promise<void> => {
  change ()
  return Promise.resolve ()
}

const across = (change: () => void) => async (start: Starts): Promise<void> => {
  const move = start.call (document, change)
  move.ready.catch (swallowed)
  move.finished.catch (swallowed)
  return move.updateCallbackDone.catch (swallowed).then (nothingToDo)
}

const paint = (change: () => void): Promise<void> =>
  P.maybe_ (atOnce (change)) (across (change)) (crossing ())

/** A page that arrived, and the address it actually came from. */
type Landed = { readonly html: string; readonly url: string }

type Ahead = { readonly at: number; readonly answer: Promise<P.Maybe<Landed>> }

const AHEAD_MAX = 6
const AHEAD_TTL = 30_000
const HOVER_WAIT = 65

const ahead = new Map<string, Ahead> ()

const noPage = (): P.Maybe<Landed> => P.nothing<Landed> ()

const asLanded =
  (url: URL) => async (res: Response): Promise<P.Maybe<Landed>> =>
    P.just ({
      html: await res.text (),
      url: res.url === '' ? url.href : res.url,
    })

const sending = (init: P.Maybe<RequestInit>): RequestInit =>
  P.fromMaybe<RequestInit> ({}) (init)

const fresh = { cache: 'no-store' } as const

const fetchPage = (
  url: URL,
  init: P.Maybe<RequestInit>,
): Promise<P.Maybe<Landed>> =>
  fetch (url.href, {
    ...sending (init),
    ...fresh,
    headers: { accept: 'text/html' },
  })
    .then (asLanded (url))
    .catch (noPage)

const isMetered = (_url: URL): boolean =>
  (navigator as { connection?: { saveData?: boolean } }).connection
    ?.saveData === true

const isKept = (url: URL): boolean => ahead.has (url.href)

const skipping: (url: URL) => boolean = P.anyPass ([
  P.predicate (isMetered),
  P.predicate (isKept),
])

const forget = (key: string): void => {
  ahead.delete (key)
}

const keyOf = ([key]: readonly [string, Ahead]): string => key

const isStale =
  (now: number) => ([, kept]: readonly [string, Ahead]): boolean =>
    now - kept.at > AHEAD_TTL

const expiring = (now: number): void => {
  P.forEach (forget) (P.map (keyOf) (P.filter (isStale (now)) (P.fromIterable (ahead))))
}

const isFull = (_url: URL): boolean => ahead.size >= AHEAD_MAX

const oldest = (): P.Maybe<string> => P.head (P.fromIterable (ahead.keys ()))

const crowding = (url: URL): P.Maybe<string> =>
  P.boolean (P.nothing<string> ()) (oldest ()) (isFull (url))

const keeping = (url: URL): void => {
  ahead.set (url.href, { at: Date.now (), answer: fetchPage (url, P.nothing ()) })
}

const guessing = (url: URL): void => {
  expiring (Date.now ())
  P.forEach (forget) (crowding (url))
  P.forEach (keeping) (P.reject (isKept) (P.just (url)))
}

const prefetch = (url: URL): void => {
  P.forEach (guessing) (P.reject (skipping) (P.just (url)))
}

const isFresh = (kept: Ahead): boolean => Date.now () - kept.at <= AHEAD_TTL

const answerOf = (kept: Ahead): Promise<P.Maybe<Landed>> => kept.answer

const taken = (url: URL): P.Maybe<Ahead> => {
  const kept = P.fromNullable (ahead.get (url.href))
  forget (url.href)
  return kept
}

const guessed = (url: URL): P.Maybe<Promise<P.Maybe<Landed>>> =>
  P.map (answerOf) (P.filter (isFresh) (taken (url)))

const positions = new Map<number, number> ()
let entries = 0

let shown = ''

const sameAsShown = (url: URL): boolean => {
  const was = new URL (shown, url.href)
  return was.pathname === url.pathname && was.search === url.search
}

const filed = (): P.Maybe<number> => {
  const state = history.state as { kit?: number } | null
  return P.filter<number> (P.isNumber) (P.fromNullable (state?.kit))
}

const minted = (): number => {
  const key = ++entries
  history.replaceState ({ ...(history.state ?? {}), kit: key }, '')
  return key
}

const entryKey = (): number => P.fromMaybe_ (minted) (filed ())

const rememberScroll = (): void => {
  positions.set (entryKey (), globalThis.scrollY)
}

const isNamed = (hash: string): boolean => hash.length > 1

const nameIn = (hash: string): string => decodeURIComponent (hash.slice (1))

const fragmentOf = (url: URL): P.Maybe<string> =>
  P.map (nameIn) (P.fromPredicate (isNamed) (url.hash))

const namedIn = (id: string): P.Maybe<Element> =>
  P.fromNullable (document.getElementById (id))

const toTop = (): void => globalThis.scrollTo (0, 0)

const intoView = (target: Element): void => target.scrollIntoView ()

const scrollToTarget = (url: URL): void =>
  P.maybe_ (toTop) (intoView) (P.chain (namedIn) (fragmentOf (url)))

const keptAt = (key: number): P.Maybe<number> =>
  P.fromNullable (positions.get (key))

const restoreScroll = (): void =>
  globalThis.scrollTo (0, P.fromMaybe (0) (P.chain (keptAt) (filed ())))

/** One navigation: where to, whether it is a new entry, and what to send. */
type Going = {
  readonly url: URL
  readonly push: boolean
  readonly init: P.Maybe<RequestInit>
}

const clicked = (url: URL): Going => ({
  url,
  push: true,
  init: P.nothing<RequestInit> (),
})

const popped = (url: URL): Going => ({
  url,
  push: false,
  init: P.nothing<RequestInit> (),
})

let current = 0
const partRuns = new Map<string, number> ()

/** One answer while it is on its way: which run of the island it is, and where to read the run its target is on now. */
type Run<A> = {
  readonly what: A
  readonly mine: number
  readonly seen: () => number
}

const runningPage = (what: Going): Run<Going> => ({
  what,
  mine: ++current,
  seen: () => current,
})

const runningPart = (what: Region): Run<Region> => {
  const mine = (partRuns.get (what.id) ?? 0) + 1
  partRuns.set (what.id, mine)
  return { what, mine, seen: () => partRuns.get (what.id) ?? 0 }
}

const still = <A, B>(run: Run<A>) => (_b: B): boolean => run.mine === run.seen ()

const sendsBody = (one: Going): boolean => P.isJust (one.init)

const noGuess = (_one: Going): P.Maybe<Promise<P.Maybe<Landed>>> =>
  P.nothing<Promise<P.Maybe<Landed>>> ()

const guessFor = (one: Going): P.Maybe<Promise<P.Maybe<Landed>>> =>
  guessed (one.url)

const answerFor = (one: Going): P.Maybe<Promise<P.Maybe<Landed>>> =>
  P.ifElse<Going> (sendsBody) (noGuess) (
    guessFor,
  ) (one)

const fetching = (one: Going) => (): Promise<P.Maybe<Landed>> =>
  fetchPage (one.url, one.init)

const asking = (one: Going): Promise<P.Maybe<Landed>> =>
  P.fromMaybe_ (fetching (one)) (answerFor (one))

const parsed = (html: string): Document =>
  new DOMParser ().parseFromString (html, 'text/html')

const rootIn = (where: Document): P.Maybe<Element> =>
  P.fromNullable (where.getElementById (ROOT_ID))

const rootsIn = (next: Document): P.Maybe<Swap> =>
  P.lift2 (asSwap) (rootIn (next)) (rootIn (document))

/** A page that landed, parsed, with both roots in hand. */
type Arrived = {
  readonly go: Going
  readonly landed: URL
  readonly next: Document
  readonly roots: Swap
}

const asArrived = (go: Going) =>
(landed: URL) =>
(next: Document) =>
(
  roots: Swap,
): Arrived => ({ go, landed, next, roots })

const landedAt = (page: Landed): URL => new URL (page.url)

const arrivedIn = (go: Going) => (page: Landed): P.Maybe<Arrived> => {
  const next = parsed (page.html)
  return P.map (asArrived (go) (landedAt (page)) (next)) (rootsIn (next))
}

const entering = (at: Arrived): void => {
  rememberScroll ()
  history.pushState ({ kit: ++entries }, '', at.landed.href)
}

const isNew = (at: Arrived): boolean => at.go.push

const entered = (at: Arrived): void => {
  P.forEach (entering) (P.filter (isNew) (P.just (at)))
}

const replacingAll = (at: Arrived) => (): void => {
  resetIslands ()
  adoptHead (at.next)
  at.roots.here.replaceChildren (...Array.from (at.roots.arriving.childNodes))
  shown = at.landed.href
  partRuns.clear ()
}

const landing = (at: Arrived) => (): void => scrollToTarget (at.landed)

const placed = (at: Arrived): void =>
  P.boolean (restoreScroll) (landing (at)) (isNew (at)) ()

const living = (at: Arrived): void => {
  hydrateIslands (at.roots.here)
  placed (at)
}

const drawing = (run: Run<Going>) => async (at: Arrived): Promise<void> => {
  entered (at)
  await paint (replacingAll (at))
  await loadChunks (at.next)
  P.forEach (living) (P.filter (still<Going, Arrived> (run)) (P.just (at)))
}

const drawn = (run: Run<Going>) => (page: Landed): Promise<void> =>
  P.fromMaybe_ (giving (landedAt (page))) (
    P.map (drawing (run)) (arrivedIn (run.what) (page)),
  )

const answered = (run: Run<Going>) => (page: P.Maybe<Landed>): Promise<void> =>
  P.maybe_ (nothingToDo) (drawn (run)) (page)

const showing = async (run: Run<Going>): Promise<void> => {
  const page = await asking (run.what)
  return P.fromMaybe_ (nothingToDo) (
    P.map (answered (run)) (
      P.filter (still<Going, P.Maybe<Landed>> (run)) (P.just (page)),
    ),
  )
}

const show = (one: Going): Promise<void> =>
  inFlight (P.nothing<Element> ()) (() => showing (runningPage (one)))

const isPartName: (id: string) => boolean = P.test (PART_NAME)

const aimedAt: (el: Element) => P.Maybe<string> = P.pipe ([
  attrOf (INTO_ATTR),
  P.chain (P.fromPredicate (isPartName)),
])

const partOf = (el: P.Maybe<Element>): P.Maybe<string> => P.chain (aimedAt) (el)

const hasPart = (el: Element): boolean => P.isJust (aimedAt (el))

const MODES: readonly string[] = ['append', 'prepend']

const isMode = (said: string): boolean => P.elem (said) (MODES)

const asMode = (said: string): PartMode => said as PartMode

const modeIn = (el: Element): P.Maybe<PartMode> =>
  P.map (asMode) (P.chain (P.fromPredicate (isMode)) (attrOf (MODE_ATTR) (el)))

const modeOf = (el: P.Maybe<Element>): PartMode =>
  P.fromMaybe<PartMode> ('replace') (P.chain (modeIn) (el))

const regionIn = (where: ParentNode) => (id: string): P.Maybe<Element> =>
  P.fromNullable (where.querySelector (`[${PART_ATTR}="${id}"]`))

/** One region, and what to ask the server for it. */
type Region = {
  readonly id: string
  readonly url: URL
  readonly init: P.Maybe<RequestInit>
  readonly mode: PartMode
}

const regionAt =
  (id: string) =>
  (mode: PartMode) =>
  (url: URL) =>
  (init: P.Maybe<RequestInit>): Region => ({ id, url, init, mode })

const isReplacing = (one: Region): boolean => one.mode === 'replace'

/** A region's answer: the response, and the markup it carried. */
type Answered = { readonly res: Response; readonly html: string }

const noAnswer = (): P.Maybe<Answered> => P.nothing<Answered> ()

const noAnswerYet = (): Promise<P.Maybe<Answered>> =>
  Promise.resolve (noAnswer ())

const noResponse = (): P.Maybe<Response> => P.nothing<Response> ()

const asAnswered = (res: Response) => (html: string): P.Maybe<Answered> =>
  P.just ({ res, html })

const reading = (res: Response): Promise<P.Maybe<Answered>> =>
  res.text ().then (asAnswered (res)).catch (noAnswer)

const fetchPart = (one: Region): Promise<P.Maybe<Response>> =>
  fetch (one.url.href, {
    ...sending (one.init),
    ...fresh,
    headers: { accept: 'text/html', [PART_HEADER]: one.id },
  })
    .then (P.just<Response>)
    .catch (noResponse)

const asking1 = async (one: Region): Promise<P.Maybe<Answered>> =>
  P.fromMaybe_ (noAnswerYet) (P.map (reading) (await fetchPart (one)))

const cameFrom = (one: Region) => (got: Answered): URL =>
  new URL (got.res.url === '' ? one.url.href : got.res.url)

/** A region that came back, with both ends of the swap in hand. */
type Coming = {
  readonly one: Region
  readonly next: Document
  readonly roots: Swap
}

const asComing =
  (one: Region) => (next: Document) => (roots: Swap): Coming => ({
    one,
    next,
    roots,
  })

const partsIn = (one: Region) => (next: Document): P.Maybe<Swap> =>
  P.lift2 (asSwap) (regionIn (next) (one.id)) (regionIn (document) (one.id))

const comingIn = (one: Region) => (got: Answered): P.Maybe<Coming> => {
  const next = parsed (got.html)
  return P.map (asComing (one) (next)) (partsIn (one) (next))
}

const replacingOne = (at: Coming) => (brought: Element) => (): void => {
  resetIslandsIn (at.roots.here)
  at.roots.here.replaceWith (brought)
}

const isAppending = (at: Coming): boolean => at.one.mode === 'append'

const joining = (at: Coming) => (brought: Element) => (): void => {
  const children = Array.from (brought.childNodes)
  P.boolean (
    () => at.roots.here.prepend (...children),
  ) (
    () => at.roots.here.append (...children),
  ) (isAppending (at)) ()
}

const changing = (at: Coming) => (brought: Element): () => void =>
  P.boolean (joining (at) (brought)) (replacingOne (at) (brought)) (
    isReplacing (at.one),
  )

const around = (at: Coming): ParentNode =>
  P.fromMaybe<ParentNode> (document.body) (
    P.fromNullable (at.roots.here.parentNode),
  )

const livingIn = (at: Coming): ParentNode =>
  P.boolean<ParentNode> (at.roots.here) (around (at)) (isReplacing (at.one))

const settled = (at: Coming) => (brought: Element) => (): void => {
  if (!at.roots.here.isConnected) return
  const where = livingIn (at)
  changing (at) (brought) ()
  hydrateIslands (where)
}

const putting = (at: Coming) => (): Promise<void> =>
  paint (settled (at) (document.importNode (at.roots.arriving, true)))

const settling = (run: Run<Region>) => async (at: Coming): Promise<void> => {
  adoptStyles (at.next)
  await loadChunks (at.next)
  return P.fromMaybe_ (nothingToDo) (
    P.map (putting (at)) (P.filter (still<Region, Coming> (run)) (P.just (at))),
  )
}

const brought = (run: Run<Region>) => (got: Answered): Promise<void> =>
  P.fromMaybe_ (giving (cameFrom (run.what) (got))) (
    P.map (settling (run)) (comingIn (run.what) (got)),
  )

const returned =
  (run: Run<Region>) => (got: P.Maybe<Answered>): Promise<void> =>
    P.maybe_ (nothingToDo) (brought (run)) (got)

const swapping = async (run: Run<Region>): Promise<void> => {
  const got = await asking1 (run.what)
  return P.fromMaybe_ (nothingToDo) (
    P.map (returned (run)) (
      P.filter (still<Region, P.Maybe<Answered>> (run)) (P.just (got)),
    ),
  )
}

const marking = (one: Region) => (here: Element): Promise<void> =>
  inFlight (P.just (here)) (() => swapping (runningPart (one)))

/** Replaces one region with the server's current version of it. */
const swap = (one: Region): Promise<void> =>
  P.fromMaybe_ (nothingToDo) (
    P.map (marking (one)) (
      P.chain (regionIn (document)) (P.filter (isPartName) (P.just (one.id))),
    ),
  )

const refreshing = (id: string) => (): Promise<void> =>
  swap (regionAt (id) ('replace') (new URL (location.href)) (P.nothing ()))

/**
 * Asks the server for a region again — what an island calls when it changed something the region shows.
 * @example
 * ```ts
 * // refreshPart :: String -> Promise void
 * await refreshPart ('comments')
 * ```
 */
export function refreshPart(id: string): Promise<void> {
  return P.fromMaybe_ (nothingToDo) (
    P.map (refreshing (id)) (P.fromPredicate (P.isTrue) (isBrowser ())),
  )
}

/** A form, and the button that submitted it. */
type Sent = {
  readonly form: HTMLFormElement
  readonly button: P.Maybe<Element>
}

/** The two names one setting has: the button's, and the form's. */
type Said = { readonly onButton: string; readonly onForm: string }

const ACTION: Said = { onButton: 'formaction', onForm: 'action' }
const METHOD: Said = { onButton: 'formmethod', onForm: 'method' }
const ENCTYPE: Said = { onButton: 'formenctype', onForm: 'enctype' }

const MULTIPART = 'multipart/form-data'

const told = (on: Sent) => (said: Said): P.Maybe<string> =>
  P.alt (attrOf (said.onForm) (on.form)) (P.chain (attrOf (said.onButton)) (on.button))

const isSomething = (name: string): boolean => name !== ''

const valueOf = (button: Element): string =>
  P.fromMaybe ('') (attrOf ('value') (button))

const signed = (data: FormData) => (button: Element) => (name: string): void =>
  data.append (name, valueOf (button))

const signing = (data: FormData) => (button: Element): void => {
  P.forEach (signed (data) (button)) (P.filter (isSomething) (attrOf ('name') (button)))
}

const fieldsOf = (on: Sent): FormData => {
  const data = new FormData (on.form)
  P.forEach (signing (data)) (on.button)
  return data
}

const isFile = ([, value]: readonly [string, FormDataEntryValue]): boolean =>
  !P.isString (value)

const pairing = (key: string) => (said: string): [string, string] => [key, said]

const asText = (
  [key, value]: readonly [string, FormDataEntryValue],
): P.Maybe<[string, string]> =>
  P.map (pairing (key)) (P.fromPredicate (P.isString) (value))

const asQuery = (data: FormData): URLSearchParams =>
  new URLSearchParams (P.filterMap (asText) (P.fromIterable (data)))

const wasStopped = (event: Event): boolean => event.defaultPrevented

const isForm = (el: Element): boolean => el.localName === 'form'

const isOurs: (el: Element) => boolean = P.predicateAnd (P.predicate (isForm)) (
  P.predicateNot (P.predicate (has ('target'))),
)

const formIn = (event: Event): P.Maybe<HTMLFormElement> =>
  P.filter (isOurs) (
    P.fromNullable (event.target as HTMLFormElement | null),
  ) as P.Maybe<HTMLFormElement>

const buttonIn = (event: Event): P.Maybe<Element> =>
  P.fromNullable ((event as { submitter?: Element | null }).submitter)

const asSent = (event: Event) => (form: HTMLFormElement): Sent => ({
  form,
  button: buttonIn (event),
})

const sentIn = (event: Event): P.Maybe<Sent> =>
  P.map (asSent (event)) (
    P.chain (formIn) (
      P.fromPredicate (P.predicateNot (P.predicate (wasStopped))) (event),
    ),
  )

/** A submit, once everything the platform decides has been read off it. */
type Sending = {
  readonly sent: Sent
  readonly url: URL
  readonly method: string
  readonly into: P.Maybe<string>
  readonly mode: PartMode
  readonly data: FormData
}

const aimingIn = (on: Sent): P.Maybe<Element> =>
  P.alt (P.just<Element> (on.form)) (P.filter (hasPart) (on.button))

const actionOf = (on: Sent): URL => asUrl (P.fromMaybe ('') (told (on) (ACTION)))

const methodOf = (on: Sent): string =>
  P.toLower (P.fromMaybe ('get') (told (on) (METHOD)))

const asSending = (on: Sent): Sending => {
  const source = aimingIn (on)
  return {
    sent: on,
    url: actionOf (on),
    method: methodOf (on),
    into: partOf (source),
    mode: modeOf (source),
    data: fieldsOf (on),
  }
}

const goesHere = (one: Sending): boolean => isHere (one.url)

const sendingOf: (on: Sent) => P.Maybe<Sending> = P.pipe ([
  asSending,
  P.fromPredicate (goesHere),
])

const sendingIn: (event: Event) => P.Maybe<Sending> = P.pipe ([
  sentIn,
  P.chain (sendingOf),
])

const isPosting = (one: Sending): boolean => one.method === 'post'

const saysMultipart = (one: Sending): boolean =>
  P.fromMaybe ('') (P.map (P.toLower) (told (one.sent) (ENCTYPE))) === MULTIPART

const carriesFile = (one: Sending): boolean =>
  P.any (isFile) (P.fromIterable (one.data))

const multipart: (one: Sending) => boolean = P.predicateOr (
  P.predicate (saysMultipart),
) (P.predicate (carriesFile))

const bodyOf = (one: Sending): FormData | URLSearchParams =>
  P.boolean<FormData | URLSearchParams> (asQuery (one.data)) (one.data) (
    multipart (one),
  )

const wholePage =
  (init: P.Maybe<RequestInit>) => (url: URL) => (): Promise<void> =>
    show ({ url, push: true, init })

const onePart =
  (one: Sending) =>
  (init: P.Maybe<RequestInit>) =>
  (url: URL) =>
  (id: string): Promise<void> => swap (regionAt (id) (one.mode) (url) (init))

const answering =
  (one: Sending) => (init: P.Maybe<RequestInit>) => (url: URL): Promise<void> =>
    P.maybe_ (wholePage (init) (url)) (onePart (one) (init) (url)) (one.into)

const withFields = (one: Sending): URL => {
  const target = new URL (one.url.href)
  target.search = asQuery (one.data).toString ()
  return target
}

const getting = (one: Sending): Promise<void> =>
  answering (one) (P.nothing<RequestInit> ()) (withFields (one))

// A write is newer than any page guessed before it, or while it was in flight.
const forgetting = (): void => {
  ahead.clear ()
}

const posting = (one: Sending): Promise<void> => {
  forgetting ()
  return answering (one) (P.just ({ method: 'POST', body: bodyOf (one) })) (one.url)
    .finally (forgetting)
}

const asked = (one: Sending): Promise<void> =>
  P.ifElse<Sending> (isPosting) (posting) (getting) (one)

const taking = (event: Event) => (one: Sending): void => {
  event.preventDefault ()
  void asked (one)
}

const send = (event: Event): void => {
  P.forEach (taking (event)) (sendingIn (event))
}

let aiming: ReturnType<typeof setTimeout> | undefined

const guessable = (anchor: Element): P.Maybe<URL> =>
  P.chain (linkIn) (P.reject (hasPart) (P.just (anchor)))

const aheadOf = (event: Event): P.Maybe<URL> =>
  P.chain (guessable) (anchorOf (event))

const soon = (url: URL): void => {
  clearTimeout (aiming)
  aiming = setTimeout (() => prefetch (url), HOVER_WAIT)
}

const aim = (event: Event): void => {
  P.forEach (soon) (aheadOf (event))
}

const touched = (event: Event): void => {
  P.forEach (prefetch) (P.chain (linkIn) (anchorOf (event)))
}

const forgetAim = (): void => clearTimeout (aiming)

let pending = false

const recorded = (): void => {
  pending = false
  rememberScroll ()
}

const queueing = (_idle: false): void => {
  pending = true
  requestAnimationFrame (recorded)
}

const onScroll = (): void => {
  P.forEach (queueing) (P.fromPredicate (P.isFalse) (pending))
}

const asPage = (url: URL) => (): Promise<void> => show (clicked (url))

const asPart = (anchor: P.Maybe<Element>) => (url: URL) => (id: string) =>
  swap (regionAt (id) (modeOf (anchor)) (url) (P.nothing ()))

const following = (anchor: P.Maybe<Element>) => (url: URL): void => {
  void P.maybe_ (asPage (url)) (asPart (anchor) (url)) (partOf (anchor))
}

const stopped = (event: Event) => (url: URL): URL => {
  event.preventDefault ()
  return url
}

const onClick = (event: Event): void => {
  P.forEach (following (anchorOf (event))) (
    P.map (stopped (event)) (linkTarget (event as MouseEvent)),
  )
}

const toFragment = (url: URL) => (): void => scrollToTarget (url)

const jumped = (url: URL): void =>
  P.boolean (restoreScroll) (toFragment (url)) (hasHash (url)) ()

const refetching = (url: URL): void => void show (popped (url))

const onPop = (): void => {
  const url = new URL (location.href)
  const here = sameAsShown (url)
  shown = url.href
  P.boolean (refetching) (jumped) (here) (url)
}

const begin = P.once ((): void => {
  history.scrollRestoration = 'manual'
  shown = location.href

  document.addEventListener ('mouseover', aim)
  document.addEventListener ('focusin', aim)
  document.addEventListener ('touchstart', touched, { passive: true })
  document.addEventListener ('mouseout', forgetAim)
  globalThis.addEventListener ('scroll', onScroll, { passive: true })
  document.addEventListener ('click', onClick)
  document.addEventListener ('submit', send)
  globalThis.addEventListener ('popstate', onPop)
})

/**
 * The navigation island.
 * @example
 * ```ts
 * // in your islands directory:
 * export { navigation } from '../../kit/navigate.ts'
 * // in a layout:
 * Dom.footer ([navigation ({})])
 * ```
 */
export const navigation:
  & Island
  & ((props: Record<string, never>) => D.Child) = island (
    'navigation',
    () => {
      P.forEach (begin) (P.fromPredicate (P.isTrue) (isBrowser ()))
      return D.comment ('kit-nav')
    },
    import.meta.url,
  )
