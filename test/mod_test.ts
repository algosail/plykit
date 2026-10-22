import * as P from '@algosail/ply'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as K from '../src/mod.ts'

test ('names inside kit do not overlap', () => {
  const names = Object.keys (K)
  assert.deepStrictEqual (names.length, new Set (names).size)
})

test ('kit does not shadow ply, which is written beside it', () => {
  const clash = Object.keys (K).filter ((n) => n in P)
  assert.deepStrictEqual (clash, [])
})

test ('the two sides of an exchange differ by their prefix', () => {
  assert.strictEqual (typeof K.readJson, 'function')
  assert.strictEqual (typeof K.readText, 'function')
  assert.strictEqual (typeof K.readHeader, 'function')
  assert.strictEqual (typeof K.readCookies, 'function')
  assert.strictEqual (typeof K.withHeader, 'function')
  assert.strictEqual (typeof K.withCookie, 'function')
  assert.strictEqual (typeof K.json, 'function')
  assert.strictEqual (typeof K.text, 'function')
})

test ('a renamed export behaves as the old one did', () => {
  const one = K.cookie ('visitor') ('7')
  assert.deepStrictEqual (K.serializeCookie (one).startsWith ('visitor=7'), true)
  assert.deepStrictEqual (K.parseCookies ('a=1; b=2'), { a: '1', b: '2' })
  assert.deepStrictEqual (K.statusOf (K.text ('hello')), 200)
  assert.deepStrictEqual (
    K.renderDocument ({
      head: { title: P.nothing (), meta: [] },
      body: '<p>body</p>',
      styles: '',
      lang: 'ru',
      scripts: [],
    }).includes ('<p>body</p>'),
    true,
  )
})
