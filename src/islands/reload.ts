import * as P from '@algosail/ply'
import * as D from '@algosail/plydom'
import type { Island } from './island.ts'
import { canListen, RELOAD_EVENT, RELOAD_PATH } from '../app/types.ts'
import { island } from './island.ts'

let run: P.Maybe<string> = P.nothing<string> ()

const learning = (said: string) => (): void => {
  run = P.just (said)
}

const isSame = (said: string) => (known: string): boolean => known === said

const reloading = (_known: string): void => location.reload ()

const checking = (said: string) => (known: string): void => {
  P.forEach (reloading) (P.reject (isSame (said)) (P.just (known)))
}

const heard = (said: string): void => {
  P.maybe_ (learning (said)) (checking (said)) (run)
}

const saidIn = (event: Event): P.Maybe<string> =>
  P.fromPredicate (P.isString) ((event as MessageEvent).data)

const onRun = (event: Event): void => {
  P.forEach (heard) (saidIn (event))
}

const begin = P.once ((): EventSource => {
  const source = new EventSource (RELOAD_PATH)
  source.addEventListener (RELOAD_EVENT, onRun)
  return source
})

const begun = (): void => {
  P.forEach (begin) (P.fromPredicate (P.isTrue) (canListen ()))
}

begun ()

/**
 * The reload island, for a page that would rather say so.
 * @example
 * ```ts
 * // in a layout, in development only:
 * Dom.footer ([navigation ({}), reload ({})])
 * ```
 */
export const reload: Island & ((props: Record<string, never>) => D.Child) =
  island (
    'reload',
    (_props: Record<string, never>) => {
      begun ()
      return D.comment ('kit-reload')
    },
    import.meta.url,
  )
