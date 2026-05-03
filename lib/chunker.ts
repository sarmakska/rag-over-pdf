/**
 * Fixed-size character chunker with overlap.
 *
 * Real production RAG benefits from semantic or structure-aware chunking.
 * This is good enough for a starter and lets you reason about retrieval
 * behaviour without surprises.
 */

export function chunk(text: string, size = 1000, overlap = 200): string[] {
  if (text.length <= size) return [text]
  const out: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + size, text.length)
    out.push(text.slice(start, end))
    if (end === text.length) break
    start = end - overlap
  }
  return out
}
