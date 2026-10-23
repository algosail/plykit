import * as P from '@algosail/ply'

import type { Json, Route } from '../../../src/mod.ts'
import type { Note } from '../records/notes.ts'
import { jsonField, jsonText } from '../../../src/app/request.ts'
import { endpoint, json, readJson, withStatus } from '../../../src/mod.ts'
import { leaveNote } from '../actions.ts'
import { saving } from '../answers.ts'
import * as Books from '../records/books.ts'
import * as Notes from '../records/notes.ts'

/** The whole shelf, and nothing about who is asking. */
export const catalogue: Route = endpoint ({
  pattern: '/api/books',
  static: true,
  on: { GET: () => P.map (json) (Books.all ()) },
})

const field = (name: string) => (body: Json): P.Maybe<string> =>
  P.chain (jsonText) (jsonField (name) (body))

export const notes: Route = endpoint ({
  pattern: '/api/books/:slug/notes',
  on: {
    GET: (ctx) => P.map (json) (Notes.under (ctx.params.slug)),
    POST: (ctx) => P.chain ((body: Json) => {
      const text = field ('text') (body)
      const author = P.fromMaybe ('guest') (field ('by') (body))
      return saving ((n: Note) => withStatus (201) (json (n)))
        (P.chain (leaveNote (ctx) (ctx.params.slug) (author)) (text))
    }) (readJson (ctx.request)),
  },
})
