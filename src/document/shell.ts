import * as P from '@algosail/ply'
import type { Head } from '../app/types.ts'
import { ROOT_ID } from '../app/types.ts'
import { asAttribute, escapeAttribute, escapeText } from './html.ts'

/** The pieces a shell assembles into a document. */
export type Parts = {
  readonly head: Head
  readonly body: string
  /** Ready-made `<style>` tags, from `css.collectStyles`. */
  readonly styles: string
  readonly lang: string
  /** The document's writing direction, where it is not the default. */
  readonly dir?: 'ltr' | 'rtl' | 'auto'
  /** Module scripts for the page, in order. */
  readonly scripts: readonly string[]
}

const listed = <A>(xs: readonly A[] | undefined): readonly A[] =>
  P.defaultTo<readonly A[]> ([]) (xs)

const asVoidTag = (name: string) => (tag: Readonly<P.StrMap<string>>): string =>
  `<${name}${P.foldMap (P.Concat) (asAttribute) (P.pairs (tag))}>`

const asTags = (
  name: string,
): (tags: readonly Readonly<P.StrMap<string>>[]) => string =>
  P.foldMap (P.Concat) (asVoidTag (name))

const asTitle = (said: string): string => `<title>${escapeText (said)}</title>`

const headToHtml = (head: Head): string =>
  P.mconcat (P.Concat) ([
    P.maybe_ (P.K ('')) (asTitle) (head.title),
    asTags ('link') (listed (head.link)),
    asTags ('meta') (listed (head.meta)),
  ])

const asScript = (src: string): string =>
  `<script type="module" src="${escapeAttribute (src)}"></script>`

/**
 * Module scripts as tags, in order.
 * @example
 * ```ts
 * scriptTags (['/_kit/counter.js'])
 * // => '<script type="module" src="/_kit/counter.js"></script>'
 * ```
 */
export const scriptTags: (srcs: readonly string[]) => string = P.foldMap (
  P.Concat,
) (asScript)

const asDir = (dir: string): string => ` dir="${dir}"`

const dirOf = (parts: Parts): string =>
  P.maybe_ (P.K ('')) (asDir) (P.fromNullable (parts.dir))

/**
 * Wraps a render in a document.
 * @example
 * ```ts
 * // document :: Parts -> String
 * document ({ head, body: '<h1>hi</h1>', lang: 'en', scripts: [] })
 * // => '<!doctype html><html lang="en">…'
 * ```
 */
export function document(parts: Parts): string {
  return P.mconcat (P.Concat) ([
    '<!doctype html>',
    `<html lang="${escapeAttribute (parts.lang)}"${dirOf (parts)}>`,
    '<head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    headToHtml (parts.head),
    parts.styles,
    '</head><body>',
    `<div id="${ROOT_ID}">${parts.body}</div>`,
    scriptTags (parts.scripts),
    '</body></html>',
  ])
}
