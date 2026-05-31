/**
 * End-to-end retrieval test.
 *
 * Exercises the real main flow against the fixture PDFs with no network: parse
 * the PDF into pages, chunk with page tracking, embed with a deterministic
 * local bag-of-words embedder, index into the real store, then run the real
 * hybrid-search-plus-rerank retrieval pipeline and the citation builder.
 *
 * Using a deterministic embedder keeps the test offline while still proving the
 * full pipeline wires together: PDF to pages to chunks to retrieval to
 * citations with page numbers.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parsePdf } from '../lib/pdf.ts'
import { chunkPages } from '../lib/chunker.ts'
import { add, clear, documents, type Chunk } from '../lib/vector-store.ts'
import { retrieve } from '../lib/retrieval.ts'
import { lexicalRerank } from '../lib/reranker.ts'
import { buildCitations } from '../lib/citations.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, 'fixtures')

// Deterministic offline embedder: hashed bag-of-words into a fixed dimension.
const DIM = 256
function embedText(text: string): number[] {
  const v = new Array(DIM).fill(0)
  for (const tok of text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (tok.length < 2) continue
    let h = 0
    for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0
    v[h % DIM] += 1
  }
  return v
}

async function indexPdf(file: string, docId: string): Promise<number> {
  const { pages } = await parsePdf(readFileSync(join(fixtures, file)))
  const pieces = chunkPages(pages, 400, 80)
  const chunks: Chunk[] = pieces.map((p, i) => ({
    id: `${docId}:${i}`,
    docId,
    source: file,
    page: p.page,
    content: p.content,
    embedding: embedText(p.content),
  }))
  add(chunks)
  return pages.length
}

test('e2e: parse, chunk, index, retrieve, and cite across two documents', async () => {
  clear()
  const samplePages = await indexPdf('sample.pdf', 'sample')
  const reportPages = await indexPdf('report.pdf', 'report')

  assert.ok(samplePages >= 2, 'sample.pdf should have at least two pages')
  assert.ok(reportPages >= 2, 'report.pdf should have at least two pages')

  const docs = documents()
  assert.equal(docs.length, 2, 'both documents indexed')

  // Question answered by the refund passage in sample.pdf.
  const question = 'what is the refund money back guarantee policy'
  const top = await retrieve({
    queryEmbedding: embedText(question),
    queryText: question,
    topK: 3,
    rerank: lexicalRerank,
  })
  assert.ok(top.length > 0, 'retrieval returned results')
  assert.equal(top[0].chunk.source, 'sample.pdf', 'top hit comes from the refund document')

  const citations = buildCitations(top)
  assert.equal(citations[0].marker, 1)
  assert.ok(citations[0].page >= 1, 'citation carries a page number')
  assert.ok(citations[0].snippet.length > 0, 'citation carries a snippet')
  clear()
})

test('e2e: scoping a question to one document excludes the other', async () => {
  clear()
  await indexPdf('sample.pdf', 'sample')
  await indexPdf('report.pdf', 'report')

  const question = 'dividend per share and headcount'
  const top = await retrieve({
    queryEmbedding: embedText(question),
    queryText: question,
    topK: 3,
    docIds: ['report'],
    rerank: lexicalRerank,
  })
  assert.ok(top.length > 0)
  assert.ok(
    top.every((c) => c.chunk.docId === 'report'),
    'every retrieved chunk belongs to the scoped document',
  )
  clear()
})

test('e2e: hybrid retrieval finds an exact term the embedder buries', async () => {
  clear()
  await indexPdf('sample.pdf', 'sample')

  // E1099 is a rare token; BM25 should surface its passage regardless of the
  // dense ranking.
  const question = 'E1099'
  const top = await retrieve({
    queryEmbedding: embedText(question),
    queryText: question,
    topK: 3,
    rerank: lexicalRerank,
  })
  assert.ok(
    top.some((c) => c.chunk.content.includes('E1099')),
    'expected the E1099 passage in the results',
  )
  clear()
})
