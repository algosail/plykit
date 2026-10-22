import * as D from '@algosail/plydom'
import { Window } from 'happy-dom'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const win = new Window ({ url: 'http://kit.test/book/solaris' })
const doc = win.document

Object.assign (globalThis, {
  document: doc,
  location: win.location,
  history: win.history,
  DOMParser: win.DOMParser,
  addEventListener: win.addEventListener.bind (win),
  removeEventListener: win.removeEventListener.bind (win),
  FormData: win.FormData,
  scrollTo: () => {},
  scrollY: 0,
})

type Hit = {
  readonly url: string
  readonly method: string
  readonly cache: string
}

const hits: Hit[] = []

const hrefOf = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

const page = (main: string): string =>
  `<!doctype html><html><head><title>page</title></head><body><div id="kit-root">${main}</div></body></html>`

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = hrefOf (input)
  const method = (init?.method ?? 'GET').toUpperCase ()
  hits.push ({ url, method, cache: String (init?.cache ?? '') })
  const part = new Headers (init?.headers).get ('kit-part')
  const html = part === null
    ? page (`<p>${url}</p>`)
    : `<!doctype html><html><body><section data-kit-part="${part}"><p>fresh</p></section></body></html>`
  return new Response (html, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })
}) as typeof fetch

const { navigation } = await import ('../src/navigate.ts')

const wait = (ms: number): Promise<void> =>
  new Promise ((resolve) => {
    setTimeout (resolve, ms)
  })

const until = async (ready: () => boolean): Promise<void> => {
  const started = Date.now ()
  while (!ready ()) {
    if (Date.now () - started > 2000) {
      throw new Error (`timed out, saw ${JSON.stringify (hits)}`)
    }
    await wait (10)
  }
}

const gets = (path: string): readonly Hit[] =>
  hits.filter ((hit) => hit.method === 'GET' && hit.url.endsWith (path))

test ('navigation — a post drops the page guessed before the write', async () => {
  doc.body.innerHTML = [
    '<div id="kit-root">',
    '<a id="me" href="/me">me</a>',
    '<form id="note" method="post" action="/book/solaris" data-kit-into="notes-solaris">',
    '<input name="text" value="again" />',
    '</form>',
    '<section data-kit-part="notes-solaris"><p>old</p></section>',
    '</div>',
  ].join ('')

  D.mount (doc.body as unknown as Node) (navigation ({}))

  const me = doc.getElementById ('me')
  if (me === null) throw new Error ('missing /me')
  me.dispatchEvent (
    new win.MouseEvent ('mouseover', { bubbles: true, cancelable: true }),
  )
  await until (() => gets ('/me').length >= 1)
  assert.deepStrictEqual (gets ('/me')[0]?.cache, 'no-store')

  const form = doc.getElementById ('note')
  if (form === null) throw new Error ('missing form')
  form.dispatchEvent (
    new win.Event ('submit', { bubbles: true, cancelable: true }),
  )
  await until (() => hits.some ((hit) => hit.method === 'POST'))

  me.dispatchEvent (
    new win.MouseEvent ('click', { bubbles: true, cancelable: true, button: 0 }),
  )
  await until (() => gets ('/me').length >= 2)
  await wait (50)
})
