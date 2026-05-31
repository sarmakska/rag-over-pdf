/**
 * BM25 sparse lexical index.
 *
 * Dense embedding search is strong on paraphrase and meaning but weak on exact
 * terms: product codes, error strings, surnames, anything rare. BM25 is the
 * opposite. Running both and fusing the rankings (see lib/hybrid.ts) is more
 * robust than either alone, which is the whole point of hybrid search.
 *
 * This is a compact, dependency-free BM25 with the standard k1 and b
 * parameters. It indexes the same chunk set the dense store holds.
 */

export interface Bm25Hit {
  index: number
  score: number
}

const K1 = 1.5
const B = 0.75

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

export class Bm25Index {
  private docs: string[][] = []
  private df = new Map<string, number>()
  private avgdl = 0

  /** Replace the entire corpus. */
  setCorpus(documents: string[]) {
    this.docs = documents.map(tokenise)
    this.df.clear()
    let totalLen = 0
    for (const tokens of this.docs) {
      totalLen += tokens.length
      const seen = new Set<string>()
      for (const tok of tokens) {
        if (!seen.has(tok)) {
          seen.add(tok)
          this.df.set(tok, (this.df.get(tok) || 0) + 1)
        }
      }
    }
    this.avgdl = this.docs.length ? totalLen / this.docs.length : 0
  }

  clear() {
    this.docs = []
    this.df.clear()
    this.avgdl = 0
  }

  size() {
    return this.docs.length
  }

  /** Score every document against the query, returning hits sorted best-first. */
  search(query: string, k = 10): Bm25Hit[] {
    if (this.docs.length === 0) return []
    const qTokens = tokenise(query)
    const N = this.docs.length
    const hits: Bm25Hit[] = []

    for (let i = 0; i < this.docs.length; i++) {
      const tokens = this.docs[i]
      const dl = tokens.length
      const tf = new Map<string, number>()
      for (const tok of tokens) tf.set(tok, (tf.get(tok) || 0) + 1)

      let score = 0
      for (const term of qTokens) {
        const f = tf.get(term)
        if (!f) continue
        const n = this.df.get(term) || 0
        // BM25 idf with the +0.5 smoothing that keeps it non-negative.
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
        const denom = f + K1 * (1 - B + (B * dl) / (this.avgdl || 1))
        score += idf * ((f * (K1 + 1)) / denom)
      }
      if (score > 0) hits.push({ index: i, score })
    }

    hits.sort((a, b) => b.score - a.score)
    return hits.slice(0, k)
  }
}
