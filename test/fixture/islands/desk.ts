import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as S from '@algosail/plystream'
import type { Json } from '../../../src/mod.ts'
import { jsonField, jsonText } from '../../../src/app/request.ts'
import { css, heard, island } from '../../../src/mod.ts'

/** Its own styles, so they are bundled with it and with nothing else. */
export const style = css`
  .word {
    min-height: 1.6rem;
    color: #7a4b1e;
  }
  .quiet {
    min-height: 1.6rem;
    color: #a9a093;
  }
`

/** What the server says when a book changes hands. */
export type Said = {
  readonly tag: string
  readonly title: string
}

const notJson = (): P.Maybe<Json> => P.nothing<Json> ()

const asJson = (body: Json): P.Maybe<Json> => P.just (body)

const parsed = (raw: string): P.Maybe<Json> =>
  P.either (notJson) (asJson) (
    P.encase ((text: string) => JSON.parse (text) as Json) (raw),
  )

const field = (name: string) => (body: Json): P.Maybe<string> =>
  P.chain (jsonText) (jsonField (name) (body))

const pair = (tag: string) => (title: string): Said => ({ tag, title })

const said = (raw: string): P.Maybe<Said> =>
  P.chain ((body: Json) =>
    P.chain ((tag: string) => P.map (pair (tag)) (field ('title') (body))) (
      field ('tag') (body),
    ),
  ) (parsed (raw))

const borrowed = (s: Said): boolean => P.equals<string> ('took') (s.tag)

const aloud = (s: Said): string =>
  borrowed (s)
    ? `just borrowed: ${s.title}`
    : `returned: ${s.title}`

const spoken = (props: Props) => (last: P.Maybe<Said>): string =>
  P.maybe_ (() => props.quiet) (aloud) (last)

const tone = (last: P.Maybe<Said>): string =>
  P.isNothing (last)
    ? style.quiet
    : style.word

/** What the server drew in this line before any browser saw it. */
export type Props = { readonly quiet: string }

export const desk = island ('desk', (props: Props) => {
  const loans = P.filterMap (said) (heard ('loan'))

  const last = S.holdWith<P.Maybe<Said>> (P.nothing<Said> ()) (
    P.map ((s: Said) => P.just<Said> (s)) (loans),
  )

  return H.p ({ class: P.map (tone) (last) }, [
    P.map (spoken (props)) (last),
  ])
}, import.meta.url)
