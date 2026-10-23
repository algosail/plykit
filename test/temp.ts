import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import { mkdtemp, rm, rmSync } from '../src/fs/disk.ts'

/**
 * Where a check writes: the site directory and the chunk directory.
 */
export type Dirs = {
  readonly out: string
  readonly outDir: string
}

const making = (): F.Future<unknown, string> => F.attemptP (() => mkdtemp ())

const bothMade = (): F.Future<unknown, Dirs> =>
  P.ap (
    P.map ((out: string) => (outDir: string): Dirs => ({ out, outDir })) (
      making (),
    ),
  ) (making ())

const clearing = (dir: string): F.Future<unknown, void> =>
  P.voided (
    F.coalesce (P.left<unknown, void>) (P.right<unknown, void>) (
      F.attemptP (() => rm (dir, { recursive: true })),
    ),
  )

const clearingBoth = (dirs: Dirs): F.Future<unknown, void> =>
  P.voided (F.parallel (1) ([clearing (dirs.out), clearing (dirs.outDir)]))

const taking =
  <A, B>(use: (a: A) => Promise<B>) => (a: A): F.Future<unknown, B> =>
    F.attemptP (() => use (a))

const removingSync = (dir: string): void => {
  rmSync (dir, { recursive: true })
}

const swept = (dir: string) => (): void => {
  P.encase (removingSync) (dir)
}

/**
 * A directory for the whole test file, removed on exit.
 * @example
 * const dir = await fileDir()
 */
export const fileDir = async (): Promise<string> => {
  const dir = await mkdtemp ()
  process.on ('exit', swept (dir))
  return dir
}

/**
 * One temporary directory for as long as a check runs.
 * @example
 * test('…', () => inDir(async (outDir) => { … }))
 */
export const inDir = <A>(use: (dir: string) => Promise<A>): Promise<A> =>
  F.promise (
    P.chain ((dir: string) => F.lastly (clearing (dir)) (taking (use) (dir))) (
      making (),
    ),
  )

/**
 * Two temporary directories for as long as a check runs: where the site is written and where the chunks go.
 * @example
 * test('…', () => inDirs(async ({ out, outDir }) => { … }))
 */
export const inDirs = <A>(use: (dirs: Dirs) => Promise<A>): Promise<A> =>
  F.promise (
    P.chain ((dirs: Dirs) => F.lastly (clearingBoth (dirs)) (taking (use) (dirs))) (
      bothMade (),
    ),
  )
