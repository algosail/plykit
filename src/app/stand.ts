import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { KitIsland, Manifest, Sheet } from '../build/build.ts'
import type { Hazard } from '../document/html.ts'
import type { Prebuilt } from './data.ts'
import type { Options as HandlerOptions } from './server.ts'
import type { Arrival, Context, Reply, Route, Routes } from './types.ts'
import { collectBeyond } from '../document/css.ts'
import { prebuilt } from './data.ts'
import { liveRoute, reloadRoute } from './events.ts'
import { flat } from './router.ts'
import { answer, sendingOut } from './server.ts'
import { LIVE_PATH, RELOAD_PATH } from './types.ts'

/** What a host has settled before it draws: the build's report, and the routes. */
export type Standing<C extends Context> = {
  readonly options: HandlerOptions<C> & {
    readonly include?: readonly KitIsland[]
  }
  readonly manifest: Manifest
  readonly sheet: Sheet
  readonly routes: readonly Route<C>[]
}

/** Something that always has an answer. */
export type Draws<E = unknown> = (
  request: Request,
  from?: Arrival<E>,
) => F.Future<unknown, Reply>

/** How a page's `<style>` tags are worked out, where the app has an opinion. */
type Styling = (markup: string) => string

/** What the route list is built from: the app's routes, and which kit islands. */
type Asked<C extends Context> = {
  readonly routes: Routes<C>
  readonly include?: readonly KitIsland[]
}

/** A path one of kit's own islands watches, and the route that answers it. */
type Comes<C extends Context> = {
  readonly island: KitIsland
  readonly pattern: string
  readonly route: () => Route<C>
}

const comesWith = <C extends Context>(): readonly Comes<C>[] => [
  { island: 'live', pattern: LIVE_PATH, route: liveRoute<C> },
  { island: 'reload', pattern: RELOAD_PATH, route: reloadRoute<C> },
]

const islandOf = <C extends Context>(comes: Comes<C>): KitIsland => comes.island

const patternOf = <C extends Context>(comes: Comes<C>): string => comes.pattern

const asRoute = <C extends Context>(comes: Comes<C>): Route<C> => comes.route ()

const routePattern = <C extends Context>(route: Route<C>): string => route.pattern

const asksFor = <C extends Context>(options: Asked<C>) => (island: KitIsland): boolean =>
  P.pipe ([
    P.defaultTo<readonly KitIsland[]> ([]),
    P.elem (island),
  ]) (options.include)

const patternsIn = <C extends Context>(routes: readonly Route<C>[]): readonly string[] =>
  P.map (routePattern<C>) (routes)

const claimed = (patterns: readonly string[]) => (pattern: string): boolean =>
  P.elem (pattern) (patterns)

const wanted = <C extends Context>(options: Asked<C>): (comes: Comes<C>) => boolean =>
  P.pipe ([islandOf<C>, asksFor (options)])

const taken = <C extends Context>(routes: readonly Route<C>[]): (comes: Comes<C>) => boolean =>
  P.pipe ([patternOf<C>, claimed (patternsIn (routes))])

const coming =
  <C extends Context>(options: Asked<C>) =>
  (routes: readonly Route<C>[]): (comes: Comes<C>) => boolean =>
    P.predicateAnd (P.predicate (wanted (options))) (
      P.predicateNot (P.predicate (taken (routes))),
    )

const absent =
  <C extends Context>(options: Asked<C>) =>
  (routes: readonly Route<C>[]): readonly Comes<C>[] =>
    P.filter (coming (options) (routes)) (comesWith<C> ())

const mountable =
  <C extends Context>(options: Asked<C>) =>
  (routes: readonly Route<C>[]): readonly Route<C>[] =>
    P.map (asRoute<C>) (absent (options) (routes))

const mounted =
  <C extends Context>(options: Asked<C>) =>
  (routes: readonly Route<C>[]): readonly Route<C>[] =>
    P.concat (routes) (mountable (options) (routes))

const swapping =
  <C extends Context>(options: Asked<C>) => (data: Prebuilt): readonly Route<C>[] =>
    prebuilt<C> (data) (options.routes)

const asGiven = <C extends Context>(options: Asked<C>): readonly Route<C>[] =>
  flat (options.routes)

const asRead =
  <C extends Context>(options: Asked<C>) => (data: P.Maybe<Prebuilt>): readonly Route<C>[] =>
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
  <C extends Context = Context>(options: Asked<C>) => (data: P.Maybe<Prebuilt>): readonly Route<C>[] =>
    mounted (options) (asRead (options) (data))

const inlinesOwn = <C extends Context>(at: Standing<C>): boolean =>
  at.options.styles !== undefined

const noLink: (had: P.Maybe<string>) => P.Maybe<string> = P.K (
  P.nothing<string> (),
)

const sheetIn = <C extends Context>(at: Standing<C>): P.Maybe<string> =>
  P.onlyIf (inlinesOwn (at)) (noLink) (at.sheet.styles)

/** A `<link>` tag, attribute by attribute, as a head carries it. */
type Link = Readonly<P.StrMap<string>>

const linkTo = (sheet: Sheet) => (href: string): Link => ({
  rel: 'stylesheet',
  href,
  'data-kit-styles': P.joinWith (' ') (sheet.styleIds),
})

/** Kit's own sheet. It leads the links a page settled on, and a page cannot drop it by replacing `link`. */
const styleLinkOf = <C extends Context>(
  at: Standing<C>,
): Link | undefined =>
  P.maybe_<Link | undefined> (() => undefined) (linkTo (at.sheet)) (sheetIn (at))

const asOwn = <C extends Context>(at: Standing<C>) => (): Styling | undefined =>
  at.options.styles

const stylesIn = <C extends Context>(at: Standing<C>): Styling | undefined =>
  P.maybe_ (asOwn (at)) (
    () => collectBeyond (at.sheet.styleIds),
  ) (sheetIn (at))

const reloadScript = <C extends Context>(at: Standing<C>): readonly string[] =>
  P.boolean<readonly string[]> ([]) (
    P.toArray (P.lookup ('reload') (at.manifest)),
  ) (asksFor (at.options) ('reload'))

const alwaysIn = <C extends Context>(at: Standing<C>): readonly string[] =>
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
export function drawingOf<C extends Context = Context>(at: Standing<C>): Draws<C['env']> {
  return answer ({
    ...at.options,
    routes: at.routes,
    chunks: at.manifest,
    styleLink: styleLinkOf (at),
    styles: stylesIn (at),
    onHazard: P.defaultTo (warn) (at.options.onHazard),
    always: alwaysIn (at),
  } as HandlerOptions<C>)
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
