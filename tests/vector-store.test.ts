/**
 * Vector store tests: dense search, multi-document scoping, and hybrid fusion.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  add,
  clear,
  size,
  search,
  hybridSearch,
  documents,
  type Chunk,
} from '../lib/vector-store.ts'

function makeChunk(id: string, docId: string, content: string, embedding: number[], page = 1): Chunk {
  return { id, docId, source: `${docId}.pdf`, page, content, embedding }
}

test('dense search ranks by cosine similarity', () => {
  clear()
  add([
    makeChunk('a:0', 'a', 'cats', [1, 0, 0]),
    makeChunk('a:1', 'a', 'dogs', [0, 1, 0]),
    makeChunk('a:2', 'a', 'birds', [0, 0, 1]),
  ])
  assert.equal(size(), 3)
  const top = search([0.9, 0.1, 0], 1)
  assert.equal(top.length, 1)
  assert.equal(top[0].chunk.content, 'cats')
  clear()
  assert.equal(size(), 0)
})

test('documents() summarises chunks and pages per document', () => {
  clear()
  add([
    makeChunk('a:0', 'a', 'one', [1, 0, 0], 1),
    makeChunk('a:1', 'a', 'two', [0, 1, 0], 3),
    makeChunk('b:0', 'b', 'three', [0, 0, 1], 1),
  ])
  const docs = documents()
  const a = docs.find((d) => d.docId === 'a')!
  assert.equal(a.chunks, 2)
  assert.equal(a.pages, 3)
  assert.equal(docs.length, 2)
  clear()
})

test('search scopes to the requested document ids', () => {
  clear()
  add([
    makeChunk('a:0', 'a', 'shared term', [1, 0, 0]),
    makeChunk('b:0', 'b', 'shared term', [1, 0, 0]),
  ])
  const scoped = search([1, 0, 0], 5, ['b'])
  assert.equal(scoped.length, 1)
  assert.equal(scoped[0].chunk.docId, 'b')
  clear()
})

test('hybrid search surfaces an exact lexical match a weak embedding would miss', () => {
  clear()
  // The query embedding points away from the chunk that actually contains the
  // rare term, so pure dense search would rank it last. BM25 rescues it and RRF
  // fusion lifts it into the results.
  add([
    makeChunk('a:0', 'a', 'general background prose about the weather today', [1, 0, 0]),
    makeChunk('a:1', 'a', 'the specific error code E1099 means a gateway timeout', [0, 0, 1]),
    makeChunk('a:2', 'a', 'more unrelated filler content about gardens', [0.9, 0.1, 0]),
  ])
  const hits = hybridSearch([1, 0, 0], 'E1099 timeout', 3)
  assert.ok(
    hits.some((h) => h.chunk.id === 'a:1'),
    'expected the chunk with the exact term in the fused results',
  )
  clear()
})

test('weighted RRF can tilt fusion towards the lexical ranking', () => {
  clear()
  // a:1 holds the exact rare term but its embedding points away from the query,
  // so the dense ranking buries it. a:0 is a strong dense match with no term.
  add([
    makeChunk('a:0', 'a', 'general background prose about the weather today', [1, 0, 0]),
    makeChunk('a:1', 'a', 'the specific error code E1099 means a gateway timeout', [0, 0, 1]),
    makeChunk('a:2', 'a', 'more unrelated filler content about gardens', [0.9, 0.1, 0]),
  ])

  // Heavy dense emphasis ranks the strong embedding match (a:0) above the
  // exact-term chunk (a:1).
  const denseHeavy = hybridSearch([1, 0, 0], 'E1099 timeout', 3, undefined, {
    dense: 50,
    lexical: 1,
  })
  const denseOrder = denseHeavy.map((h) => h.chunk.id)
  assert.ok(denseOrder.indexOf('a:0') < denseOrder.indexOf('a:1'))

  // Lexical emphasis promotes the chunk that actually contains the term to the
  // very top.
  const lexHeavy = hybridSearch([1, 0, 0], 'E1099 timeout', 3, undefined, {
    dense: 1,
    lexical: 5,
  })
  assert.equal(lexHeavy[0].chunk.id, 'a:1')
  clear()
})

test('equal weights reproduce plain RRF ordering', () => {
  clear()
  add([
    makeChunk('a:0', 'a', 'alpha alpha document', [1, 0, 0]),
    makeChunk('a:1', 'a', 'beta document content', [0, 1, 0]),
  ])
  const plain = hybridSearch([1, 0, 0], 'alpha', 2)
  const equal = hybridSearch([1, 0, 0], 'alpha', 2, undefined, { dense: 1, lexical: 1 })
  assert.deepEqual(
    plain.map((h) => h.chunk.id),
    equal.map((h) => h.chunk.id),
  )
  clear()
})

test('clear(docId) removes only that document', () => {
  clear()
  add([makeChunk('a:0', 'a', 'one', [1, 0, 0]), makeChunk('b:0', 'b', 'two', [0, 1, 0])])
  clear('a')
  const docs = documents()
  assert.equal(docs.length, 1)
  assert.equal(docs[0].docId, 'b')
  clear()
})
