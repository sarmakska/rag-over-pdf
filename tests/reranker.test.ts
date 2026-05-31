/**
 * Reranker tests. Uses the deterministic lexical reranker so no network or key
 * is needed.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lexicalRerank } from '../lib/reranker.ts'
import type { ScoredChunk } from '../lib/vector-store.ts'

function cand(id: string, content: string, score: number): ScoredChunk {
  return { chunk: { id, docId: 'a', source: 'a.pdf', page: 1, content, embedding: [] }, score }
}

test('lexical rerank promotes the chunk with the most query-term coverage', () => {
  const candidates = [
    cand('a:0', 'completely unrelated text about gardening and the weather', 0.9),
    cand('a:1', 'the refund policy gives a thirty day money back guarantee', 0.5),
    cand('a:2', 'shipping times vary by region and carrier', 0.4),
  ]
  const ranked = lexicalRerank('what is the refund policy', candidates, 2)
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0].chunk.id, 'a:1')
  assert.ok(ranked[0].rerankScore > ranked[1].rerankScore)
})

test('lexical rerank trims to topK', () => {
  const candidates = [cand('a:0', 'alpha', 0.1), cand('a:1', 'beta', 0.2), cand('a:2', 'gamma', 0.3)]
  assert.equal(lexicalRerank('alpha', candidates, 1).length, 1)
})

test('lexical rerank handles an empty candidate list', () => {
  assert.deepEqual(lexicalRerank('anything', [], 5), [])
})
