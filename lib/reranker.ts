/**
 * Reranker.
 *
 * Hybrid retrieval casts a wide net and is tuned for recall: pull a generous
 * candidate pool, then let a sharper model decide the final order. A reranker
 * scores each candidate against the query directly, which catches cases where
 * the first-stage ranking surfaced a chunk for the wrong reason.
 *
 * Two implementations share one interface:
 *
 *   - lexicalRerank is deterministic, dependency-free, and needs no network. It
 *     scores query-term coverage with a length penalty. The tests use it and it
 *     is the fallback when no API key is present.
 *
 *   - llmRerank asks the chat model to score each candidate 0-10 for relevance.
 *     It is the default at request time. If the model call fails for any
 *     reason, retrieval falls back to lexicalRerank rather than erroring.
 */

import type { ScoredChunk } from './vector-store.ts'
import { getOpenAI, CHAT_MODEL } from './openai.ts'

export interface RerankedChunk extends ScoredChunk {
  rerankScore: number
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1),
  )
}

/**
 * Deterministic lexical reranker. Scores the fraction of distinct query terms
 * present in the candidate, lightly favouring shorter, denser chunks.
 */
export function lexicalRerank(query: string, candidates: ScoredChunk[], topK: number): RerankedChunk[] {
  const qTerms = [...tokenSet(query)]
  const scored = candidates.map((cand) => {
    const terms = tokenSet(cand.chunk.content)
    const matched = qTerms.filter((t) => terms.has(t)).length
    const coverage = qTerms.length ? matched / qTerms.length : 0
    const lengthPenalty = 1 / (1 + Math.log10(1 + cand.chunk.content.length / 500))
    return { ...cand, rerankScore: coverage * 0.85 + coverage * lengthPenalty * 0.15 }
  })
  scored.sort((a, b) => b.rerankScore - a.rerankScore || b.score - a.score)
  return scored.slice(0, topK)
}

/**
 * LLM cross-encoder-style reranker. One batched call scores all candidates.
 * Falls back to lexicalRerank on any failure so a rerank hiccup never breaks a
 * question.
 */
export async function llmRerank(
  query: string,
  candidates: ScoredChunk[],
  topK: number,
): Promise<RerankedChunk[]> {
  if (candidates.length === 0) return []
  try {
    const list = candidates
      .map((c, i) => `[${i}] ${c.chunk.content.slice(0, 600)}`)
      .join('\n\n')
    const res = await getOpenAI().chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a search reranker. Score how well each numbered passage answers the question on a scale of 0 to 10. Reply with a JSON object of the form {"scores": [{"i": 0, "score": 7}, ...]} covering every passage index. Output only the JSON.',
        },
        { role: 'user', content: `Question: ${query}\n\nPassages:\n${list}` },
      ],
    })
    const raw = res.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(raw) as { scores?: Array<{ i: number; score: number }> }
    const scoreById = new Map<number, number>()
    for (const s of parsed.scores || []) {
      if (typeof s.i === 'number' && typeof s.score === 'number') scoreById.set(s.i, s.score)
    }
    const scored: RerankedChunk[] = candidates.map((c, i) => ({
      ...c,
      rerankScore: scoreById.has(i) ? scoreById.get(i)! / 10 : 0,
    }))
    scored.sort((a, b) => b.rerankScore - a.rerankScore || b.score - a.score)
    return scored.slice(0, topK)
  } catch (e) {
    console.error('Rerank failed, falling back to lexical:', e)
    return lexicalRerank(query, candidates, topK)
  }
}
