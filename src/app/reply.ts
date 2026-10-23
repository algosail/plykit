import * as P from '@algosail/ply'
import type { Cookie } from './cookie.ts'
import type {
  Answer,
  Failed,
  Json,
  Loaded,
  Redirected,
  RedirectStatus,
  Reply,
  Sent,
} from './types.ts'
import * as Ck from './cookie.ts'
import { HttpError } from './types.ts'

const JSON_TYPE = 'application/json; charset=utf-8'
const TEXT_TYPE = 'text/plain; charset=utf-8'
const HTML_TYPE = 'text/html; charset=utf-8'

/**
 * The data a page shows.
 * @example
 * ```ts
 * // data :: Json d => d -> Number? -> Loaded d
 * data ({ posts: 2 })
 * // => { tag: 'data', data: { posts: 2 }, status: 200 }
 * data ({ title, error }, 422)
 * // => { tag: 'data', data: { … }, status: 422 }
 * ```
 */
export const data = <D extends Json>(value: D, status = 200): Loaded<D> => ({
  tag: 'data',
  data: value,
  status,
})

/**
 * A body under a content type.
 * @example
 * ```ts
 * // body :: String -> BodyInit -> Sent
 * const csv = body ('text/csv')
 * csv ('a,b\n1,2').headers
 * // => { 'content-type': 'text/csv' }
 * ```
 */
export const body = (type: string) => (content: BodyInit): Sent => ({
  tag: 'sent',
  status: 200,
  headers: { 'content-type': type },
  cookies: [],
  body: content,
})

/**
 * JSON, encoded here rather than by the caller — so a handler answers with the value it has and never with a string it had to remember to stringify.
 * @example
 * ```ts
 * // json :: Json -> Sent
 * json ([{ id: 1 }]).body
 * // => '[{"id":1}]'
 * ```
 */
export const json = (value: Json): Sent =>
  body (JSON_TYPE) (JSON.stringify (value))

/**
 * Plain text.
 * @example
 * ```ts
 * // text :: String -> Sent
 * text ('ok').headers
 * // => { 'content-type': 'text/plain; charset=utf-8' }
 * ```
 */
export const text: (content: string) => Sent = body (TEXT_TYPE)

/**
 * Markup.
 * @example
 * ```ts
 * // html :: String -> Sent
 * html ('<p>hi</p>').status
 * // => 200
 * ```
 */
export const html: (markup: string) => Sent = body (HTML_TYPE)

/**
 * Nothing at all, which is what 204 means: it worked and there is nothing to say.
 * @example
 * ```ts
 * // noContent :: () -> Sent
 * noContent ()
 * // => { tag: 'sent', status: 204, headers: {}, body: null }
 * ```
 */
export const noContent = (): Sent => ({
  tag: 'sent',
  status: 204,
  headers: {},
  cookies: [],
  body: null,
})

/**
 * The old name for `noContent`, kept so existing apps go on compiling.
 * @example
 * ```ts
 * // empty :: () -> Sent
 * empty () === noContent ()
 * // => structurally, yes
 * ```
 * @deprecated Use `noContent`.
 */
export const empty: () => Sent = noContent

/**
 * Somewhere else.
 * @example
 * ```ts
 * // redirect :: String -> RedirectStatus? -> Redirected
 * redirect ('/blog/hello')
 * // => { tag: 'redirect', status: 303, location: '/blog/hello' }
 * redirect ('/moved', 308)
 * // => { tag: 'redirect', status: 308, location: '/moved' }
 * ```
 */
export const redirect = (
  location: string,
  status: RedirectStatus = 303,
): Redirected => ({
  tag: 'redirect',
  status,
  location: encodeURI (location),
  headers: {},
  cookies: [],
})

/**
 * A refusal, with the status that says why.
 * @example
 * ```ts
 * // failed :: Number -> String -> Failed
 * failed (404) ('no such post').error.status
 * // => 404
 * ```
 */
export const failed = (status: number) => (message: string): Failed => ({
  tag: 'failure',
  error: new HttpError (status, message),
  headers: {},
  cookies: [],
})

/** A change to an answer, said once per kind of answer. */
const onAnswer =
  (on: P.Cases<Answer, Answer>) => <A extends Answer>(answer: A): A =>
    P.cases<Answer, Answer> (on) (answer) as A

const leftAsIs = P.I<Answer>

const headersAdded =
  <A extends Reply>(more: Readonly<P.StrMap<string>>) => (answer: A): A =>
    P.modify ('headers') (P.concat (more)) (answer)

const REDIRECTS: readonly RedirectStatus[] = [301, 302, 303, 307, 308]

const asRedirect = (code: number): P.Maybe<RedirectStatus> =>
  P.find ((one: RedirectStatus) => one === code) (REDIRECTS)

/**
 * The same answer under a different status — any answer, including a redirect and a refusal.
 * @example
 * ```ts
 * // status :: Number -> Answer -> Answer
 * status (201) (json ({ id: 7 })).status
 * // => 201
 * status (410) (failed (404) ('gone')).error.status
 * // => 410
 * status (308) (redirect ('/blog')).status
 * // => 308
 * status (200) (redirect ('/blog')).status
 * // => 303 — 200 is not a redirect, and a dead redirect is not an answer
 * ```
 */
export const status = (code: number): <A extends Answer>(answer: A) => A =>
  onAnswer ({
    data: P.set ('status') (code),
    sent: P.set ('status') (code),
    redirect: (one: Redirected) =>
      P.maybe_ (P.K (one)) ((to: RedirectStatus) => P.set ('status') (to) (one)) (
        asRedirect (code),
      ),
    failure: (one: Failed) =>
      P.set ('error') (
        new HttpError (code, one.error.message),
      ) (one),
  })

/**
 * More headers on an answer, the ones given winning over the ones there.
 * @example
 * ```ts
 * // headers :: StrMap String -> Answer -> Answer
 * headers ({ allow: 'GET, POST' }) (failed (405) ('nope'))
 * // => a refusal that says which methods the path does answer
 * ```
 */
export const headers = (
  more: Readonly<P.StrMap<string>>,
): <A extends Answer>(answer: A) => A =>
  onAnswer ({
    data: leftAsIs,
    sent: headersAdded<Sent> (more),
    redirect: headersAdded<Redirected> (more),
    failure: headersAdded<Failed> (more),
  })

const cookieAdded = <A extends Reply>(one: Cookie) => (answer: A): A => ({
  ...answer,
  cookies: P.append (one) (answer.cookies),
})

/**
 * One more cookie on an answer, kept beside the headers because there can be several of them and only one of anything else.
 * @example
 * ```ts
 * // cookie :: Cookie -> Answer -> Answer
 * cookie (during (60) (Ck.cookie ('visitor') ('7'))) (redirect ('/'))
 * // => a redirect that sets it on the way
 * ```
 */
export const cookie = (one: Cookie): <A extends Answer>(answer: A) => A =>
  onAnswer ({
    data: leftAsIs,
    sent: cookieAdded<Sent> (one),
    redirect: cookieAdded<Redirected> (one),
    failure: cookieAdded<Failed> (one),
  })

/**
 * Several cookies at once, in the order given.
 * @example
 * ```ts
 * // cookies :: Array Cookie -> Answer -> Answer
 * cookies ([session, theme]) (redirect ('/'))
 * // => a redirect that sets both on the way
 * ```
 */
export const cookies = (
  many: readonly Cookie[],
): <A extends Answer>(answer: A) => A =>
<A extends Answer>(answer: A): A =>
  P.reduce ((acc: A, one: Cookie) => cookie (one) (acc)) (answer) (many)

/**
 * Everything one answer carries about the wire — headers and cookies — put onto another.
 * @example
 * ```ts
 * // onto :: Reply -> Answer -> Answer
 * onto (refusal) (html (markup))
 * // => the page, carrying what the refusal was going to send
 * ```
 */
export const onto = (
  source: Reply,
): <A extends Answer>(answer: A) => A =>
<A extends Answer>(answer: A): A =>
  P.pipe ([headers (source.headers), cookies (source.cookies)]) (answer)

/**
 * One more header on an answer.
 * @example
 * ```ts
 * // header :: String -> String -> Answer -> Answer
 * header ('cache-control') ('no-store') (json ({}))
 * // => a reply that will not be cached
 * ```
 */
export const header =
  (name: string) => (value: string): <A extends Answer>(answer: A) => A =>
    headers (P.singleton (name, value))

const isBlank = (s: string): boolean => s === ''

const namesIn: (said: string) => readonly string[] = P.pipe ([
  P.splitOn (','),
  P.map (P.trim),
  P.reject (isBlank),
])

const listedIn: (said: P.Maybe<string>) => readonly string[] = P.maybe_ (
  P.K<readonly string[]> ([]),
) (
  namesIn,
)

const mentions = (name: string): (listed: readonly string[]) => boolean =>
  P.any ((one: string) => P.toLower (one) === P.toLower (name))

const variedBy = <A extends Reply>(name: string) => (answer: A): A => {
  const listed = listedIn (P.lookup ('vary') (answer.headers))
  return P.boolean (
    headersAdded<A> (
      P.singleton ('vary', P.joinWith (', ') (P.append (name) (listed))),
    ) (answer),
  ) (answer) (mentions (name) (listed))
}

/**
 * One more name in `vary`, keeping whatever is already there.
 * @example
 * ```ts
 * // vary :: String -> Answer -> Answer
 * vary ('cookie') (vary ('kit-part') (html ('…')))
 * // => an answer whose vary is 'kit-part, cookie'
 * ```
 */
export const vary = (name: string): <A extends Answer>(answer: A) => A =>
  onAnswer ({
    data: leftAsIs,
    sent: variedBy<Sent> (name),
    redirect: variedBy<Redirected> (name),
    failure: variedBy<Failed> (name),
  })

/**
 * The catamorphism for `Reply`: one branch per case, and no way to forget one.
 * @example
 * ```ts
 * // reply :: Cases Reply b -> Reply -> b
 * const describe = reply ({
 *   sent: (s) => `sent ${s.status}`,
 *   redirect: (r) => `to ${r.location}`,
 *   failure: (f) => `no: ${f.error.message}`,
 * })
 * describe (redirect ('/blog'))
 * // => 'to /blog'
 * ```
 */
export const reply = <B>(on: P.Cases<Reply, B>): (r: Reply) => B =>
  P.cases<Reply, B> (on)

/**
 * The status a reply answers under, whichever kind it is.
 * @example
 * ```ts
 * // statusOf :: Reply -> Number
 * statusOf (redirect ('/blog'))
 * // => 303
 * ```
 */
export const statusOf: (r: Reply) => number = reply<number> ({
  sent: (one: Sent) => one.status,
  redirect: (one: Redirected) => one.status,
  failure: (one: Failed) => one.error.status,
})

const sending = (
  cookies: readonly Cookie[],
) =>
(named: Readonly<P.StrMap<string>>): Headers =>
  P.reduce ((all: Headers, one: Cookie) => {
    all.append ('set-cookie', Ck.serialize (one))
    return all
  }) (new Headers (named)) (cookies)

type SocketInit = ResponseInit & { webSocket?: WebSocket }

// Node's constructor rejects status 101. The stand-in still reports 101.
const stoodIn = (
  status: number,
  headers: HeadersInit,
  webSocket?: WebSocket,
): Response => {
  const stand = new Response (null, { status: 204, headers })
  return new Proxy (stand, {
    get(target, prop, _receiver) {
      if (prop === 'status') return status
      if (prop === 'ok') return status >= 200 && status < 300
      if (prop === 'statusText' && status === 101) return 'Switching Protocols'
      if (prop === 'webSocket') return webSocket
      const value: unknown = Reflect.get (target, prop, target)
      return typeof value === 'function' ? value.bind (target) : value
    },
  })
}

/**
 * A response of `status`, carrying `webSocket` where the runtime accepts one.
 * @example
 * ```ts
 * socketResponse (101, { upgrade: 'websocket' }).status
 * // => 101
 * ```
 */
export function socketResponse(
  status: number,
  headers: HeadersInit,
  webSocket?: WebSocket,
): Response {
  const init: SocketInit = { status, headers }
  if (webSocket !== undefined) init.webSocket = webSocket
  try {
    return new Response (null, init)
  } catch (err) {
    if (status >= 200 && status <= 599) throw err
    return stoodIn (status, headers, webSocket)
  }
}

const sentResponse = (one: Sent): Response =>
  new Response (one.body, {
    status: one.status,
    headers: sending (one.cookies) (one.headers),
  })

/**
 * The Response a reply becomes.
 * @example
 * ```ts
 * // toResponse :: Reply -> Response
 * toResponse (redirect ('/blog')).headers.get ('location')
 * // => '/blog'
 * ```
 */
export const toResponse: (r: Reply) => Response = reply<Response> ({
  sent: sentResponse,

  redirect: (one: Redirected) =>
    new Response (null, {
      status: one.status,
      headers: sending (one.cookies) (
        P.insert ('location') (one.location) (one.headers),
      ),
    }),

  failure: (one: Failed) =>
    new Response (JSON.stringify ({ error: one.error.message }), {
      status: one.error.status,
      headers: sending (one.cookies) (
        P.insert ('content-type') (JSON_TYPE) (one.headers),
      ),
    }),
})
