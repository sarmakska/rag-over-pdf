/**
 * Tiny in-memory vector store with cosine similarity.
 *
 * Three methods. That is the entire interface. Swap to pgvector / Supabase
 * Vector / Pinecone / Qdrant by replacing this file. Nothing else changes.
 */

export interface Chunk {
  content: string
  embedding: number[]
  source?: string
}

const store: Chunk[] = []

export function add(chunks: Chunk[]) {
  store.push(...chunks)
}

export function clear() {
  store.length = 0
}

export function size() {
  return store.length
}

export function search(queryEmbedding: number[], k = 5): Chunk[] {
  const scored = store.map((c) => ({
    chunk: c,
    score: cosine(queryEmbedding, c.embedding),
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k).map((s) => s.chunk)
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
