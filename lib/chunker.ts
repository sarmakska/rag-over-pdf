/**
 * Fixed-size character chunker with overlap and page tracking.
 *
 * Real production RAG benefits from semantic or structure-aware chunking.
 * Fixed-size chunking is good enough for a starter and lets you reason about
 * retrieval behaviour without surprises.
 *
 * The page-aware variant keeps a running offset map so every chunk knows which
 * page it started on. That page number flows all the way through retrieval into
 * the citation payload, so the UI can render page-level highlights.
 */

export interface TextChunk {
  /** The chunk text. */
  content: string
  /** 1-based page number the chunk starts on. */
  page: number
  /** Character offset of the chunk within the full document text. */
  offset: number
}

/**
 * Plain fixed-size chunker. Kept for the simplest call sites and tests.
 */
export function chunk(text: string, size = 1000, overlap = 200): string[] {
  if (size <= 0) throw new Error('chunk size must be positive')
  if (overlap >= size) throw new Error('overlap must be smaller than chunk size')
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

/**
 * Chunk a document whose pages are supplied in reading order. The chunker joins
 * the pages with a single space, chunks the joined text, and resolves each
 * chunk back to the page it began on.
 */
export function chunkPages(pages: string[], size = 1000, overlap = 200): TextChunk[] {
  const normalised = pages.map((p) => p.replace(/\s+/g, ' ').trim())
  // pageStart[i] is the character offset in the joined text where page i begins.
  const pageStart: number[] = []
  let cursor = 0
  for (let i = 0; i < normalised.length; i++) {
    pageStart.push(cursor)
    cursor += normalised[i].length
    if (i < normalised.length - 1) cursor += 1 // the joining space
  }
  const joined = normalised.join(' ')

  const pieces = chunk(joined, size, overlap)
  const out: TextChunk[] = []
  let offset = 0
  for (const piece of pieces) {
    out.push({ content: piece, page: pageForOffset(pageStart, offset), offset })
    // Advance offset by the stride (size - overlap), matching chunk().
    offset += Math.max(1, piece.length - overlap)
  }
  return out
}

function pageForOffset(pageStart: number[], offset: number): number {
  // Find the last page whose start is at or before the offset.
  let page = 1
  for (let i = 0; i < pageStart.length; i++) {
    if (pageStart[i] <= offset) page = i + 1
    else break
  }
  return page
}
