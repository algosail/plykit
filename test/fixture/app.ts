import * as P from '@algosail/ply'
import type { Config, DocumentHead, Item, Routes } from '../../src/mod.ts'
import type { Note } from './records/notes.ts'
import type { State } from './state.ts'
import { feed, robots, sitemap } from '../../src/mod.ts'
import { error } from './layouts/error.ts'
import { shell } from './layouts/room.ts'
import { onShelf } from './layouts/shelf.ts'
import { through } from './middleware.ts'
import * as Notes from './records/notes.ts'
import { about } from './routes/about.ts'
import { catalogue, notes } from './routes/api.ts'
import { book } from './routes/book.ts'
import { desk } from './routes/desk.ts'
import { home } from './routes/home.ts'
import { me } from './routes/me.ts'
import { reader } from './routes/reader.ts'
import { shelf } from './routes/shelf.ts'
import { state } from './state.ts'

const ORIGIN = 'https://chitalnya.example'

const asItems = (notes: readonly Note[]): readonly Item[] =>
  P.map ((n: Note): Item => ({
    title: `${n.by} on ${n.book}`,
    link: `${ORIGIN}/book/${n.book}`,
    id: String (n.id),
    summary: n.text,
    author: n.by,
  })) (notes)

/** What readers wrote, for whoever would rather be told than come back. */
const notesFeed = feed<State> ({
  origin: ORIGIN,
  title: 'Reading Room · in the margins',
  pattern: '/feed.xml',
  items: () => P.map (asItems) (Notes.latest (20)),
})

/** Every route in the room. */
export const routes: Routes<State> = [
  shell ([home, about, me, desk, book, onShelf ([shelf])]),
  catalogue,
  notes,
  reader,
  notesFeed,
  sitemap<State> ({ origin: ORIGIN, routes: [home, about] }),
  robots<State> ({ sitemap: `${ORIGIN}/sitemap.xml` }),
]

/** Links every page carries. A page's own tags follow these. */
export const head: DocumentHead = {
  link: [
    { rel: 'icon', href: '/static/lamp.svg' },
    { rel: 'alternate', type: 'application/rss+xml', href: '/feed.xml' },
  ],
}

export { error } from './layouts/error.ts'
export { state } from './state.ts'
export type { State } from './state.ts'
export { through } from './middleware.ts'

/** The room itself. */
const application: Config<State> = {
  routes,
  error,
  head,
  state,
  through,
  include: ['navigation', 'live'],
  assets: { dir: new URL ('./static/', import.meta.url) },
}

export default application
