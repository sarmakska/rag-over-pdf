/**
 * Chunker tests. No network, no OpenAI key required.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunk, chunkPages } from '../lib/chunker.ts'

test('chunker splits long text with overlap', () => {
  const text = 'a'.repeat(2500)
  const chunks = chunk(text, 1000, 200)
  assert.ok(chunks.length >= 3, 'expected at least three chunks')
  assert.equal(chunks[0].length, 1000)
})

test('chunker returns single chunk for short text', () => {
  assert.deepEqual(chunk('hello', 1000, 200), ['hello'])
})

test('chunker rejects overlap larger than size', () => {
  assert.throws(() => chunk('x'.repeat(100), 50, 60))
})

test('chunkPages attaches the starting page to each chunk', () => {
  const pageOne = 'alpha '.repeat(200).trim() // ~1200 chars
  const pageTwo = 'bravo '.repeat(200).trim()
  const pieces = chunkPages([pageOne, pageTwo], 1000, 200)
  assert.ok(pieces.length >= 2, 'expected multiple chunks across two pages')
  // First chunk must be on page 1.
  assert.equal(pieces[0].page, 1)
  // Some later chunk must land on page 2.
  assert.ok(pieces.some((p) => p.page === 2), 'expected a chunk on page 2')
})

test('chunkPages on a single short page yields one page-1 chunk', () => {
  const pieces = chunkPages(['short text'], 1000, 200)
  assert.equal(pieces.length, 1)
  assert.equal(pieces[0].page, 1)
})
