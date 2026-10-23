import * as P from '@algosail/ply'
import * as H from '@algosail/plydom/h'
import * as F from '@algosail/plyfuture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Reply, Route } from '../src/mod.ts'
import { mkdir, rm, writeBytes, writeText } from '../src/fs/disk.ts'
import { forever as cacheForever, files, fileTag, mediaType } from '../src/fs/static.ts'
import { answer, data, etag, page, statusOf } from '../src/mod.ts'
import { fileDir } from './temp.ts'

const at = (path: string) => `http://kit.test${path}`
const asking = (path: string, init?: RequestInit) => new Request (at (path), init)

const around = await fileDir ()
const dir = `${around}/served`
await mkdir (dir)
await writeText (`${dir}/hello.txt`, 'hello')
await writeText (`${dir}/style.css`, 'body { color: red }')
await mkdir (`${dir}/deep`)
await writeText (`${dir}/deep/inner.json`, '{"n":1}')
await writeText (`${around}/outside.txt`, 'do not serve')

const assets = files ({ dir: `${dir}/` })
const serving = (path: string, init?: RequestInit) =>
  F.promise (assets (asking (path, init)))

/**
 * The status of the reply, or 0 when they refused to answer — it is not their path.
 */
const statusIn = (m: P.Maybe<Reply>): number =>
  m.tag === 'just' ? statusOf (m.value) : 0

test ('kit/static — the type comes from the name, and an unknown one leaves as bytes', () => {
  assert.deepStrictEqual (mediaType ('logo.svg'), 'image/svg+xml')
  assert.deepStrictEqual (mediaType ('a.b.woff2'), 'font/woff2')
  assert.deepStrictEqual (mediaType ('READ.ME'), 'application/octet-stream')
  assert.deepStrictEqual (mediaType ('LICENSE'), 'application/octet-stream')
  assert.deepStrictEqual (mediaType ('PHOTO.JPG'), 'image/jpeg')
})

test ('kit/static — the tag is the size and the time it was written', () => {
  assert.deepStrictEqual (fileTag ({ size: 12, mtime: new Date (0) }), 'W/"c-0"')
  assert.deepStrictEqual (fileTag ({ size: 0, mtime: null }), 'W/"0-0"')
  assert.ok ((cacheForever ()).includes ('immutable'))
})

test ('kit/static — a file is sent with its type and its tag', async () => {
  const reply = await serving ('/static/hello.txt')
  assert.deepStrictEqual (reply.tag, 'just')
  const sent = reply.tag === 'just' ? reply.value : null
  assert.deepStrictEqual (sent?.tag === 'sent' ? sent.status : 0, 200)
  const headers = sent?.tag === 'sent' ? sent.headers : {}
  assert.deepStrictEqual (headers['content-type'], 'text/plain; charset=utf-8')
  assert.deepStrictEqual (headers['cache-control'], 'no-cache')
  assert.deepStrictEqual (typeof headers['etag'], 'string')
})

test ('kit/static — a nested path, and its own type', async () => {
  const reply = await serving ('/static/deep/inner.json')
  const sent = reply.tag === 'just' ? reply.value : null
  assert.deepStrictEqual (
    sent?.tag === 'sent' ? sent.headers['content-type'] : '',
    'application/json; charset=utf-8',
  )
})

test ('kit/static — a large file leaves as a stream, a small one as bytes', async () => {
  const bytes = new Uint8Array (200 * 1024).fill (7)
  bytes[0] = 1
  bytes[bytes.length - 1] = 9
  await writeBytes (`${dir}/big.bin`, bytes)

  const big = await serving ('/static/big.bin')
  const sent = big.tag === 'just' && big.value.tag === 'sent' ? big.value : null
  assert.deepStrictEqual (sent?.body instanceof ReadableStream, true)

  const got = new Uint8Array (
    await new Response (sent?.body as ReadableStream).arrayBuffer (),
  )
  assert.deepStrictEqual ([got.length, got[0], got[got.length - 1]], [bytes.length, 1, 9])

  const small = await serving ('/static/hello.txt')
  const little = small.tag === 'just' && small.value.tag === 'sent'
    ? small.value
    : null
  assert.deepStrictEqual (little?.body instanceof Uint8Array, true)

  await rm (`${dir}/big.bin`)
})

test ('kit/static — the same tag answers 304 and nothing else', async () => {
  const first = await serving ('/static/style.css')
  const tag = first.tag === 'just' && first.value.tag === 'sent'
    ? String (first.value.headers['etag'])
    : ''
  assert.deepStrictEqual (tag.startsWith ('W/"'), true)

  const again = await serving ('/static/style.css', {
    headers: { 'if-none-match': tag },
  })
  const sent = again.tag === 'just' ? again.value : null
  assert.deepStrictEqual (sent?.tag === 'sent' ? sent.status : 0, 304)
  assert.deepStrictEqual (sent?.tag === 'sent' ? sent.body : 'body', null)

  const stale = await serving ('/static/style.css', {
    headers: { 'if-none-match': 'W/"other"' },
  })
  assert.deepStrictEqual (statusIn (stale), 200)
})

test ('kit/static — what is missing is 404; what is outside the prefix is not ours', async () => {
  const missing = await serving ('/static/missing.txt')
  assert.deepStrictEqual (statusIn (missing), 404)
  const folder = await serving ('/static/deep')
  assert.deepStrictEqual (statusIn (folder), 404)
  assert.deepStrictEqual (await serving ('/blog'), P.nothing ())
  assert.deepStrictEqual (await serving ('/'), P.nothing ())
})

test ('kit/static — you cannot leave the directory', async () => {
  const ways = [
    '/static/../outside.txt',
    '/static/..%2foutside.txt',
    '/static/%2e%2e/outside.txt',
    '/static/deep/../../outside.txt',
    '/static/.',
    '/static/%00hello.txt',
    '/static/..\\outside.txt',
  ]
  for (const path of ways) {
    const status = statusIn (await serving (path))
    assert.deepStrictEqual (status === 404 || status === 0, true, path)
  }
})

test ('kit/static — the prefix can be named your own', async () => {
  const own = files ({ dir: `${dir}/`, base: '/files/', cache: cacheForever })
  const reply = await F.promise (own (asking ('/files/hello.txt')))
  const sent = reply.tag === 'just' ? reply.value : null
  assert.deepStrictEqual (sent?.tag === 'sent' ? sent.status : 0, 200)
  assert.ok ((sent?.tag === 'sent' ? String (sent.headers['cache-control']) : '').includes ('immutable'))
  assert.deepStrictEqual (await F.promise (own (asking ('/static/hello.txt'))), P.nothing ())
})

const home: Route = page ({
  pattern: '/',
  load: () => F.resolve (data ({})),
  head: () => ({ title: P.just ('Home'), meta: [] }),
  view: () => H.h1 (['Home']),
})

const replying = answer ({ routes: [home], through: [etag ()] })

test ('kit/middleware — a page gets a tag, and that same tag is a 304', async () => {
  const first: Reply = await F.promise (replying (asking ('/')))
  const tag = first.tag === 'sent' ? String (first.headers['etag']) : ''
  assert.deepStrictEqual (tag.length > 2, true)
  assert.deepStrictEqual (first.tag === 'sent' ? typeof first.body : '', 'string')

  const again = await F.promise (
    replying (asking ('/', { headers: { 'if-none-match': tag } })),
  )
  assert.deepStrictEqual (statusOf (again), 304)
  assert.deepStrictEqual (again.tag === 'sent' ? again.body : 'body', null)
  assert.deepStrictEqual (again.tag === 'sent' ? again.headers['etag'] : '', tag)
})

test ('kit/middleware — the tag changes with the page', async () => {
  const other = answer ({
    routes: [{ ...home, view: () => H.h1 (['Not home']) } as Route],
    through: [etag ()],
  })
  const a = await F.promise (replying (asking ('/')))
  const b = await F.promise (other (asking ('/')))
  const tagOf = (r: Reply) => r.tag === 'sent' ? r.headers['etag'] : ''
  assert.deepStrictEqual (tagOf (a) === tagOf (b), false)
})

test ('kit/middleware — POST is not given a tag', async () => {
  const reply = await F.promise (replying (asking ('/', { method: 'POST' })))
  assert.deepStrictEqual (
    reply.tag === 'sent' ? reply.headers['etag'] : undefined,
    undefined,
  )
})
