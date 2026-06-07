/**
 * BM25 sparse index tests.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Bm25Index } from '../lib/bm25.ts'

test('bm25 ranks the document containing the rare query term first', () => {
  const idx = new Bm25Index()
  idx.setCorpus([
    'the cat sat on the mat in the warm afternoon sun',
    'error code E1099 indicates a billing gateway timeout',
    'dogs are loyal companions that enjoy long walks',
  ])
  const hits = idx.search('E1099 billing timeout', 3)
  assert.ok(hits.length > 0)
  assert.equal(hits[0].index, 1)
})

test('bm25 returns nothing for a query with no overlapping terms', () => {
  const idx = new Bm25Index()
  idx.setCorpus(['alpha beta gamma', 'delta epsilon zeta'])
  assert.equal(idx.search('xylophone quokka', 5).length, 0)
})

test('bm25 clear empties the index', () => {
  const idx = new Bm25Index()
  idx.setCorpus(['one two three'])
  assert.equal(idx.size(), 1)
  idx.clear()
  assert.equal(idx.size(), 0)
  assert.equal(idx.search('one', 5).length, 0)
})

test('bm25 weights repeated query terms in a document above a single mention', () => {
  const idx = new Bm25Index()
  idx.setCorpus([
    'gateway gateway gateway timeout on the billing path',
    'a single gateway mention buried in unrelated prose about gardens and weather',
  ])
  const hits = idx.search('gateway', 2)
  assert.equal(hits[0].index, 0)
})

test('bm25 only returns documents that contain a query term', () => {
  const idx = new Bm25Index()
  idx.setCorpus(['apple banana', 'cherry date', 'apple elderberry'])
  const hits = idx.search('apple', 5)
  assert.equal(hits.length, 2)
  assert.deepEqual(
    hits.map((h) => h.index).sort(),
    [0, 2],
  )
})

test('bm25 re-set corpus replaces all prior postings', () => {
  const idx = new Bm25Index()
  idx.setCorpus(['first corpus alpha'])
  idx.setCorpus(['second corpus beta'])
  assert.equal(idx.search('alpha', 5).length, 0)
  assert.equal(idx.search('beta', 5).length, 1)
})
