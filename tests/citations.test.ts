/**
 * Citation protocol tests: building citations and round-tripping NDJSON events.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCitations, encodeEvent, parseEvents, type StreamEvent } from '../lib/citations.ts'
import type { RerankedChunk } from '../lib/reranker.ts'

function reranked(id: string, page: number, content: string): RerankedChunk {
  return {
    chunk: { id, docId: 'a', source: 'a.pdf', page, content, embedding: [] },
    score: 0.5,
    rerankScore: 0.9,
  }
}

test('buildCitations numbers markers from 1 and carries page numbers', () => {
  const citations = buildCitations([reranked('a:0', 3, 'first passage'), reranked('a:1', 7, 'second passage')])
  assert.equal(citations[0].marker, 1)
  assert.equal(citations[0].page, 3)
  assert.equal(citations[1].marker, 2)
  assert.equal(citations[1].page, 7)
  assert.equal(citations[0].source, 'a.pdf')
})

test('encode then parse round-trips a sequence of events', () => {
  const events: StreamEvent[] = [
    { type: 'citations', citations: buildCitations([reranked('a:0', 1, 'passage')]) },
    { type: 'token', value: 'Hello' },
    { type: 'token', value: ' world' },
    { type: 'done' },
  ]
  const buffer = events.map(encodeEvent).join('')
  const { events: parsed, rest } = parseEvents(buffer)
  assert.equal(rest, '')
  assert.equal(parsed.length, 4)
  assert.equal(parsed[0].type, 'citations')
  assert.equal((parsed[1] as { value: string }).value, 'Hello')
  assert.equal(parsed[3].type, 'done')
})

test('parseEvents holds back a trailing partial line', () => {
  const full = encodeEvent({ type: 'token', value: 'complete' })
  const partial = '{"type":"token","value":"incom'
  const { events, rest } = parseEvents(full + partial)
  assert.equal(events.length, 1)
  assert.equal(rest, partial)
})
