import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'

/** One book. */
export type Book = {
  readonly slug: string
  readonly title: string
  readonly author: string
  readonly year: number
  readonly shelf: string
  readonly blurb: string
}

const held: readonly Book[] = [
  {
    slug: 'hobbit',
    title: 'The Hobbit',
    author: 'J. R. R. Tolkien',
    year: 1937,
    shelf: 'proza',
    blurb: 'About leaving home traveling light and coming back someone else.',
  },
  {
    slug: 'solaris',
    title: 'Solaris',
    author: 'Stanisław Lem',
    year: 1961,
    shelf: 'fantastika',
    blurb: 'About an ocean that answers, and about how that is not a conversation.',
  },
  {
    slug: 'piknik',
    title: 'Roadside Picnic',
    author: 'Arkady and Boris Strugatsky',
    year: 1972,
    shelf: 'fantastika',
    blurb: 'About the Zone and the price of what is found in it.',
  },
  {
    slug: 'sonnets',
    title: 'Sonnets',
    author: 'William Shakespeare',
    year: 1609,
    shelf: 'poezia',
    blurb: 'One hundred and fifty-four times about the same thing, and each time differently.',
  },
]

/** A shelf, which is every book that names it, and nothing more. */
export type Shelf = {
  readonly slug: string
  readonly name: string
  readonly count: number
}

const NAMES: Readonly<P.StrMap<string>> = {
  proza: 'Prose',
  fantastika: 'Science fiction',
  poezia: 'Poetry',
}

/** Every book, in the order they were put out. */
export const all = (): F.Future<unknown, readonly Book[]> => F.resolve (held)

const slugIs = (slug: string) => (b: Book): boolean => P.equals (slug) (b.slug)

const shelfIs = (shelf: string) => (b: Book): boolean =>
  P.equals (shelf) (b.shelf)

/**
 * One book by its slug.
 * @example
 * ```ts
 * // bySlug :: String -> Task (Maybe Book)
 * await F.promise (bySlug ('hobbit'))
 * // => just({ slug: 'hobbit', … })
 * ```
 */
export const bySlug = (slug: string): F.Future<unknown, P.Maybe<Book>> =>
  F.resolve (P.find (slugIs (slug)) (held))

/** The books on one shelf. */
export const onShelf = (
  shelf: string,
): F.Future<unknown, readonly Book[]> =>
  F.resolve (P.filter (shelfIs (shelf)) (held))

/**
 * The title a slug is known by, or the slug when no book has it.
 * @example
 * ```ts
 * // titleOf :: Array Book -> String -> String
 * titleOf ([{ slug: 'hobbit', title: 'The Hobbit', author: 'J. R. R. Tolkien', year: 1937, shelf: 'proza', blurb: '' }]) ('hobbit')
 * // => 'The Hobbit'
 * ```
 */
export const titleOf = (books: readonly Book[]) => (slug: string): string =>
  P.fromMaybe (slug) (
    P.map ((b: Book) => b.title) (P.find (slugIs (slug)) (books)),
  )

const nameOf = (slug: string): string =>
  P.fromMaybe (slug) (P.lookup (slug) (NAMES))

const countOn = (books: readonly Book[]) => (slug: string): number =>
  P.size (P.filter (shelfIs (slug)) (books))

const shelfOf = (books: readonly Book[]) => (slug: string): Shelf => ({
  slug,
  name: nameOf (slug),
  count: countOn (books) (slug),
})

/**
 * Every shelf there is, which is every shelf a book names.
 * @example
 * ```ts
 * // shelves :: () -> Task (Array Shelf)
 * P.size (await F.promise (shelves ()))
 * // => 3
 * ```
 */
const shelvesOf = (books: readonly Book[]): readonly Shelf[] =>
  P.map (shelfOf (books)) (P.nub (P.map ((b: Book) => b.shelf) (books)))

export const shelves = (): F.Future<unknown, readonly Shelf[]> =>
  P.map (shelvesOf) (all ())

const sameSlug = (slug: string) => (s: Shelf): boolean =>
  P.equals (slug) (s.slug)

/** One shelf by its slug, or nothing where no book names it. */
export const shelf = (slug: string): F.Future<unknown, P.Maybe<Shelf>> =>
  P.map (P.find (sameSlug (slug))) (shelves ())
