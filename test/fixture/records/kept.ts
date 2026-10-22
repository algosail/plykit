import * as F from '@algosail/plyfuture'

/**
 * One list for the life of the process. `look` reads it and `change` replaces it; both are the effect, and a pure function sits between them.
 * @example
 * ```ts
 * // kept :: Array a -> { look :: () -> !Task (Array a), change :: (Array a -> Array a) -> !Task (Array a) }
 * const shelf = kept (['hobbit'])
 * await F.promise (shelf.look ())
 * // => ['hobbit']
 * ```
 */
export const kept = <A>(start: readonly A[]) => {
  let held: readonly A[] = start

  // look :: () -> !Task (Array a)
  const look = (): F.Future<unknown, readonly A[]> => F.attempt (() => held)

  // change :: (Array a -> Array a) -> !Task (Array a)
  const change = (
    f: (now: readonly A[]) => readonly A[],
  ): F.Future<unknown, readonly A[]> =>
    F.attempt (() => {
      held = f (held)
      return held
    })

  return { look, change }
}
