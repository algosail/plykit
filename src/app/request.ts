import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Json } from './types.ts'
import * as Ck from './cookie.ts'

/** One thing a form sent: a name, and a string or a file under it. */
type Submitted = readonly [string, FormDataEntryValue]

const submittedIn = (form: FormData): readonly Submitted[] =>
  P.fromIterable (form)

const fieldIn = (one: Submitted): P.Maybe<P.Pair<string, string>> =>
  P.map ((said: string) => P.pair (one[0], said)) (
    P.fromPredicate (P.isString) (one[1]),
  )

const fieldsOf: (form: FormData) => Readonly<P.StrMap<string>> = P.pipe ([
  submittedIn,
  P.filterMap (fieldIn),
  P.fromPairs<string>,
])

function groupedOf(
  pairs: readonly P.Pair<string, string>[],
): Readonly<P.StrMap<readonly string[]>> {
  const out: P.StrMap<string[]> = {}
  for (const one of pairs) (out[one.fst] ??= []).push (one.snd)
  return out
}

const fieldsAllOf: (form: FormData) => Readonly<P.StrMap<readonly string[]>> = P
  .pipe ([
    submittedIn,
    P.filterMap (fieldIn),
    groupedOf,
  ])

/**
 * The fields of a submitted form, keyed by name.
 * @example
 * ```ts
 * // fields :: Request -> Task (StrMap String)
 * await run (fields (new Request (url, { method: 'POST', body: form })))
 * // => { text: 'wrote' }
 * ```
 */
export function fields(
  request: Request,
): F.Future<unknown, Readonly<P.StrMap<string>>> {
  return P.map (fieldsOf) (F.attemptP (() => request.formData ()))
}

/**
 * The same fields, but every value under its name.
 * @example
 * ```ts
 * // fieldsAll :: Request -> Task (StrMap (Array String))
 * await run (fieldsAll (new Request (url, { method: 'POST', body: form })))
 * // => { tag: ['fp', 'deno'] }
 * ```
 */
export function fieldsAll(
  request: Request,
): F.Future<unknown, Readonly<P.StrMap<readonly string[]>>> {
  return P.map (fieldsAllOf) (F.attemptP (() => request.formData ()))
}

/**
 * The body as JSON.
 * @example
 * ```ts
 * // json :: Request -> Task Json
 * await run (json (request))
 * // => { text: 'wrote' }
 * ```
 */
export function json(request: Request): F.Future<unknown, Json> {
  return F.attemptP (() => request.json () as Promise<Json>)
}

/**
 * The body as text, unparsed.
 * @example
 * ```ts
 * // text :: Request -> Task String
 * await run (text (request))
 * // => 'text=yes'
 * ```
 */
export function text(request: Request): F.Future<unknown, string> {
  return F.attemptP (() => request.text ())
}

const searchIn = (url: URL): readonly (readonly [string, string])[] =>
  P.fromIterable (url.searchParams)

const searchPairs: (url: URL) => readonly P.Pair<string, string>[] = P.pipe ([
  searchIn,
  P.map ((one: readonly [string, string]) => P.fromTuple (one)),
])

/**
 * What the query string carried.
 * @example
 * ```ts
 * // query :: URL -> StrMap String
 * query (new URL ('http://x/blog?tag=fp&page=2'))
 * // => { tag: 'fp', page: '2' }
 * ```
 */
export const query: (url: URL) => Readonly<P.StrMap<string>> = P.pipe ([
  searchPairs,
  P.fromPairs<string>,
])

/**
 * The same query, but every value under its name.
 * @example
 * ```ts
 * // queryAll :: URL -> StrMap (Array String)
 * queryAll (new URL ('http://x/blog?tag=fp&tag=deno&page=2'))
 * // => { tag: ['fp', 'deno'], page: ['2'] }
 * ```
 */
export const queryAll: (url: URL) => Readonly<P.StrMap<readonly string[]>> = P
  .pipe ([
    searchPairs,
    groupedOf,
  ])

/**
 * One header, or nothing if it was not sent.
 * @example
 * ```ts
 * // header :: String -> Request -> Maybe String
 * header ('accept') (request)
 * // => just('application/json')
 * ```
 */
export function header(name: string): (request: Request) => P.Maybe<string> {
  return (request: Request): P.Maybe<string> =>
    P.fromNullable (request.headers.get (name))
}

const noCookies: Readonly<P.StrMap<string>> = {}

/**
 * The cookies that came with the request, by name and unescaped.
 * @example
 * ```ts
 * // cookies :: Request -> StrMap String
 * cookies (request)
 * // => { visitor: 'anya' }
 * ```
 */
export const cookies = (request: Request): Readonly<P.StrMap<string>> =>
  P.maybe_ (P.K (noCookies)) (Ck.read) (header ('cookie') (request))

const isFields = (body: Json): body is Readonly<P.StrMap<Json>> =>
  P.isStrMap (body)

const fieldOf =
  (name: string) => (body: Readonly<P.StrMap<Json>>): P.Maybe<Json> =>
    P.lookup (name) (body)

/**
 * A field of a JSON body, if the body is an object and has one.
 * @example
 * ```ts
 * jsonField ('text') ({ text: 'hello' }) // => just ('hello')
 * jsonField ('text') ([1, 2]) // => nothing ()
 * ```
 */
export function jsonField(name: string): (body: Json) => P.Maybe<Json> {
  return P.pipe ([P.fromPredicate (isFields), P.chain (fieldOf (name))])
}

/**
 * The same value as a string, if that is what it is.
 * @example
 * ```ts
 * chain (jsonText) (jsonField ('text') (body)) // => Maybe String
 * ```
 */
export const jsonText: (value: Json) => P.Maybe<string> = P.fromPredicate (
  P.isString,
)
