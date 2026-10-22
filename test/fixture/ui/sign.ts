import type * as D from '@algosail/plydom'
import * as H from '@algosail/plydom/h'
import { csrfProps } from '../../../src/mod.ts'
import { theme } from './theme.ts'

const WHERE = '/reader'

/** The name field and the button that says sign in. */
export const signIn = (from: string) => (request: Request): D.View =>
  H.form ({ class: theme.sign, method: 'post', action: WHERE }, [
    H.input (csrfProps (request)),
    H.input ({ type: 'hidden', name: 'back', value: from }),
    H.input ({ name: 'name', placeholder: 'your name', size: '12' }),
    H.button ({ class: theme.button, type: 'submit' }, ['sign in']),
  ])

/** The button that says sign out, and the hidden field that brings them back. */
export const signOut = (from: string) => (request: Request): D.View =>
  H.form ({ class: theme.sign, method: 'post', action: WHERE }, [
    H.input (csrfProps (request)),
    H.input ({ type: 'hidden', name: 'back', value: from }),
    H.button ({
      class: theme.button,
      type: 'submit',
      name: 'exit',
      value: 'yes',
    }, ['sign out']),
  ])
