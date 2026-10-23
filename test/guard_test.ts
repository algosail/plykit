import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Reply, Route } from '../src/mod.ts'
import {
  answer,
  cookie,
  CSRF_COOKIE,
  CSRF_FIELD,
  CSRF_HEADER,
  csrfProps,
  csrfToken,
  data,
  during,
  endpoint,
  guard,
  handler,
  insecure,
  json,
  openSigned,
  page,
  readFields,
  seal,
  signedCookie,
  signing,
  statusOf,
} from '../src/mod.ts'

const at = (path: string) => `http://kit.test${path}`

test ('kit/sign — its own opens, someone else\'s and a damaged one do not', async () => {
  const keys = await F.promise (signing ('secret'))
  const signed = await F.promise (keys.sign ('7'))

  assert.deepStrictEqual (signed.startsWith ('7.'), true)
  assert.deepStrictEqual (await F.promise (keys.open (signed)), P.just ('7'))
  assert.deepStrictEqual (await F.promise (keys.open ('8' + signed.slice (1))), P.nothing ())
  assert.deepStrictEqual (await F.promise (keys.open ('7')), P.nothing ())
  assert.deepStrictEqual (await F.promise (keys.open ('7.not-base64!')), P.nothing ())
  const other = await F.promise (signing ('other'))
  assert.deepStrictEqual (await F.promise (other.open (signed)), P.nothing ())
})

test ('kit/sign — a value with dots stays itself', async () => {
  const keys = await F.promise (signing ('secret'))
  const signed = await F.promise (keys.sign ('a.b.c'))
  assert.deepStrictEqual (await F.promise (keys.open (signed)), P.just ('a.b.c'))
})

test ('kit/sign — a cookie is signed, and the rest of it is left alone', async () => {
  const keys = await F.promise (signing ('secret'))
  const sealed = await F.promise (seal (keys) (during (60) (cookie ('visitor') ('7'))))

  assert.deepStrictEqual (sealed.name, 'visitor')
  assert.deepStrictEqual (sealed.maxAge, P.just (60))
  assert.deepStrictEqual (sealed.httpOnly, true)
  assert.deepStrictEqual (sealed.value.startsWith ('7.'), true)

  const asking = new Request (at ('/'), {
    headers: { cookie: `visitor=${encodeURIComponent (sealed.value)}` },
  })
  assert.deepStrictEqual (
    await F.promise (openSigned (keys) ('visitor') (asking)),
    P.just ('7'),
  )

  const forged = new Request (at ('/'), { headers: { cookie: 'visitor=9.AAAA' } })
  assert.deepStrictEqual (
    await F.promise (openSigned (keys) ('visitor') (forged)),
    P.nothing (),
  )
  const bare = new Request (at ('/'))
  assert.deepStrictEqual (await F.promise (openSigned (keys) ('visitor') (bare)), P.nothing ())
})

test ('kit/sign — signedCookie is the same thing in one step', async () => {
  const keys = await F.promise (signing ('secret'))
  const one = await F.promise (signedCookie (keys) ('visitor') ('7'))
  assert.deepStrictEqual (one.name, 'visitor')
  assert.deepStrictEqual (await F.promise (keys.open (one.value)), P.just ('7'))
})

const form: Route = page ({
  pattern: '/form',
  load: () => F.resolve (data ({})),
  head: () => ({ title: P.just ('Form'), meta: [] }),
  view: (ctx) =>
    H.form ({ method: 'post', action: '/said' }, [
      H.input (csrfProps (ctx.request)),
      H.input ({ name: 'text' }),
    ]),
})

const said: Route = endpoint ({
  pattern: '/said',
  on: {
    POST: (ctx) =>
      P.map ((fields: Readonly<P.StrMap<string>>) =>
        json ({ text: fields.text ?? '' }),
      ) (readFields (ctx.request)),
  },
})

const replying = answer ({ routes: [form, said], through: [guard ()] })
const asking = (path: string, init?: RequestInit) =>
  F.promise (replying (new Request (at (path), init)))

const tokenOf = (reply: Reply): string => {
  const one = reply.tag === 'sent' || reply.tag === 'redirect' ||
      reply.tag === 'failure'
    ? reply.cookies.find ((c) => c.name === CSRF_COOKIE)
    : undefined
  return one === undefined ? '' : one.value
}

test ('kit/guard — the first visit gets a token, and the form is drawn with it', async () => {
  const reply = await asking ('/form')
  const token = tokenOf (reply)

  assert.deepStrictEqual (token.length > 20, true)
  const body = reply.tag === 'sent' ? String (reply.body) : ''
  assert.ok ((body).includes (`name="${CSRF_FIELD}"`))
  assert.ok ((body).includes (`value="${token}"`))
})

test ('kit/guard — the view sees the token from the cookies and from one just minted', () => {
  const bare = new Request (at ('/form'))
  assert.deepStrictEqual (csrfToken (bare), P.nothing ())
  const carrying = new Request (at ('/form'), {
    headers: { cookie: `${CSRF_COOKIE}=abc` },
  })
  assert.deepStrictEqual (csrfToken (carrying), P.just ('abc'))
})

test ('kit/guard — a POST without the cookie does not get through', async () => {
  const reply = await asking ('/said', {
    method: 'POST',
    body: new URLSearchParams ({ text: 'hello' }),
  })
  assert.deepStrictEqual (statusOf (reply), 403)
  assert.deepStrictEqual (tokenOf (reply).length > 20, true)
})

test ('kit/guard — a POST with the form field gets through, and the body arrives', async () => {
  const token = tokenOf (await asking ('/form'))
  const reply = await asking ('/said', {
    method: 'POST',
    headers: { cookie: `${CSRF_COOKIE}=${token}` },
    body: new URLSearchParams ({ [CSRF_FIELD]: token, text: 'hello' }),
  })
  assert.deepStrictEqual (statusOf (reply), 200)
  assert.deepStrictEqual (reply.tag === 'sent' ? reply.body : '', '{"text":"hello"}')
})

test ('kit/guard — a POST with the header instead of the field gets through', async () => {
  const token = tokenOf (await asking ('/form'))
  const reply = await asking ('/said', {
    method: 'POST',
    headers: { cookie: `${CSRF_COOKIE}=${token}`, [CSRF_HEADER]: token },
    body: new URLSearchParams ({ text: 'hello' }),
  })
  assert.deepStrictEqual (statusOf (reply), 200)
})

test ('kit/guard — someone else\'s token and an empty field do not get through', async () => {
  const token = tokenOf (await asking ('/form'))
  const wrong = await asking ('/said', {
    method: 'POST',
    headers: { cookie: `${CSRF_COOKIE}=${token}` },
    body: new URLSearchParams ({ [CSRF_FIELD]: 'not that', text: 'x' }),
  })
  assert.deepStrictEqual (statusOf (wrong), 403)

  const none = await asking ('/said', {
    method: 'POST',
    headers: { cookie: `${CSRF_COOKIE}=${token}` },
    body: new URLSearchParams ({ text: 'x' }),
  })
  assert.deepStrictEqual (statusOf (none), 403)
})

test ('kit/guard — a request from another origin does not get through, even with the token', async () => {
  const token = tokenOf (await asking ('/form'))
  const reply = await asking ('/said', {
    method: 'POST',
    headers: {
      cookie: `${CSRF_COOKIE}=${token}`,
      origin: 'http://chuzhoy.test',
    },
    body: new URLSearchParams ({ [CSRF_FIELD]: token, text: 'x' }),
  })
  assert.deepStrictEqual (statusOf (reply), 403)
})

test ('kit/guard — its own origin gets through', async () => {
  const token = tokenOf (await asking ('/form'))
  const reply = await asking ('/said', {
    method: 'POST',
    headers: {
      cookie: `${CSRF_COOKIE}=${token}`,
      origin: 'http://kit.test',
    },
    body: new URLSearchParams ({ [CSRF_FIELD]: token, text: 'x' }),
  })
  assert.deepStrictEqual (statusOf (reply), 200)
})

test ('kit/guard — a planted token header cannot be forged', async () => {
  const reply = await asking ('/said', {
    method: 'POST',
    headers: {
      'kit-csrf-issued': 'mine',
      cookie: `${CSRF_COOKIE}=mine`,
    },
    body: new URLSearchParams ({ [CSRF_FIELD]: 'mine' }),
  })
  assert.deepStrictEqual (statusOf (reply), 200)

  const forged = await asking ('/said', {
    method: 'POST',
    headers: { 'kit-csrf-issued': 'invented' },
    body: new URLSearchParams ({ [CSRF_FIELD]: 'invented' }),
  })
  assert.deepStrictEqual (statusOf (forged), 403)
})

test ('kit/guard — a planted header does not reach the view', async () => {
  const token = tokenOf (await asking ('/form'))
  const reply = await asking ('/form', {
    headers: {
      cookie: `${CSRF_COOKIE}=${token}`,
      'kit-csrf-issued': 'podlozhennoe',
    },
  })
  const body = reply.tag === 'sent' ? String (reply.body) : ''

  assert.ok ((body).includes (`value="${token}"`))
  assert.deepStrictEqual (body.includes ('podlozhennoe'), false)
})

test ('kit/guard — the origin can be left unchecked', async () => {
  const lax = answer ({
    routes: [form, said],
    through: [guard ({ origin: false })],
  })
  const first = await F.promise (lax (new Request (at ('/form'))))
  const token = tokenOf (first)
  const reply = await F.promise (
    lax (
      new Request (at ('/said'), {
        method: 'POST',
        headers: {
          cookie: `${CSRF_COOKIE}=${token}`,
          origin: 'http://chuzhoy.test',
        },
        body: new URLSearchParams ({ [CSRF_FIELD]: token }),
      }),
    ),
  )
  assert.deepStrictEqual (statusOf (reply), 200)
})

test ('kit/guard — over http the cookie has no Secure, or there is nowhere to keep it', async () => {
  const over = (secure: boolean): Promise<Response> => {
    const app = handler ({
      routes: [page ({
        pattern: '/',
        load: () => F.resolve (data ({})),
        view: () => H.p (['—']),
      })],
      through: [guard ({ secure })],
    })
    return app (new Request ('http://kit.test/'))
  }

  const plain = await over (false)
  const said = plain.headers.getSetCookie ()[0]
  assert.deepStrictEqual (said.includes ('Secure'), false, said)
  assert.ok ((said).includes ('SameSite=Lax'))
  await plain.body?.cancel ()

  const strict = await over (true)
  assert.ok ((strict.headers.getSetCookie ()[0]).includes ('Secure'))
  await strict.body?.cancel ()
})

test ('kit/cookie — insecure takes the flag off and nothing else', () => {
  const one = during (60) (cookie ('visitor') ('7'))
  assert.deepStrictEqual ([one.secure, insecure (one).secure], [true, false])
  assert.deepStrictEqual ({ ...insecure (one), secure: true }, one)
})
