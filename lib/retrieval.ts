/**
 * Retrieval orchestration.
 *
 * One function ties the retrieval pipeline together so both the chat route and
 * the tests exercise the exact same path:
 *
 *   1. Hybrid search (dense cosine + BM25, fused with RRF) pulls a wide
 *      candidate pool tuned for recall.
 *   2. The reranker reorders that pool for precision and trims to top-k.
 *
 * The reranker is pluggable so tests can pass the deterministic lexical
 * reranker and avoid the network entirely.
 */

import { hybridSearch, type ScoredChunk } from './vector-store.ts'
import { type RerankedChunk } from './reranker.ts'

export interface RetrieveOptions {
  queryEmbedding: number[]
  queryText: string
  topK: number
  /** Size of the candidate pool handed to the reranker. */
  candidatePool?: number
  /** Restrict retrieval to these document ids (multi-document scoping). */
  docIds?: string[]
  /** Reranker implementation. Defaults provided by the caller. */
  rerank: (query: string, candidates: ScoredChunk[], topK: number) => Promise<RerankedChunk[]> | RerankedChunk[]
}

export async function retrieve(opts: RetrieveOptions): Promise<RerankedChunk[]> {
  const pool = opts.candidatePool ?? Math.max(opts.topK * 4, 20)
  const candidates = hybridSearch(opts.queryEmbedding, opts.queryText, pool, opts.docIds)
  if (candidates.length === 0) return []
  return await opts.rerank(opts.queryText, candidates, opts.topK)
}
