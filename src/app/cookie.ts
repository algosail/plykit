import * as P from '@algosail/ply'

/** How far a cookie is allowed to travel with a request. */
export type SameSite = 'strict' | 'lax' | 'none'

/** What is set, and under what conditions it comes back. */
export type Cookie = {
  readonly name: string
  readonly value: string
  readonly path: string
  /** How long it lives, in seconds. */
  readonly maxAge: P.Maybe<number>
  /** Kept from scripts, which is what a session cookie wants. */
  readonly httpOnly: boolean
  /** Sent over https only. */
  readonly secure: boolean
  readonly sameSite: SameSite
}

/**
 * A cookie under the defaults a session wants: the whole site, no script, and sent on ordinary navigation but not from another site's form.
 * @example
 * ```ts
 * // cookie :: String -> String -> Cookie
 * cookie ('visitor') ('7')
 * // => { name: 'visitor', value: '7', path: '/', httpOnly: true, … }
 * ```
 */
export const cookie = (name: string) => (value: string): Cookie => ({
  name,
  value,
  path: '/',
  maxAge: P.nothing (),
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
})

const agedFor = P.set ('maxAge')

/**
 * The same cookie, kept for this many seconds.
 * @example
 * ```ts
 * // during :: Number -> Cookie -> Cookie
 * during (60 * 60 * 24 * 7) (cookie ('visitor') ('7'))
 * // => a cookie that outlives the browser by a week
 * ```
 */
export const during = (seconds: number): (c: Cookie) => Cookie =>
  agedFor (P.just (seconds))

/**
 * The same cookie, sent back only under this path.
 * @example
 * ```ts
 * // at :: String -> Cookie -> Cookie
 * at ('/admin') (cookie ('seen') ('1')).path
 * // => '/admin'
 * ```
 */
export const at: (path: string) => (c: Cookie) => Cookie = P.set ('path')

/**
 * The same cookie, readable by scripts.
 * @example
 * ```ts
 * // readable :: Cookie -> Cookie
 * readable (cookie ('theme') ('dark')).httpOnly
 * // => false
 * ```
 */
export const readable: (c: Cookie) => Cookie = P.set (
  'httpOnly',
) (false)

/**
 * The same cookie, sent over plain http as well.
 * @example
 * ```ts
 * // insecure :: Cookie -> Cookie
 * insecure (cookie ('visitor') ('7')).secure
 * // => false
 * ```
 */
export const insecure: (c: Cookie) => Cookie = P.set ('secure') (false)

/**
 * The cookie that removes one: the same name, nothing in it, and no time left.
 * @example
 * ```ts
 * // expire :: String -> Cookie
 * expire ('visitor').maxAge
 * // => just(0)
 * ```
 */
export const expire = (name: string): Cookie => during (0) (cookie (name) (''))

/** A word that appears on the line when its claim holds, and nothing else. */
type Flag = P.Pair<(c: Cookie) => boolean, string>

const flags: readonly Flag[] = [
  P.pair ((c: Cookie) => c.httpOnly, 'HttpOnly'),
  P.pair ((c: Cookie) => c.secure, 'Secure'),
]

const isOn = (c: Cookie) => (one: Flag): boolean => one.fst (c)

const flagsOf = (c: Cookie): readonly string[] =>
  P.map ((one: Flag) => one.snd) (P.filter (isOn (c)) (flags))

const capitalized = (s: string): string => P.toUpper (s.slice (0, 1)) + s.slice (1)

const ageOf = (c: Cookie): readonly string[] =>
  P.maybe_ (
    P.K<readonly string[]> ([]),
  ) (
    (seconds: number) => [`Max-Age=${seconds}`],
  ) (c.maxAge)

/**
 * Writes one out as a `Set-Cookie` line.
 * @example
 * ```ts
 * // serialize :: Cookie -> String
 * serialize (during (60) (cookie ('visitor') ('anya')))
 * // => 'visitor=anya; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax'
 * ```
 */
export const serialize = (c: Cookie): string =>
  P.intercalate (P.Concat) ('; ') ([
    `${c.name}=${encodeURIComponent (c.value)}`,
    `Path=${c.path}`,
    ...ageOf (c),
    ...flagsOf (c),
    `SameSite=${capitalized (c.sameSite)}`,
  ])

/** One `name=value` as it was carried, and as it is meant. */
type Carried = P.Pair<string, string>

const unescaped = (value: string): string =>
  P.fromMaybe (value) (P.maybeEncase (decodeURIComponent) (value))

const cutAt = (raw: string) => (mark: number): Carried =>
  P.pair (P.trim (raw.slice (0, mark)), unescaped (raw.slice (mark + 1)))

const isInside = (mark: number): boolean => mark > 0

const carriedIn = (raw: string): P.Maybe<Carried> =>
  P.pipe ([P.fromPredicate (isInside), P.map (cutAt (raw))]) (raw.indexOf ('='))

const firstWins = (all: readonly Carried[]): readonly Carried[] =>
  P.reverse (all)

/**
 * What a `Cookie` header carried, by name.
 * @example
 * ```ts
 * // read :: String -> StrMap String
 * read ('visitor=anya; theme=dark')
 * // => { visitor: 'anya', theme: 'dark' }
 * ```
 */
export const read: (header: string) => Readonly<P.StrMap<string>> = P.pipe ([
  P.splitOn (';'),
  P.map (carriedIn),
  P.justs,
  firstWins,
  P.fromPairs,
])
