import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Prebuilt } from '../app/data.ts'
import type { Json } from '../app/types.ts'
import { DATA } from '../app/data.ts'
import { readText } from '../fs/disk.ts'

const isRecord = (parsed: Json): parsed is Prebuilt => P.isStrMap (parsed)

const readingAt = (path: string): F.Future<unknown, string> =>
  F.attemptP (() => readText (path))

const textAt: (path: string) => F.Future<unknown, P.Maybe<string>> = P.pipe ([
  readingAt,
  F.coalesce (P.left<unknown, string>) (P.right<unknown, string>),
  P.map (P.eitherToMaybe<unknown, string>),
])

const asPrebuilt = (said: string): P.Maybe<Prebuilt> =>
  P.chain (P.fromPredicate (isRecord)) (P.parseJson (said) as P.Maybe<Json>)

/**
 * Reads what a build wrote, or nothing where no build wrote any.
 * @example
 * ```ts
 * // readPrebuilt :: String -> Promise (Maybe Prebuilt)
 * readPrebuilt ('site/dist')
 * // => Maybe Prebuilt
 * ```
 */
export const readPrebuilt = async (
  outDir: string,
): Promise<P.Maybe<Prebuilt>> =>
  P.chain (asPrebuilt) (await F.promise (textAt (`${outDir}/${DATA}`)))
