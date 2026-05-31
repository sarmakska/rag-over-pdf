/**
 * Citation streaming protocol.
 *
 * The chat route streams newline-delimited JSON (NDJSON). Each line is one
 * event. Citations are sent first as a single event so the UI can render the
 * source list and page-level highlights immediately, then answer text arrives
 * as a sequence of token events. A final done event closes the stream.
 *
 * NDJSON keeps the client parser trivial (split on newlines, JSON.parse each
 * line) while letting one stream carry both structured citations and free-form
 * tokens.
 */

import type { RerankedChunk } from './reranker.ts'

export interface Citation {
  /** 1-based marker the model is told to cite, for example [1]. */
  marker: number
  chunkId: string
  docId: string
  source: string
  page: number
  /** First ~240 characters of the chunk, for the highlight snippet. */
  snippet: string
  /** Fusion score from retrieval, useful for debugging relevance. */
  score: number
}

export type StreamEvent =
  | { type: 'citations'; citations: Citation[] }
  | { type: 'token'; value: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export function buildCitations(chunks: RerankedChunk[]): Citation[] {
  return chunks.map((c, i) => ({
    marker: i + 1,
    chunkId: c.chunk.id,
    docId: c.chunk.docId,
    source: c.chunk.source,
    page: c.chunk.page,
    snippet: c.chunk.content.slice(0, 240).trim(),
    score: c.score,
  }))
}

export function encodeEvent(event: StreamEvent): string {
  return JSON.stringify(event) + '\n'
}

/**
 * Parse a raw NDJSON buffer into complete events plus any trailing partial
 * line. The client calls this on every read so half-received lines are held
 * over until the rest arrives.
 */
export function parseEvents(buffer: string): { events: StreamEvent[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const events: StreamEvent[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      events.push(JSON.parse(trimmed) as StreamEvent)
    } catch {
      // Ignore a malformed line rather than aborting the whole stream.
    }
  }
  return { events, rest }
}
