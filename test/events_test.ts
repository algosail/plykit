import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import * as S from '@algosail/plystream'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Endpoint, ServerEvent } from '../src/mod.ts'
import { isLiveRoute, liveRoute } from '../src/events.ts'
import {
  channel,
  endpoint,
  eventStream,
  lastEventId,
  PART_EVENT,
  RELOAD_EVENT,
  RELOAD_PATH,
  reloadRoute,
  serializeEvent,
  stalePart,
  text,
  toResponse,
} from '../src/mod.ts'

const decoder = new TextDecoder ()

test ('kit/events — an event on the wire', () => {
  assert.deepStrictEqual (serializeEvent ({ data: 'hello' }), 'data: hello\n\n')
  assert.deepStrictEqual (
    serializeEvent (stalePart ('comments')),
    `event: ${PART_EVENT}\ndata: comments\n\n`,
  )
  assert.deepStrictEqual (
    serializeEvent ({ data: 'x', id: '7', retry: 3000, event: 'tick' }),
    'event: tick\nid: 7\nretry: 3000\ndata: x\n\n',
  )
  assert.deepStrictEqual (
    serializeEvent ({ data: 'two\nlines' }),
    'data: two\ndata: lines\n\n',
  )
  assert.deepStrictEqual (
    serializeEvent ({ data: '', event: 'ping' }),
    'event: ping\ndata: \n\n',
  )
})

test ('kit/events — last-event-id is read when it is there', () => {
  const back = new Request ('http://x/live', {
    headers: { 'last-event-id': '184' },
  })
  assert.deepStrictEqual (lastEventId (back), P.just ('184'))
  assert.deepStrictEqual (lastEventId (new Request ('http://x/live')), P.nothing ())
  assert.deepStrictEqual (
    lastEventId (
      new Request ('http://x/live', { headers: { 'last-event-id': '' } }),
    ),
    P.nothing (),
  )
})

test ('kit/events — a channel of its own needs a path of its own', () => {
  assert.throws (
    () => channel ({ path: '' }),
    (error: unknown) => error instanceof Error && error.message.includes ('pass the path'),
  )
  assert.throws (
    () => channel ({ path: '/live' }),
    (error: unknown) => error instanceof Error && error.message.includes ('belongs to the free channel'),
  )
})

test ('kit/events — the free route is marked on itself', () => {
  assert.deepStrictEqual (isLiveRoute (liveRoute ()), true)
  assert.deepStrictEqual (
    isLiveRoute (endpoint ({
      pattern: '/live',
      on: { GET: () => F.resolve (text ('mine')) },
    })),
    false,
  )
})

test ('kit/events — the channel plays what the browser missed', async () => {
  let asked: P.Maybe<string> = P.just ('have not asked yet')
  const one = channel ({
    path: '/updates',
    heartbeat: 0,
    replay: (since: P.Maybe<string>): S.Stream<ServerEvent> => {
      asked = since
      return S.wrap<ServerEvent> ({ id: '8', data: 'missed' })
    },
  })

  const reply = await F.promise (
    (one.route as Endpoint).on.GET! ({
      url: new URL ('http://kit.test/live'),
      params: {},
      request: new Request ('http://kit.test/live', {
        headers: { 'last-event-id': '7' },
      }),
      routeId: '/live',
      state: undefined,
      env: undefined,
      live: { send() {} },
      client: P.nothing<string> (),
    }),
  )
  const res = toResponse (reply)
  const reader = res.body!.getReader ()

  assert.deepStrictEqual (asked, P.just ('7'))
  assert.deepStrictEqual (
    decoder.decode ((await reader.read ()).value),
    'id: 8\ndata: missed\n\n',
  )

  one.stale ('comments')
  assert.deepStrictEqual (
    decoder.decode ((await reader.read ()).value),
    `event: ${PART_EVENT}\ndata: comments\n\n`,
  )

  await reader.cancel ()
})

test ('kit/events — the reply is a stream with the right headers', () => {
  const [source] = S.bus<ServerEvent> ()
  const res = toResponse (eventStream (source, { heartbeat: 0 }))

  assert.deepStrictEqual (res.status, 200)
  assert.deepStrictEqual (
    res.headers.get ('content-type'),
    'text/event-stream; charset=utf-8',
  )
  assert.ok ((String (res.headers.get ('cache-control'))).includes ('no-cache'))
  assert.ok ((String (res.headers.get ('cache-control'))).includes ('no-transform'))
  assert.deepStrictEqual (res.body === null, false)
  return res.body?.cancel ()
})

test ('kit/events — what was sent is what arrived', async () => {
  const [source, announce] = S.bus<ServerEvent> ()
  const res = toResponse (eventStream (source, { heartbeat: 0 }))
  const reader = res.body!.getReader ()

  announce (stalePart ('comments'))
  announce ({ data: 'hello', id: '1' })

  const first = decoder.decode ((await reader.read ()).value)
  const second = decoder.decode ((await reader.read ()).value)
  assert.deepStrictEqual (first, `event: ${PART_EVENT}\ndata: comments\n\n`)
  assert.deepStrictEqual (second, 'id: 1\ndata: hello\n\n')

  await reader.cancel ()
})

test ('kit/events — the browser stopped listening — the subscription is gone', async () => {
  let listeners = 0
  const source = S.stream<ServerEvent> ((_snk: S.Sink<ServerEvent>) => {
    listeners++
    return S.disposable (() => {
      listeners--
    })
  })

  const res = toResponse (eventStream (source, { heartbeat: 0 }))
  const reader = res.body!.getReader ()
  assert.deepStrictEqual (listeners, 1)

  await reader.cancel ()
  assert.deepStrictEqual (listeners, 0)
})

test ('kit/events — the source ended — so did the reply', async () => {
  let ending: (() => void) | null = null
  const source = S.stream<ServerEvent> (
    (snk: S.Sink<ServerEvent>, sch: S.Scheduler) => {
      ending = () => snk.end (sch.currentTime ())
      return S.disposable (() => {})
    },
  )

  const res = toResponse (eventStream (source, { heartbeat: 0 }))
  const reader = res.body!.getReader ()
  ending! ()
  const last = await reader.read ()
  assert.deepStrictEqual (last.done, true)
})

test ('kit/events — the heartbeat goes by itself while nobody writes', async () => {
  const [source] = S.bus<ServerEvent> ()
  const res = toResponse (eventStream (source, { heartbeat: 10 }))
  const reader = res.body!.getReader ()

  const beat = decoder.decode ((await reader.read ()).value)
  assert.deepStrictEqual (beat, ': ping\n\n')

  await reader.cancel ()
})

test ('kit/events — the reload route names the run and then stays quiet', async () => {
  const route = reloadRoute ()
  assert.deepStrictEqual (route.pattern, RELOAD_PATH)

  const reply = await F.promise (
    (route as Endpoint).on.GET! ({
      url: new URL (`http://kit.test${RELOAD_PATH}`),
      params: {},
      request: new Request (`http://kit.test${RELOAD_PATH}`),
      routeId: RELOAD_PATH,
      state: undefined,
      env: undefined,
      live: { send() {} },
      client: P.nothing<string> (),
    }),
  )
  const res = toResponse (reply)
  const reader = res.body!.getReader ()

  const said = decoder.decode ((await reader.read ()).value)
  assert.ok ((said).includes (`event: ${RELOAD_EVENT}\n`))
  assert.ok ((said).includes ('retry: 500\n'))
  assert.ok ((said).includes ('\ndata: '))

  const again = await F.promise (
    (route as Endpoint).on.GET! ({
      url: new URL (`http://kit.test${RELOAD_PATH}`),
      params: {},
      request: new Request (`http://kit.test${RELOAD_PATH}`),
      routeId: RELOAD_PATH,
      state: undefined,
      env: undefined,
      live: { send() {} },
      client: P.nothing<string> (),
    }),
  )
  const twice = toResponse (again)
  const second = twice.body!.getReader ()
  assert.deepStrictEqual (decoder.decode ((await second.read ()).value), said)

  await reader.cancel ()
  await second.cancel ()
})
