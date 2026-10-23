import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import type { Handler, Reply, Route } from '../../../src/mod.ts'
import type { Reader } from '../records/readers.ts'
import type { App } from '../state.ts'
import { endpoint, localPath, readFields, redirect } from '../../../src/mod.ts'
import * as Readers from '../records/readers.ts'
import * as Session from '../session.ts'

/** Where to go back to. */
const backTo = (fields: Readonly<P.StrMap<string>>): Reply =>
  redirect (P.fromMaybe ('/') (P.chain (localPath) (P.lookup ('back') (fields))))

const blank = (text: string): boolean => P.equals<string> ('') (text)

const typed = (raw: string): P.Maybe<string> =>
  P.fromPredicate (P.complement (blank)) (P.trim (raw))

const givenName = (fields: Readonly<P.StrMap<string>>): P.Maybe<string> =>
  P.chain (typed) (P.lookup ('name') (fields))

const signingIn = (
  fields: Readonly<P.StrMap<string>>,
): F.Future<unknown, Reply> =>
  P.maybe_
    (() => F.resolve (backTo (fields)))
    ((name: string) =>
      P.chain ((r: Reader) => Session.remember (r) (backTo (fields))) (
        Readers.arrive (name),
      ),
    )
    (givenName (fields))

const signingOut =
  (reader: P.Maybe<Reader>) =>
  (fields: Readonly<P.StrMap<string>>): F.Future<unknown, Reply> =>
    P.maybe_
      (() => F.resolve (Session.forget (backTo (fields))))
      ((r: Reader) =>
        P.map (() => Session.forget (backTo (fields))) (Readers.leave (r.id)),
      )
      (reader)

const posted: Handler<App> = (ctx) =>
  P.chain ((fields: Readonly<P.StrMap<string>>) =>
    P.maybe_
      (() => signingIn (fields))
      ((_exit: string) => signingOut (ctx.state.reader) (fields))
      (P.lookup ('exit') (fields)),
  ) (readFields (ctx.request))

const sendHome: Handler<App> = () => F.resolve (redirect ('/'))

export const reader: Route<App> = endpoint ({
  pattern: '/reader',
  on: { GET: sendHome, POST: posted },
})
