/**
 * In-memory vector store with cosine similarity and a parallel BM25 index.
 *
 * The store holds chunks from many documents at once. Each chunk carries its
 * source document id, the original filename, and the page it came from, so a
 * retrieved chunk can be cited back to an exact page.
 *
 * Swap this file for pgvector / Supabase Vector / Pinecone / Qdrant when you
 * outgrow a single process. The public surface (add, search, hybridSearch,
 * documents, clear) is the seam everything else depends on.
 */

import { Bm25Index } from './bm25.ts'

export interface Chunk {
  /** Stable chunk id, unique within the store. */
  id: string
  /** Document id this chunk belongs to. */
  docId: string
  /** Original filename, carried for citation display. */
  source: string
  /** 1-based page number the chunk starts on. */
  page: number
  content: string
  embedding: number[]
}

export interface ScoredChunk {
  chunk: Chunk
  score: number
}

export interface DocumentSummary {
  docId: string
  source: string
  chunks: number
  pages: number
}

const store: Chunk[] = []
const bm25 = new Bm25Index()

function reindexBm25() {
  bm25.setCorpus(store.map((c) => c.content))
}

export function add(chunks: Chunk[]) {
  store.push(...chunks)
  reindexBm25()
}

/** Remove every chunk, or just those for a single document. */
export function clear(docId?: string) {
  if (docId === undefined) {
    store.length = 0
  } else {
    for (let i = store.length - 1; i >= 0; i--) {
      if (store[i].docId === docId) store.splice(i, 1)
    }
  }
  reindexBm25()
}

export function size() {
  return store.length
}

/** List the indexed documents with chunk and page counts. */
export function documents(): DocumentSummary[] {
  const byDoc = new Map<string, DocumentSummary>()
  for (const c of store) {
    const existing = byDoc.get(c.docId)
    if (existing) {
      existing.chunks += 1
      existing.pages = Math.max(existing.pages, c.page)
    } else {
      byDoc.set(c.docId, { docId: c.docId, source: c.source, chunks: 1, pages: c.page })
    }
  }
  return [...byDoc.values()]
}

/**
 * Pure dense retrieval by cosine similarity. Optionally restrict to a set of
 * document ids so multi-document chat can scope a question to one or more docs.
 */
export function search(queryEmbedding: number[], k = 5, docIds?: string[]): ScoredChunk[] {
  const allowed = docIds && docIds.length ? new Set(docIds) : null
  const scored: ScoredChunk[] = []
  for (const c of store) {
    if (allowed && !allowed.has(c.docId)) continue
    scored.push({ chunk: c, score: cosine(queryEmbedding, c.embedding) })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}

/**
 * Hybrid retrieval. Run dense cosine search and BM25 lexical search, then fuse
 * the two rankings with Reciprocal Rank Fusion. RRF needs no score
 * normalisation across the two very different score scales, which is why it is
 * the default fusion method for hybrid search.
 */
export function hybridSearch(
  queryEmbedding: number[],
  queryText: string,
  k = 5,
  docIds?: string[],
): ScoredChunk[] {
  const allowed = docIds && docIds.length ? new Set(docIds) : null
  const pool = Math.max(k * 4, 20)

  const dense = search(queryEmbedding, pool, docIds)
  const denseRank = new Map<string, number>()
  dense.forEach((s, i) => denseRank.set(s.chunk.id, i))

  const lexical = bm25.search(queryText, pool)
  const lexRank = new Map<string, number>()
  for (const hit of lexical) {
    const c = store[hit.index]
    if (allowed && !allowed.has(c.docId)) continue
    if (!lexRank.has(c.id)) lexRank.set(c.id, lexRank.size)
  }

  const C = 60 // RRF damping constant, the conventional default.
  const fused = new Map<string, number>()
  const byId = new Map<string, Chunk>()
  for (const c of store) byId.set(c.id, c)

  for (const [id, rank] of denseRank) fused.set(id, (fused.get(id) || 0) + 1 / (C + rank))
  for (const [id, rank] of lexRank) fused.set(id, (fused.get(id) || 0) + 1 / (C + rank))

  const out: ScoredChunk[] = []
  for (const [id, score] of fused) {
    const chunk = byId.get(id)
    if (chunk) out.push({ chunk, score })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, k)
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
