/**
 * Smoke test for the core RAG primitives. No network, no OpenAI key required.
 * Proves the chunker and in-memory vector store boot and behave as expected.
 *
 * Run with: pnpm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunk } from './chunker.ts'
import { add, clear, size, search, type Chunk } from './vector-store.ts'

test('chunker splits long text with overlap', () => {
  const text = 'a'.repeat(2500)
  const chunks = chunk(text, 1000, 200)
  assert.ok(chunks.length >= 3, 'expected at least three chunks')
  assert.equal(chunks[0].length, 1000)
})

test('chunker returns single chunk for short text', () => {
  assert.deepEqual(chunk('hello', 1000, 200), ['hello'])
})

test('vector store stores and ranks by cosine similarity', () => {
  clear()
  const docs: Chunk[] = [
    { content: 'cats', embedding: [1, 0, 0] },
    { content: 'dogs', embedding: [0, 1, 0] },
    { content: 'birds', embedding: [0, 0, 1] },
  ]
  add(docs)
  assert.equal(size(), 3)

  const top = search([0.9, 0.1, 0], 1)
  assert.equal(top.length, 1)
  assert.equal(top[0].content, 'cats')
  clear()
  assert.equal(size(), 0)
})
