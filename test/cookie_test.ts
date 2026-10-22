import * as P from '@algosail/ply'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  at,
  cookie,
  during,
  expire,
  failed,
  handler,
  parseCookies,
  readable,
  readCookies,
  redirect,
  serializeCookie,
  text,
  toResponse,
  withCookie,
  withHeader,
} from '../src/mod.ts'
import { discover } from '../src/nodejs.ts'
import { error, routes, state, through } from './fixture/app.ts'

await discover ({
  include: ['navigation', 'live'],
})

const asking = (path: string, init?: RequestInit) =>
  new Request (`http://kit.test${path}`, init)

test ('kit/cookie — the defaults are the ones a session wants', () => {
  assert.deepStrictEqual (cookie ('visitor') ('7'), {
    name: 'visitor',
    value: '7',
    path: '/',
    maxAge: P.nothing (),
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })

  const week = during (60) (
    at ('/admin') (readable (
      cookie ('theme') ('dark'),
    )),
  )
  assert.deepStrictEqual ([week.maxAge, week.path, week.httpOnly], [
    P.just (60),
    '/admin',
    false,
  ])

  assert.deepStrictEqual ([expire ('visitor').value, expire ('visitor').maxAge], [
    '',
    P.just (0),
  ])
})

test ('kit/cookie — a value is escaped, and reads back', () => {
  const written = serializeCookie (during (60) (cookie ('visitor') ('anya and I')))
  assert.deepStrictEqual (
    written,
    'visitor=anya%20and%20I; Path=/; Max-Age=60; ' +
      'HttpOnly; Secure; SameSite=Lax',
  )
  assert.deepStrictEqual (parseCookies (written.split (';')[0]), { visitor: 'anya and I' })
})

test ('kit/cookie/read — several, junk, and repeats', () => {
  assert.deepStrictEqual (parseCookies ('a=1; b=2'), { a: '1', b: '2' })
  assert.deepStrictEqual (parseCookies ('a=1; broken; a=2'), { a: '1' })
  assert.deepStrictEqual (parseCookies (''), {})
  assert.deepStrictEqual (parseCookies ('a=%ZZ'), { a: '%ZZ' })
})

test ('kit/request/cookies — from the request, and without one', () => {
  assert.deepStrictEqual (
    readCookies (asking ('/', { headers: { cookie: 'visitor=7; theme=dark' } })),
    { visitor: '7', theme: 'dark' },
  )
  assert.deepStrictEqual (readCookies (asking ('/')), {})
})

test ('kit/reply/cookie — sits on any reply and does not crowd out headers', async () => {
  const one = cookie ('a') ('1')
  const two = cookie ('b') ('2')

  assert.deepStrictEqual (withCookie (one) (text ('go')).cookies, [one])
  assert.deepStrictEqual (withCookie (one) (redirect ('/')).cookies, [one])
  assert.deepStrictEqual (withCookie (one) (failed (401) ('who are you')).cookies, [one])

  const res = toResponse (
    withCookie (two) (withCookie (one) (withHeader ('x-kit') ('yes') (text ('go')))),
  )
  assert.deepStrictEqual (res.headers.getSetCookie ().length, 2)
  assert.ok ((res.headers.getSetCookie ()[0]).includes ('a=1;'))
  assert.ok ((res.headers.getSetCookie ()[1]).includes ('b=2;'))
  assert.deepStrictEqual (res.headers.get ('x-kit'), 'yes')
  await res.body?.cancel ()
})

const app = handler ({ routes, error, state, through })

/**
 * The cookie value from a reply, ready to be sent back.
 */
const carried = (res: Response): string =>
  res.headers.getSetCookie ().map ((c) => c.split (';')[0]).join ('; ')

/**
 * The way a browser does it: first the page — it brings the csrf cookie and the same token drawn in the form — and only then the form is sent.
 */
const opening = async (path = '/'): Promise<[string, string]> => {
  const res = await app (asking (path))
  const cookie = carried (res)
  const html = await res.text ()
  const field = /<input[^>]*name="_csrf"[^>]*>/.exec (html)?.[0] ?? ''
  return [cookie, /value="([^"]*)"/.exec (field)?.[1] ?? '']
}

/**
 * Cookies from every reply together: a browser sends them as one line.
 */
const both = (...cookies: readonly string[]): string =>
  cookies.filter ((c) => c !== '').join ('; ')

const signingIn = async (name: string) => {
  const [cookie, csrf] = await opening ()
  return app (asking ('/reader', {
    method: 'POST',
    headers: { cookie },
    body: new URLSearchParams ({ _csrf: csrf, name, back: '/about' }),
  }))
}

test ('example/session — signed in, and the pages know who came', async () => {
  const login = await signingIn ('anya')
  assert.deepStrictEqual ([login.status, login.headers.get ('location')], [303, '/about'])
  const cookie = carried (login)
  assert.ok ((cookie).includes ('reader='))
  await login.body?.cancel ()

  const guest = await (await app (asking ('/'))).text ()
  assert.ok ((guest).includes ('your name'))
  assert.deepStrictEqual (guest.includes ('/me'), false)
  assert.deepStrictEqual (guest.includes ('Lending desk'), false)

  const known = await (await app (asking ('/', { headers: { cookie } }))).text ()
  assert.ok ((known).includes ('Welcome back, anya'))
  assert.ok ((known).includes ('href="/me"'))
  assert.ok ((known).includes ('Lending desk'))
  assert.ok ((known).includes ('sign out'))
  assert.deepStrictEqual (known.includes ('your name'), false)
})

test ('example/session — a reader gets a shelf of their own', async () => {
  const cookie = carried (await signingIn ('borya'))

  const shut = await app (asking ('/me'))
  assert.deepStrictEqual (shut.status, 403)
  assert.ok ((await shut.text ()).includes ('only readers are let in'))

  const mine = await (await app (asking ('/me', { headers: { cookie } }))).text ()
  assert.ok ((mine).includes ('<h1>borya</h1>'))
  assert.ok ((mine).includes ('On loan'))
  assert.ok ((mine).includes ('nothing yet'))
})

test ('example/session — middleware extends it on every reply', async () => {
  const [csrfCookie] = await opening ()
  const cookie = both (csrfCookie, carried (await signingIn ('borya')))

  const page = await app (asking ('/about', { headers: { cookie } }))
  assert.deepStrictEqual (page.headers.getSetCookie ().length, 1)
  assert.ok ((page.headers.getSetCookie ()[0]).includes ('Max-Age=604800'))
  await page.body?.cancel ()

  const guest = await app (asking ('/about', { headers: { cookie: csrfCookie } }))
  assert.deepStrictEqual (guest.headers.getSetCookie (), [])
  await guest.body?.cancel ()
})

test ('example/session — signed out: forgotten on both sides', async () => {
  const [csrfCookie, csrf] = await opening ()
  const cookie = both (csrfCookie, carried (await signingIn ('vitya')))

  const out = await app (asking ('/reader', {
    method: 'POST',
    headers: { cookie },
    body: new URLSearchParams ({ _csrf: csrf, exit: 'yes', back: '/' }),
  }))
  assert.deepStrictEqual (out.status, 303)
  assert.deepStrictEqual (out.headers.getSetCookie ().length, 1)
  assert.ok ((out.headers.getSetCookie ()[0]).includes ('reader=; Path=/; Max-Age=0'))
  await out.body?.cancel ()

  const after = await (await app (asking ('/', { headers: { cookie } }))).text ()
  assert.ok ((after).includes ('your name'))
})

test ('example/session — someone else\'s cookie is not a session', async () => {
  const forged = await app (asking ('/', {
    headers: { cookie: 'reader=00000000-0000-4000-8000-000000000000' },
  }))
  const html = await forged.text ()
  assert.ok ((html).includes ('your name'))
})

test ('example/session — back only goes to this site', async () => {
  const [cookie, csrf] = await opening ()
  const away = await app (asking ('/reader', {
    method: 'POST',
    headers: { cookie },
    body: new URLSearchParams ({
      _csrf: csrf,
      name: 'anya',
      back: 'https://evil/',
    }),
  }))
  assert.deepStrictEqual (away.headers.get ('location'), '/')
  await away.body?.cancel ()
})

test ('example/session — an expired token does not leave you stuck', async () => {
  const [cookie, csrf] = await opening ()

  const refused = await app (asking ('/reader', {
    method: 'POST',
    headers: { cookie },
    body: new URLSearchParams ({ _csrf: `${csrf}x`, name: 'anya', back: '/' }),
  }))
  assert.deepStrictEqual (refused.status, 403)
  await refused.body?.cancel ()

  const stray = await app (asking ('/reader'))
  assert.deepStrictEqual ([stray.status, stray.headers.get ('location')], [303, '/'])
  await stray.body?.cancel ()
})

test ('example/cache — a reply with a token says it depends on the cookie', async () => {
  const page = await app (asking ('/'))
  assert.ok ((page.headers.get ('vary') ?? '').includes ('cookie'))
  await page.body?.cancel ()
})
