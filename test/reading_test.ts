import * as P from '@algosail/ply'
import * as D from '@algosail/plydom'
import * as S from '@algosail/plystream'
import { Window } from 'happy-dom'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Change } from './fixture/islands/reading.ts'
import type { Entry } from './fixture/records/list.ts'
import { hydrateIslands, resetIslands } from '../src/mod.ts'
import { patchFormSibling } from './dom.ts'
import { mark } from './fixture/islands/mark.ts'
import {
  adding,
  clearingRead,
  countLeft,
  style as listStyle,
  nextId,
  part,
  reading,
  removing,
  toggling,
} from './fixture/islands/reading.ts'

const win = new Window ()
const doc = win.document as unknown as Document
patchFormSibling (doc.createElement ('div'))

/**
 * Its own window, and it only accepts its own events.
 */
const Made = win.Event as unknown as typeof Event
const mk = (tag: string): Element => {
  const e = doc.createElement (tag) as unknown as {
    style?: Record<string, string>
  }
  if (e.style === undefined) e.style = {}
  return e as unknown as Element
}
D.setBackend ({
  element: mk,
  elementNS: (_ns, tag) => mk (tag),
  text: (d) => doc.createTextNode (d) as unknown as Text,
  comment: (d) => doc.createComment (d) as unknown as Comment,
})
const box = (): Node & { innerHTML: string } =>
  doc.createElement ('div') as unknown as Node & { innerHTML: string }

/**
 * Markup with the slot comments stripped, so assertions stay readable.
 */
const shown = (p: { innerHTML: string }): string =>
  p.innerHTML.replace (/<!--\[-->|<!--\]-->|/g, '')

const dispatchOn = (
  n: Node,
  type: string,
  props: Record<string, unknown> = {},
) => {
  const ev = new Made (type, { bubbles: true, cancelable: true })
  Object.assign (ev, props)
  ;(n as unknown as EventTarget).dispatchEvent (ev)
}

const after = (...changes: readonly Change[]) => (items: readonly Entry[]) =>
  changes.reduce ((was, change) => change (was), items)

const titles = (items: readonly Entry[]) => items.map ((e: Entry) => e.title)

test ('changes — adding writes what was brought', () => {
  const items = adding ('The Hobbit') ([])
  assert.deepStrictEqual ([titles (items), items[0].id], [['The Hobbit'], 1])
})

test ('changes — empty and blank are not added', () => {
  assert.deepStrictEqual (adding ('') ([]).length, 0)
  assert.deepStrictEqual (adding ('   ') ([]).length, 0)
})

test ('changes — adding trims the edges', () => {
  assert.deepStrictEqual (adding ('  The Hobbit  ') ([])[0].title, 'The Hobbit')
})

test ('changes — they fold by composition', () => {
  const items = after (adding ('The Hobbit'), adding ('Solaris'), toggling (1)) ([])
  assert.deepStrictEqual ([titles (items), items[0].read], [['The Hobbit', 'Solaris'], true])
})

test ('changes — only its own entry is toggled', () => {
  const start: readonly Entry[] = [
    { id: 1, title: 'a', read: false },
    { id: 2, title: 'b', read: false },
  ]
  const once = toggling (1) (start)
  assert.deepStrictEqual (once.map ((e: Entry) => e.read), [true, false])
  assert.deepStrictEqual (toggling (1) (once)[0].read, false)
})

test ('changes — removing, and clearing what is read', () => {
  const start: readonly Entry[] = [
    { id: 1, title: 'a', read: true },
    { id: 2, title: 'b', read: false },
  ]
  assert.deepStrictEqual (titles (removing (1) (start)), ['b'])
  assert.deepStrictEqual (titles (clearingRead (start)), ['b'])
})

test ('changes — the next number is asked of the list, not stored', () => {
  assert.deepStrictEqual (nextId ([]), 1)
  assert.deepStrictEqual (nextId ([{ id: 4, title: 'a', read: false }]), 5)
  assert.deepStrictEqual (
    nextId ([{ id: 1, title: 'a', read: false }, {
      id: 9,
      title: 'b',
      read: false,
    }]),
    10,
  )
})

test ('changes — the previous list is not touched', () => {
  const start: readonly Entry[] = [{ id: 1, title: 'a', read: false }]
  const once = toggling (1) (start)
  assert.deepStrictEqual ([start[0].read, once[0].read], [false, true])
})

const folding = (seed: readonly Entry[]) => {
  const [changes, change] = S.bus<Change> ()
  return {
    change,
    items: S.hold (
      (was: readonly Entry[], apply: Change) => apply (was),
      seed,
    ) (changes),
  }
}

test ('fold — the list is given at once and folds the changes', () => {
  const { items, change } = folding ([])

  const seen: string[][] = []
  S.subscribe ((_t: S.Time, es: readonly Entry[]) => seen.push (titles (es))) (
    items,
  )
  assert.deepStrictEqual (seen, [[]])
  change (adding ('The Hobbit'))
  assert.deepStrictEqual (seen, [[], ['The Hobbit']])
})

test ('fold — a late subscriber gets the current list', () => {
  const { items, change } = folding ([])
  S.subscribe (() => {}) (items)
  change (adding ('later'))

  const late: string[][] = []
  S.subscribe ((_t: S.Time, es: readonly Entry[]) => late.push (titles (es))) (
    items,
  )
  assert.deepStrictEqual (late, [['later']])
})

test ('part — stays quiet until the chosen value changes', () => {
  const { items, change } = folding ([{ id: 1, title: 'a', read: false }])

  const counts: number[] = []
  S.subscribe ((_t: S.Time, n: number) => counts.push (n)) (part (countLeft) (items))
  change (toggling (1))
  change (toggling (999))
  change (adding ('b'))
  assert.deepStrictEqual (counts, [1, 0, 1])
})

test ('two folds — the draft and the list do not know about each other', () => {
  const [typed, say] = S.bus<string> ()
  const [added, send] = S.bus<string> ()

  const draft = S.holdWith ('') (
    S.mergeArray<string> ([typed, P.map (() => '') (added)]),
  )
  const items = S.hold (
    (was: readonly Entry[], apply: Change) => apply (was),
    [] as readonly Entry[],
  ) (P.map (adding) (added))

  const drafts: string[] = []
  const lists: string[][] = []
  const a = S.subscribe ((_t: S.Time, d: string) => drafts.push (d)) (draft)
  const b = S.subscribe ((_t: S.Time, es: readonly Entry[]) =>
    lists.push (titles (es)),
  ) (items)

  say ('The Hobbit')
  assert.deepStrictEqual ([drafts, lists], [['', 'The Hobbit'], [[]]])

  send ('The Hobbit')
  assert.deepStrictEqual ([drafts, lists], [['', 'The Hobbit', ''], [[], ['The Hobbit']]])
  S.dispose (a), S.dispose (b)
})

test ('list — the state is visible in the markup, before any script', () => {
  const p = box ()
  const dsp = D.mount (p) (
    reading ({
      seed: [
        { id: 1, title: 'read', read: true },
        { id: 2, title: 'not yet', read: false },
      ],
    }),
  )
  const boxes: string[] = [...p.innerHTML.matchAll (/<input [^>]*>/g)]
    .map ((m) => m[0])
    .filter ((tag) => tag.includes ('type="checkbox"'))
  assert.deepStrictEqual (boxes.length, 2)
  assert.deepStrictEqual (boxes.map ((tag) => tag.includes ('checked')), [true, false])
  assert.ok ((p.innerHTML).includes ('name="title" placeholder="what else to read" value=""'))
  S.dispose (dsp)
})

/**
 * Mounts the island, the way a page does.
 */
const mounted = (seed?: readonly Entry[]) => {
  const app = reading ({ seed: seed ?? [] })
  const p = box ()
  const dsp = D.mount (p) (app)
  return { app, p, dsp }
}

const find = (p: { innerHTML: string }, sel: string): Node =>
  (p as unknown as { querySelector: (s: string) => Node | null })
    .querySelector (sel)!
const findAll = (p: { innerHTML: string }, sel: string): Node[] =>
  (p as unknown as { querySelectorAll: (s: string) => Node[] })
    .querySelectorAll (sel)

const typeInto = (p: { innerHTML: string }, text: string): void => {
  const field = find (p, 'input[placeholder]')
  ;(field as unknown as { value: string }).value = text
  dispatchOn (field, 'input')
}
const submit = (p: { innerHTML: string }): void =>
  dispatchOn (find (p, 'form'), 'submit')
const click = (p: { innerHTML: string }, sel: string): void =>
  dispatchOn (find (p, sel), 'click')

test ('list — drawn at once when it is mounted', () => {
  const { p } = mounted ([{ id: 1, title: 'a', read: false }])
  assert.ok ((shown (p)).includes ('<span>a</span>'))
})

test ('an event carries text: submit takes it from the form', () => {
  const { p } = mounted ()

  typeInto (p, 'The Hobbit')
  submit (p)
  typeInto (p, 'Solaris')
  submit (p)

  assert.deepStrictEqual (
    Array.from (findAll (p, `.${listStyle.entry} span`), (n) => n.textContent),
    ['The Hobbit', 'Solaris'],
  )
})

test ('two folds — submit clears the draft and does not touch the set', () => {
  const { p } = mounted ()
  const field = () =>
    find (p, 'input[placeholder]') as unknown as { value: string }

  typeInto (p, 'The Hobbit')
  assert.deepStrictEqual (field ().value, 'The Hobbit')
  submit (p)
  assert.deepStrictEqual (field ().value, '')
  assert.ok ((shown (p)).includes ('<span>The Hobbit</span>'))
})

test ('list — typing, and adding with the button', () => {
  const { p } = mounted ()
  assert.ok ((shown (p)).includes ('left: 0'))
  typeInto (p, 'Solaris')
  submit (p)
  assert.ok ((shown (p)).includes ('<span>Solaris</span>'))
  assert.ok ((shown (p)).includes ('left: 1'))
  assert.deepStrictEqual (
    (find (p, 'input[placeholder]') as unknown as { value: string }).value,
    '',
  )
})

test ('list — an empty submit adds nothing', () => {
  const { p } = mounted ()
  submit (p)
  typeInto (p, '   ')
  submit (p)
  assert.deepStrictEqual (findAll (p, `.${listStyle.entry}`).length, 0)
})

test ('list — the checkbox updates the reused row', () => {
  const { p } = mounted ([{ id: 1, title: 'a', read: false }])
  const checkbox = find (p, 'input[type="checkbox"]')
  const node = checkbox as unknown as { checked: boolean }
  assert.deepStrictEqual (node.checked, false)

  dispatchOn (checkbox, 'change')
  assert.deepStrictEqual (node.checked, true, 'the checkbox should show the new state')
  assert.ok ((shown (p)).includes ('left: 0'))

  dispatchOn (checkbox, 'change')
  assert.deepStrictEqual (node.checked, false)
  assert.ok ((shown (p)).includes ('left: 1'))
})

test ('list — rows are reused, not rebuilt', () => {
  const { p } = mounted ([{ id: 1, title: 'a', read: false }])
  const before = find (p, 'li')
  typeInto (p, 'b')
  submit (p)
  assert.deepStrictEqual (findAll (p, 'li').length, 2)
  assert.deepStrictEqual (find (p, 'li') === before, true, 'the first row is the same')
})

test ('list — removing takes the row away', () => {
  const { p } = mounted ([
    { id: 1, title: 'a', read: false },
    { id: 2, title: 'b', read: false },
  ])
  dispatchOn (findAll (p, `.${listStyle.entry} button`)[0], 'click')
  assert.deepStrictEqual (shown (p).includes ('<span>a</span>'), false)
  assert.ok ((shown (p)).includes ('<span>b</span>'))
})

test ('list — the button is always there, and dims with the state', () => {
  const { p } = mounted ([{ id: 1, title: 'a', read: false }])
  assert.ok ((shown (p)).includes ('clear finished'))
  assert.ok ((shown (p)).includes ('disabled'))

  dispatchOn (find (p, 'input[type="checkbox"]'), 'change')
  assert.deepStrictEqual (shown (p).includes ('disabled'), false)

  click (p, `button.${listStyle.clear}`)
  assert.deepStrictEqual (shown (p).includes ('<span>a</span>'), false)
  assert.ok ((shown (p)).includes ('disabled'))
})

test ('list — the island adopts the server markup', () => {
  const source = box ()
  const dsp = D.mount (source) (reading ({ seed: [] }))
  const markup = source.innerHTML
  S.dispose (dsp)

  const p = box ()
  p.innerHTML = markup
  const root = (p.firstChild as unknown as { nextSibling: Node }).nextSibling
  ;(root as unknown as { kept?: boolean }).kept = true

  hydrateIslands (p as unknown as Node)
  assert.deepStrictEqual (
    (root as unknown as { kept?: boolean }).kept,
    true,
    'the island should adopt, not rebuild',
  )
  assert.deepStrictEqual (p.innerHTML, markup)
  resetIslands ()
})

test ('list — the loop is untied together with the view', () => {
  let live = 0
  let node: unknown = mk ('div')
  while (node !== null && !Object.hasOwn (node as object, 'addEventListener')) {
    node = Object.getPrototypeOf (node)
  }
  const target = node as {
    addEventListener: (...a: unknown[]) => unknown
    removeEventListener: (...a: unknown[]) => unknown
  }
  const added = target.addEventListener
  const removed = target.removeEventListener
  target.addEventListener = function(this: unknown, ...a: unknown[]) {
    live += 1
    return added.apply (this, a)
  }
  target.removeEventListener = function(this: unknown, ...a: unknown[]) {
    live -= 1
    return removed.apply (this, a)
  }

  try {
    const p = box ()
    const built = reading ({
      seed: [{ id: 1, title: 'a', read: false }, {
        id: 2,
        title: 'b',
        read: false,
      }],
    })
    const dsp = D.mount (p) (built)
    assert.deepStrictEqual (live > 0, true, 'a mounted island is listening')

    typeInto (p, 'The Hobbit')
    submit (p)
    const working = live
    assert.deepStrictEqual (working > 0, true)

    S.dispose (dsp)
    assert.deepStrictEqual (live, 0, `after unmount ${live} listeners remained`)
  } finally {
    target.addEventListener = added
    target.removeEventListener = removed
  }
})

test ('start — what the state survives a page load by', () => {
  const server = box ()
  D.mount (server) (mark ({ pages: 320, at: 180 }))
  assert.ok ((shown (server)).includes ('180 of 320'))
  assert.ok ((server.innerHTML).includes ('{"pages":320,"at":180}'))

  const page = box ()
  page.innerHTML = server.innerHTML
  hydrateIslands (page as unknown as Node)
  assert.ok ((shown (page)).includes ('180 of 320'))

  dispatchOn (findAll (page, 'button')[1], 'click')
  assert.ok ((shown (page)).includes ('190 of 320'))
  resetIslands ()
})
