import type * as D from '@algosail/plydom'
import * as H from '@algosail/plydom/h'
import { csrfProps } from '../../../src/mod.ts'
import { theme } from './theme.ts'

/** The button the reader presses, and where that press is posted. */
export type Button = {
  readonly action: string
  readonly name: string
  readonly value: string
  /** The word on the button. */
  readonly label: string
  /** Attributes for the form, when the post should land in a region. */
  readonly props?: D.Props
}

const labeled = (one: Button): D.View =>
  H.button ({
    class: theme.button,
    type: 'submit',
    name: one.name,
    value: one.value,
  }, [one.label])

/**
 * The button on the page, posted as a form with the token from the request.
 * @example
 * ```ts
 * // button :: Button -> Request -> View
 * button ({ action: '/book/hobbit', name: 'lend', value: 'yes', label: 'return' }) (
 *   request,
 * )
 * ```
 */
export const button = (one: Button) => (request: Request): D.View =>
  H.form ({ ...one.props, method: 'post', action: one.action }, [
    H.input (csrfProps (request)),
    labeled (one),
  ])
