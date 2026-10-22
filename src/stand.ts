import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { KitIsland, Manifest, Sheet } from './build.ts'
import type { Prebuilt } from './data.ts'
import type { Hazard } from './html.ts'
import type { Options as HandlerOptions } from './server.ts'
import type { Arrival, Head, Reply, Route, Routes } from './types.ts'
import { prebuilt } from './data.ts'
import { liveRoute, reloadRoute } from './events.ts'
import { flat } from './router.ts'
import { answer, sendingOut } from './server.ts'
import { LIVE_PATH, RELOAD_PATH } from './types.ts'

/** What a host has settled before it draws: the build's report, and the routes. */
export type Standing<S, E> = {
  readonly options: HandlerOptions<S, E> & {
    readonly include?: readonly KitIsland[]
  }
  readonly manifest: Manifest
  readonly sheet: Sheet
  readonly routes: readonly Route<S, E>[]
}

/** Something that always has an answer. */
export type Draws<E = unknown> = (
  request: Request,
  from?: Arrival<E>,
) => F.Future<unknown, Reply>

/** How a page's `<style>` tags are worked out, where the app has an opinion. */
type Styling = (markup: string) => string

/** What the route list is built from: the app's routes, and which kit islands. */
type Asked<S, E> = {
  readonly routes: Routes<S, E>
  readonly include?: readonly KitIsland[]
}

/** A path one of kit's own islands watches, and the route that answers it. */
type Comes<S, E> = {
  readonly island: KitIsland
  readonly pattern: string
  readonly route: () => Route<S, E>
}

const comesWith = <S, E>(): readonly Comes<S, E>[] => [
  { island: 'live', pattern: LIVE_PATH, route: liveRoute<S, E> },
  { island: 'reload', pattern: RELOAD_PATH, route: reloadRoute<S, E> },
]

const islandOf = <S, E>(comes: Comes<S, E>): KitIsland => comes.island

const patternOf = <S, E>(comes: Comes<S, E>): string => comes.pattern

const asRoute = <S, E>(comes: Comes<S, E>): Route<S, E> => comes.route ()

const routePattern = <S, E>(route: Route<S, E>): string => route.pattern

const asksFor = <S, E>(options: Asked<S, E>) => (island: KitIsland): boolean =>
  P.pipe ([
    P.defaultTo<readonly KitIsland[]> ([]),
    P.elem (island),
  ]) (options.include)

const patternsIn = <S, E>(routes: readonly Route<S, E>[]): readonly string[] =>
  P.map (routePattern<S, E>) (routes)

const claimed = (patterns: readonly string[]) => (pattern: string): boolean =>
  P.elem (pattern) (patterns)

const wanted = <S, E>(options: Asked<S, E>): (comes: Comes<S, E>) => boolean =>
  P.pipe ([islandOf<S, E>, asksFor (options)])

const taken = <S, E>(routes: readonly Route<S, E>[]): (comes: Comes<S, E>) => boolean =>
  P.pipe ([patternOf<S, E>, claimed (patternsIn (routes))])

const coming =
  <S, E>(options: Asked<S, E>) =>
  (routes: readonly Route<S, E>[]): (comes: Comes<S, E>) => boolean =>
    P.predicateAnd (P.predicate (wanted (options))) (
      P.predicateNot (P.predicate (taken (routes))),
    )

const absent =
  <S, E>(options: Asked<S, E>) =>
  (routes: readonly Route<S, E>[]): readonly Comes<S, E>[] =>
    P.filter (coming (options) (routes)) (comesWith<S, E> ())

const mountable =
  <S, E>(options: Asked<S, E>) =>
  (routes: readonly Route<S, E>[]): readonly Route<S, E>[] =>
    P.map (asRoute<S, E>) (absent (options) (routes))

const mounted =
  <S, E>(options: Asked<S, E>) =>
  (routes: readonly Route<S, E>[]): readonly Route<S, E>[] =>
    P.concat (routes) (mountable (options) (routes))

const swapping =
  <S, E>(options: Asked<S, E>) => (data: Prebuilt): readonly Route<S, E>[] =>
    prebuilt<S, E> (data) (options.routes)

const asGiven = <S, E>(options: Asked<S, E>): readonly Route<S, E>[] =>
  flat (options.routes)

const asRead =
  <S, E>(options: Asked<S, E>) => (data: P.Maybe<Prebuilt>): readonly Route<S, E>[] =>
    P.maybe_ (() => asGiven (options)) (swapping (options)) (data)

/**
 * The routes an app answers with: its own, reading prebuilt data where a build left some, plus the kit routes its islands asked for and it did not claim.
 * @example
 * ```ts
 * // routesFrom :: Asked -> Maybe Prebuilt -> Array (Route s)
 * routesFrom ({ routes, include: ['live'] }) (P.nothing ())
 * ```
 */
export const routesFrom =
  <S, E = unknown>(options: Asked<S, E>) => (data: P.Maybe<Prebuilt>): readonly Route<S, E>[] =>
    mounted (options) (asRead (options) (data))

const inlinesOwn = <S, E>(at: Standing<S, E>): boolean =>
  at.options.styles !== undefined

const noLink: (had: P.Maybe<string>) => P.Maybe<string> = P.K (
  P.nothing<string> (),
)

const sheetIn = <S, E>(at: Standing<S, E>): P.Maybe<string> =>
  P.onlyIf (inlinesOwn (at)) (noLink) (at.sheet.styles)

/** A `<link>` tag, attribute by attribute, as a head carries it. */
type Link = Readonly<P.StrMap<string>>

const linkTo = (sheet: Sheet) => (href: string): Link => ({
  rel: 'stylesheet',
  href,
  'data-kit-styles': P.joinWith (' ') (sheet.styleIds),
})

const linking =
  <S, E>(at: Standing<S, E>) => (href: string) => (own: Head): Head => ({
    ...own,
    link: P.pipe ([
      P.defaultTo<readonly Link[]> ([]),
      P.prepend (linkTo (at.sheet) (href)),
    ]) (own.link),
  })

const asIs: () => (head: Head) => Head = P.K (P.I<Head>)

const dressing = <S, E>(at: Standing<S, E>): (head: Head) => Head =>
  P.maybe_ (asIs) (linking (at)) (sheetIn (at))

const ownDressing = <S, E>(at: Standing<S, E>): (head: Head) => Head =>
  P.defaultTo (P.I<Head>) (at.options.head)

const headIn = <S, E>(at: Standing<S, E>): (head: Head) => Head =>
  P.pipe ([ownDressing (at), dressing (at)])

const noStyles: Styling = P.K ('')

const drawnElsewhere: (href: string) => Styling = P.K (noStyles)

const asOwn = <S, E>(at: Standing<S, E>) => (): Styling | undefined =>
  at.options.styles

const stylesIn = <S, E>(at: Standing<S, E>): Styling | undefined =>
  P.maybe_ (asOwn (at)) (drawnElsewhere) (sheetIn (at))

const reloadScript = <S, E>(at: Standing<S, E>): readonly string[] =>
  P.boolean<readonly string[]> ([]) (
    P.toArray (P.lookup ('reload') (at.manifest)),
  ) (asksFor (at.options) ('reload'))

const alwaysIn = <S, E>(at: Standing<S, E>): readonly string[] =>
  P.concat (P.defaultTo<readonly string[]> ([]) (at.options.always)) (
    reloadScript (at),
  )

const sayHazard = (url: URL) => (one: Hazard): void =>
  console.warn (`[kit] ${url.pathname}: ${one.path} — ${one.problem}`)

const warn = (hazards: readonly Hazard[], url: URL): void => {
  P.forEach (sayHazard (url)) (hazards)
}

/**
 * Draws the pages of an app that has already settled its chunks and its routes.
 * @example
 * ```ts
 * // drawingOf :: Standing -> Request -> Task Reply
 * drawingOf ({ options, manifest, sheet, routes })
 * ```
 */
export function drawingOf<S, E = unknown>(at: Standing<S, E>): Draws<E> {
  return answer ({
    ...at.options,
    routes: at.routes,
    chunks: at.manifest,
    head: headIn (at),
    styles: stylesIn (at),
    onHazard: P.defaultTo (warn) (at.options.onHazard),
    always: alwaysIn (at),
  } as HandlerOptions<S, E>)
}

/**
 * The same drawing, as the `Response` a host returns.
 * @example
 * ```ts
 * // answered :: Draws -> Request -> Promise Response
 * answered (drawingOf (standing)) (request)
 * ```
 */
export const answered =
  <E>(drawn: Draws<E>) => (request: Request, from?: Arrival<E>): Promise<Response> =>
    F.promise (P.map (sendingOut) (drawn (request, from)))
