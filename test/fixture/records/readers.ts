import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import { kept } from './kept.ts'

/** Whoever is asking, once the cookie and this list agree. */
export type Reader = {
  readonly id: string
  readonly name: string
}

const people = kept<Reader> ([])

const sameId = (id: string) => (r: Reader): boolean => P.equals (id) (r.id)

/** The reader that identifier stands for, if it still stands for one. */
export const by = (id: string): F.Future<unknown, P.Maybe<Reader>> =>
  P.map (P.find (sameId (id))) (people.look ())

const named = (name: string) => (id: string): Reader => ({ id, name })

// mint :: () -> !String
const mint = (): string => crypto.randomUUID ()

/** Signs someone in under a fresh identifier. */
export const arrive = (name: string): F.Future<unknown, Reader> =>
  P.chain ((known: readonly Reader[]) => {
    const fresh = named (name) (mint ())
    return P.map (() => fresh) (people.change (P.append (fresh)))
  }) (people.look ())

const gone = (id: string) => (known: readonly Reader[]): readonly Reader[] =>
  P.reject (sameId (id)) (known)

/** Signs them out. */
export const leave = (id: string): F.Future<unknown, void> =>
  P.voided (people.change (gone (id)))
