import * as P from '@algosail/ply'
import type { Literal } from './literal.ts'
import { describe, describeRecipe } from '../document/tokens.ts'
import { readLiteral, skip } from './literal.ts'

const TOKENS = /(?:export\s+)?const\s*\{([^}]*)\}\s*=\s*tokens\s*\(/g

const IMPORT = /import\s*\{([^}]+)\}\s*from\s*(['"])(\.[^'"]*)\2/g

const ASSIGN = /(?:export\s+)?const\s+[A-Za-z_$][\w$]*\s*=\s*$/

type StyleBind = {
  readonly tag: 'style'
  readonly table: RecordLiteral
}

type RecipeBind = {
  readonly tag: 'recipe'
  readonly table: RecordLiteral
}

type MadeBind = {
  readonly tag: 'made'
  readonly table: RecordLiteral
  readonly spec: RecordLiteral
}

type Bind = StyleBind | RecipeBind | MadeBind

type RecordLiteral = { readonly [key: string]: Literal }

const isObject = (value: Literal): value is RecordLiteral =>
  typeof value === 'object' && value !== null

const asBind = (name: string, table: RecordLiteral): Bind | undefined =>
  name === 'style' || name === 'recipe' ? { tag: name, table } : undefined

const namesIn = (said: string): readonly string[] =>
  said.split (',').map ((one) => one.trim ()).filter ((one) =>
    one === 'style' || one === 'recipe',
  )

const tablesIn = (source: string): ReadonlyMap<string, RecordLiteral> => {
  const found = new Map<string, RecordLiteral> ()
  for (const match of source.matchAll (TOKENS)) {
    const open = (match.index ?? 0) + match[0].length - 1
    const read = readLiteral (source) (open + 1)
    if (read.tag !== 'keep' || !isObject (read.value)) continue
    for (const name of namesIn (match[1] ?? '')) found.set (name, read.value)
  }
  return found
}

const bindsIn = (
  source: string,
  files: ReadonlyMap<string, string>,
): ReadonlyMap<string, Bind> => {
  const found = new Map<string, Bind> ()
  for (const match of source.matchAll (IMPORT)) {
    const spec = match[3]
    if (spec === undefined) continue
    const foreign = files.get (spec)
    if (foreign === undefined) continue
    const tables = tablesIn (foreign)
    for (const name of namesIn (match[1] ?? '')) {
      const table = tables.get (name)
      if (table === undefined) continue
      const bind = asBind (name, table)
      if (bind !== undefined) found.set (name, bind)
    }
  }
  for (const [name, table] of tablesIn (source)) {
    const bind = asBind (name, table)
    if (bind !== undefined) found.set (name, bind)
  }
  return found
}

const callAt = (source: string) => (name: string): readonly number[] => {
  const re = new RegExp (`(?<![\\w$.])${name}\\s*\\(`, 'g')
  return [...source.matchAll (re)].flatMap ((match) =>
    match.index === undefined ? [] : [match.index],
  )
}

type Job = {
  readonly at: number
  readonly end: number
  readonly text: string
}

const knownIds = (known: ReadonlySet<string>) => (ids: readonly string[]): boolean =>
  ids.length > 0 && ids.every ((id) => known.has (id))

const argumentAt = (source: string) => (open: number): P.Maybe<{
  readonly end: number
  readonly value: RecordLiteral
}> => {
  const read = readLiteral (source) (open + 1)
  if (read.tag !== 'keep' || !isObject (read.value)) return P.nothing ()
  const after = skip (source) (read.at)
  return source[after] === ')'
    ? P.just ({ end: after + 1, value: read.value })
    : P.nothing ()
}

const jobsFor = (
  source: string,
  known: ReadonlySet<string>,
  binds: ReadonlyMap<string, Bind>,
): readonly Job[] => {
  const ready = knownIds (known)
  const made = new Map<string, MadeBind> ()
  const jobs: Job[] = []
  for (const [name, bind] of binds) {
    if (bind.tag !== 'recipe') continue
    for (const at of callAt (source) (name)) {
      const open = source.indexOf ('(', at)
      if (open < 0) continue
      const arg = argumentAt (source) (open)
      if (arg.tag === 'nothing') continue
      const read = arg.value
      const head = source.slice (0, at)
      const assigned = ASSIGN.exec (head)
      if (assigned !== null) {
        const local = /([A-Za-z_$][\w$]*)\s*=\s*$/.exec (head)?.[1]
        if (local !== undefined) {
          made.set (local, { tag: 'made', table: bind.table, spec: read.value })
        }
        continue
      }
      const next = skip (source) (read.end)
      if (source[next] !== '(') continue
      const pick = argumentAt (source) (next)
      if (pick.tag === 'nothing') continue
      const atoms = describeRecipe (bind.table) (read.value) (pick.value.value)
      if (!ready (atoms.map ((one) => one.id))) continue
      const text = atoms.flatMap ((one) =>
        one.className === undefined ? [] : [one.className],
      ).join (' ')
      jobs.push ({ at, end: pick.value.end, text: JSON.stringify (text) })
    }
  }
  const wear = (table: RecordLiteral, decl: RecordLiteral, at: number, end: number): void => {
    const atoms = describe (table) (decl)
    if (!ready (atoms.map ((one) => one.id))) return
    const text = atoms.flatMap ((one) =>
      one.className === undefined ? [] : [one.className],
    ).join (' ')
    jobs.push ({ at, end, text: JSON.stringify (text) })
  }
  for (const [name, bind] of binds) {
    if (bind.tag !== 'style') continue
    for (const at of callAt (source) (name)) {
      const open = source.indexOf ('(', at)
      if (open < 0) continue
      const arg = argumentAt (source) (open)
      if (arg.tag === 'nothing') continue
      wear (bind.table, arg.value.value, at, arg.value.end)
    }
  }
  for (const [name, bind] of made) {
    for (const at of callAt (source) (name)) {
      const open = source.indexOf ('(', at)
      if (open < 0) continue
      const arg = argumentAt (source) (open)
      if (arg.tag === 'nothing') continue
      const atoms = describeRecipe (bind.table) (bind.spec) (arg.value.value)
      if (!ready (atoms.map ((one) => one.id))) continue
      const text = atoms.flatMap ((one) =>
        one.className === undefined ? [] : [one.className],
      ).join (' ')
      jobs.push ({ at, end: arg.value.end, text: JSON.stringify (text) })
    }
  }
  return jobs
}

const apply = (source: string) => (jobs: readonly Job[]): string => {
  const ordered = [...jobs].sort ((a, b) => a.at - b.at)
  let out = ''
  let cursor = 0
  for (const job of ordered) {
    if (job.at < cursor) continue
    out += source.slice (cursor, job.at) + job.text
    cursor = job.end
  }
  return out + source.slice (cursor)
}

/**
 * The same source with static `style({...})` and `recipe(...)({...})` calls replaced by their class string.
 * A call whose atoms are not in `known` is left as written.
 * @example
 * ```ts
 * replaceAtoms ('const s = style({ padding: "4" })', new Set (), new Map ())
 * // => nothing ()
 * ```
 */
export const replaceAtoms = (
  source: string,
  known: ReadonlySet<string>,
  files: ReadonlyMap<string, string>,
): P.Maybe<string> => {
  const jobs = jobsFor (source, known, bindsIn (source, files))
  if (jobs.length === 0) return P.nothing ()
  const next = apply (source) (jobs)
  return next === source ? P.nothing () : P.just (next)
}
