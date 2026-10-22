import * as P from '@algosail/ply'
import * as D from '@algosail/plydom'
import * as S from '@algosail/plystream'
import type { Island } from './island.ts'
import { island } from './island.ts'
import { refreshPart } from './navigate.ts'
import {
  canListen,
  LIVE_PATH,
  PART_ATTR,
  PART_EVENT,
  PART_NAME,
} from './types.ts'

/** One JSON text frame from the free channel. */
type Frame = {
  readonly data: string
  readonly event?: string
  readonly retry?: number
}

type Pace = {
  readonly ms: number
}

const AGAIN = 1_000

const isPartName: (id: string) => boolean = P.test (PART_NAME)

const refreshing = (id: string): void => void refreshPart (id)

const socketUrl = (path: string): string => {
  const url = new URL (path, location.href)
  if (url.protocol === 'https:') url.protocol = 'wss:'
  else if (url.protocol === 'http:') url.protocol = 'ws:'
  return url.href
}

const parsed = (raw: unknown): P.Maybe<unknown> =>
  P.chain ((text: string) => P.maybeEncase (JSON.parse) (text)) (
    P.fromPredicate (P.isString) (raw),
  )

const retryIn = (value: P.StrMap<unknown>): P.Maybe<number> =>
  P.filter ((n: number) => Number.isFinite (n) && n >= 0) (
    P.fromPredicate (P.isNumber) (value.retry),
  )

const asFrame = (value: unknown): P.Maybe<Frame> => {
  if (!P.isStrMap (value) || !P.isString (value.data)) return P.nothing ()
  const event = P.fromPredicate (P.isString) (value.event)
  const retry = retryIn (value)
  return P.just ({
    data: value.data,
    ...(P.isJust (event) ? { event: event.value } : {}),
    ...(P.isJust (retry) ? { retry: retry.value } : {}),
  })
}

const frameIn = (raw: unknown): P.Maybe<Frame> => P.chain (asFrame) (parsed (raw))

const partsOnPage = (): readonly string[] =>
  P.justs (
    P.map ((el: Element) => P.fromNullable (el.getAttribute (PART_ATTR))) (
      Array.from (document.querySelectorAll (`[${PART_ATTR}]`)),
    ),
  )

const inTurn = (id: string) => (before: Promise<void>): Promise<void> =>
  before.then (() => refreshPart (id))

const refreshAll = (): void => {
  void P.reduce_ (inTurn) (Promise.resolve ()) (partsOnPage ())
}

const pace = (state: Pace, frame: Frame): Pace => {
  const retry = frame.retry
  if (retry === undefined || !Number.isFinite (retry) || retry < 0) return state
  return { ms: retry }
}

const showing = (frame: Frame): void => {
  if (frame.event !== PART_EVENT) return
  P.forEach (refreshing) (P.fromPredicate (isPartName) (frame.data))
}

const attempt = (url: string) => (again: boolean): S.Stream<Frame> =>
  S.stream ((snk, sch) => {
    const socket = new WebSocket (socketUrl (url))
    let closed = false
    const finish = (): void => {
      if (closed) return
      closed = true
      socket.removeEventListener ('open', onOpen)
      socket.removeEventListener ('message', onMessage)
      socket.removeEventListener ('close', onClose)
    }
    const onOpen = (): void => {
      if (again) refreshAll ()
    }
    const onMessage = (event: MessageEvent): void => {
      P.forEach ((frame: Frame) => {
        showing (frame)
        snk.event (sch.currentTime (), frame)
      }) (frameIn (event.data))
    }
    const onClose = (): void => {
      finish ()
      snk.end (sch.currentTime ())
    }
    socket.addEventListener ('open', onOpen)
    socket.addEventListener ('message', onMessage)
    socket.addEventListener ('close', onClose)
    return S.disposable (() => {
      finish ()
      socket.close ()
    })
  })

const connection = (url: string): S.Stream<Frame> =>
  S.restart (pace, { ms: AGAIN }, (state: Pace) => state.ms) (attempt (url))

const [urls, openAt] = S.bus<string> ()

const frames: S.Stream<Frame> = S.multicast (
  S.switchMap (connection) (S.skipRepeats ((one: string, other: string) =>
    one === other,
  ) (urls)),
)

// Holds the page stream open, so a url from the marker is not lost before heard.
S.subscribe ((_time: number, _frame: Frame) => undefined) (frames)

const named = (name: string) => (frame: Frame): boolean => frame.event === name

const listening = (name: string): S.Stream<string> =>
  P.map ((frame: Frame) => frame.data) (P.filter (named (name)) (frames))

const nothingHeard = (_name: string): S.Stream<string> => S.never<string> ()

const inBrowser = (_name: string): boolean => canListen ()

/**
 * What the server said under this name, as a stream.
 * @example
 * ```ts
 * // heard :: String -> Stream String
 * const price = Stream.holdWith ('—') (heard ('price'))
 * ```
 */
export function heard(name: string): S.Stream<string> {
  return P.ifElse<string> (inBrowser) (listening) (nothingHeard)
                          (name)
}

/** What the marker carries: where to open the page socket. */
type Props = {
  readonly url?: string
  /** Still accepted. `heard` is what subscribes to a name. */
  readonly hear?: readonly string[]
}

const urlIn = (props: Props): string => P.defaultTo (LIVE_PATH) (props.url)

const begun = (props: Props) => (_yes: true): void => {
  openAt (urlIn (props))
}

/**
 * The listening island.
 * What a page listens for it says with `heard`, where it reads it; this marker
 * is only where the connection is opened.
 * @example
 * ```ts
 * // in your islands directory:
 * export { live } from '../../kit/live.ts'
 * // in a layout:
 * Dom.footer ([live ({})])
 * // and on the server, after something changed:
 * announce (stalePart ('comments'))
 * ```
 */
export const live: Island & ((props: Props) => D.Child) = island (
  'live',
  (props: Props) => {
    P.forEach (begun (props)) (P.fromPredicate (P.isTrue) (canListen ()))
    return D.comment ('kit-live')
  },
  import.meta.url,
)
