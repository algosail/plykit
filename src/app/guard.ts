import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Cookie } from './cookie.ts'
import type { Answering, Context, Middleware, Reply } from './types.ts'
import * as Ck from './cookie.ts'
import * as Rp from './reply.ts'
import { cookies as readCookies } from './request.ts'
import { base64Url } from './sign.ts'

/** The name of the cookie, of the field, and of the header, by default. */
export const CSRF_COOKIE = 'kit-csrf'
export const CSRF_FIELD = '_csrf'
export const CSRF_HEADER = 'kit-csrf'

const ISSUED = 'kit-csrf-issued'

const SAFE: readonly string[] = ['GET', 'HEAD', 'OPTIONS']

/** How strict to be, when the defaults are not right. */
export type GuardOptions = {
  /** Whether to refuse a request whose `Origin` is not this site's. */
  readonly origin?: boolean
  /** Whether the token's cookie is for https only. */
  readonly secure?: boolean
}

/** The same options with every default filled in, worked out once. */
type Strictness = {
  readonly checkOrigin: boolean
  readonly secure: boolean
}

const strictnessOf = (options: GuardOptions): Strictness => ({
  checkOrigin: P.defaultTo (true) (options.origin),
  secure: P.defaultTo (true) (options.secure),
})

const fresh = (): string =>
  base64Url (crypto.getRandomValues (new Uint8Array (32)).buffer)

const codesOf = (said: string): readonly number[] =>
  P.map ((c: string) => c.codePointAt (0) ?? 0) (P.fromIterable (said))

const differenceIn = (a: string, b: string): number =>
  P.reduce ((acc: number, both: P.Pair<number, number>) =>
    acc | (both.fst ^ both.snd),
  ) (0) (
    P.zipWith ((one: number, other: number) => P.pair (one, other)) (codesOf (a)) (
      codesOf (b),
    ),
  )

const matches = (a: string) => (b: string): boolean =>
  a.length === b.length && differenceIn (a, b) === 0

const carried = (request: Request): P.Maybe<string> =>
  P.lookup (CSRF_COOKIE) (readCookies (request))

/**
 * The token for this request: the one just issued, or the one the browser brought.
 * @example
 * ```ts
 * // csrfToken :: Request -> Maybe String
 * csrfToken (ctx.request) // => just ('nUq8…')
 * ```
 */
export function csrfToken(request: Request): P.Maybe<string> {
  return P.maybe_ (
    () => carried (request),
  ) (
    P.just<string>,
  ) (P.fromNullable (request.headers.get (ISSUED)))
}

/**
 * The hidden field a form needs, as props.
 * @example
 * ```ts
 * Dom.form ({ method: 'post' }, [
 *   Dom.input (csrfProps (ctx.request)),
 *   Dom.input ({ name: 'text' }),
 * ])
 * ```
 */
export function csrfProps(request: Request): Readonly<Record<string, string>> {
  return {
    type: 'hidden',
    name: CSRF_FIELD,
    value: P.fromMaybe ('') (csrfToken (request)),
  }
}

const asTokenCookie = (strict: Strictness): (token: string) => Cookie =>
  P.pipe (
    Ck.cookie (CSRF_COOKIE),
    Ck.readable,
    P.onlyIf (!strict.secure) (Ck.insecure),
  )

/** A request, the token it will use, and whether that token is brand new. */
type Guarded<C extends Context> = {
  readonly strict: Strictness
  readonly ctx: C
  readonly token: string
  readonly minted: boolean
}

const guarding = (strict: Strictness) => <C extends Context>(ctx: C): Guarded<C> =>
  P.maybe_ (
    (): Guarded<C> => ({ strict, ctx, token: fresh (), minted: true }),
  ) (
    (token: string): Guarded<C> => ({ strict, ctx, token, minted: false }),
  ) (carried (ctx.request))

const onwardFrom = <C extends Context>(at: Guarded<C>): C => {
  const headers = new Headers (at.ctx.request.headers)
  headers.set (ISSUED, at.token)
  return P.set ('request') (
    new Request (at.ctx.request, { headers }),
  ) (at.ctx)
}

const remembering = <C extends Context>(at: Guarded<C>): (reply: Reply) => Reply =>
  P.onlyIf (at.minted) (
    Rp.cookie (asTokenCookie (at.strict) (at.token))<Reply>,
  )

const isSafe = <C extends Context>(at: Guarded<C>): boolean =>
  P.elem (at.ctx.request.method) (SAFE)

const isForm = (type: string): boolean =>
  type.includes ('form-urlencoded') || type.includes ('multipart/form-data')

const isFormBody = <C extends Context>(at: Guarded<C>): boolean =>
  isForm (P.defaultTo ('') (at.ctx.request.headers.get ('content-type')))

const inHeader = <C extends Context>(at: Guarded<C>): P.Maybe<string> =>
  P.fromNullable (at.ctx.request.headers.get (CSRF_HEADER))

const inFields = <C extends Context>(at: Guarded<C>): F.Future<unknown, P.Maybe<string>> =>
  P.map (
    P.either ((_e: unknown): P.Maybe<string> => P.nothing<string> ()) (
      (fields: FormData) => P.fromPredicate (P.isString) (fields.get (CSRF_FIELD)),
    ),
  ) (
    F.coalesce (P.left<unknown, FormData>) (P.right<unknown, FormData>) (
      F.attemptP (() => at.ctx.request.clone ().formData ()),
    ),
  )

const inBody = <C extends Context>(at: Guarded<C>): F.Future<unknown, P.Maybe<string>> =>
  P.boolean (F.resolve (P.nothing<string> ())) (inFields (at)) (isFormBody (at))

const shownIn = <C extends Context>(at: Guarded<C>): F.Future<unknown, P.Maybe<string>> =>
  P.maybe_ (
    () => inBody (at),
  ) (
    (one: string) => F.resolve (P.just (one)),
  ) (inHeader (at))

const refuseIf = (yes: boolean) => (why: () => Reply): P.Maybe<Reply> =>
  P.map ((_: true) => why ()) (P.fromPredicate (P.isTrue) (yes))

const refuseUnless = (ok: boolean): (why: () => Reply) => P.Maybe<Reply> =>
  refuseIf (!ok)

/** One reason an unsafe request is not this site's. */
type Reason<C extends Context> = (at: Guarded<C>) => P.Maybe<Reply>

const noToken = <C extends Context>(at: Guarded<C>): P.Maybe<Reply> =>
  refuseIf (at.minted) (() =>
    Rp.cookie (asTokenCookie (at.strict) (at.token)) (
      Rp.failed (403) ('no csrf token: the page was opened too long ago'),
    ),
  )

const saysElsewhere = <C extends Context>(at: Guarded<C>): boolean =>
  P.any ((origin: string) => origin !== at.ctx.url.origin) (
    P.fromNullable (at.ctx.request.headers.get ('origin')),
  )

const checksOrigin = <C extends Context>(at: Guarded<C>): boolean => at.strict.checkOrigin

const otherSite = <C extends Context>(at: Guarded<C>): P.Maybe<Reply> =>
  refuseIf (
    P.allPass ([P.predicate (checksOrigin<C>), P.predicate (saysElsewhere<C>)]) (
      at,
    ),
  ) (() => Rp.failed (403) ('the request came from another site'))

const cheaply = <C extends Context>(at: Guarded<C>): P.Maybe<Reply> =>
  P.findMap ((reason: Reason<C>) => reason (at)) ([noToken<C>, otherSite<C>])

const mismatched = <C extends Context>(at: Guarded<C>): F.Future<unknown, P.Maybe<Reply>> =>
  P.map ((shown: P.Maybe<string>) =>
    refuseUnless (P.any (matches (at.token)) (shown)) (() =>
      Rp.failed (403) ('the csrf token did not match'),
    ),
  ) (shownIn (at))

const refusedAt = <C extends Context>(at: Guarded<C>): F.Future<unknown, P.Maybe<Reply>> =>
  P.maybe_ (
    () => mismatched (at),
  ) (
    (one: Reply) => F.resolve (P.just (one)),
  ) (cheaply (at))

const passing =
  <C extends Context>(next: Answering<C>) => (at: Guarded<C>): F.Future<unknown, Reply> =>
    P.map (remembering (at)) (next (onwardFrom (at)))

const checking =
  <C extends Context>(next: Answering<C>) => (at: Guarded<C>): F.Future<unknown, Reply> =>
    P.chain (
      P.maybe_ (
        () => passing (next) (at),
      ) (
        (one: Reply) => F.resolve (one),
      ),
    ) (refusedAt (at))

/**
 * Refuses an unsafe request that did not come from this site, and hands every other request a token to prove it did.
 * @example
 * ```ts
 * // guard :: GuardOptions -> Middleware s
 * app ({ routes, through: [guard (), ...through] })
 * ```
 */
export function guard<C extends Context = Context>(
  options: GuardOptions = {},
): Middleware<C> {
  const guarded = guarding (strictnessOf (options))
  return (next: Answering<C>): Answering<C> =>
    P.pipe (
      guarded<C>,
      P.ifElse<Guarded<C>> (isSafe) (passing (next)) (
        checking (next),
      ),
    )
}
