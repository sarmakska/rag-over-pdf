/**
 * BM25 sparse lexical index.
 *
 * Dense embedding search is strong on paraphrase and meaning but weak on exact
 * terms: product codes, error strings, surnames, anything rare. BM25 is the
 * opposite. Running both and fusing the rankings (see lib/vector-store.ts) is
 * more robust than either alone, which is the whole point of hybrid search.
 *
 * This is a compact, dependency-free BM25 with the standard k1 and b
 * parameters. It indexes the same chunk set the dense store holds.
 *
 * Term frequencies and document lengths are computed once when the corpus is
 * set, not rebuilt on every query. A query then only touches the documents that
 * actually contain a query term, via an inverted postings list, so query cost
 * scales with the number of matching postings rather than the corpus size.
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

interface Posting {
  doc: number
  tf: number
}

export class Bm25Index {
  private docLengths: number[] = []
  private df = new Map<string, number>()
  /** Inverted index: term -> list of { document index, term frequency }. */
  private postings = new Map<string, Posting[]>()
  private avgdl = 0

  /** Replace the entire corpus. Tokenises and builds the inverted index once. */
  setCorpus(documents: string[]) {
    this.docLengths = new Array(documents.length)
    this.df.clear()
    this.postings.clear()
    let totalLen = 0

    for (let d = 0; d < documents.length; d++) {
      const tokens = tokenise(documents[d])
      this.docLengths[d] = tokens.length
      totalLen += tokens.length

      const tf = new Map<string, number>()
      for (const tok of tokens) tf.set(tok, (tf.get(tok) || 0) + 1)

      for (const [term, freq] of tf) {
        this.df.set(term, (this.df.get(term) || 0) + 1)
        const list = this.postings.get(term)
        if (list) list.push({ doc: d, tf: freq })
        else this.postings.set(term, [{ doc: d, tf: freq }])
      }
    }

    this.avgdl = documents.length ? totalLen / documents.length : 0
  }

  clear() {
    this.docLengths = []
    this.df.clear()
    this.postings.clear()
    this.avgdl = 0
  }

  size() {
    return this.docLengths.length
  }

  /** Score every document against the query, returning hits sorted best-first. */
  search(query: string, k = 10): Bm25Hit[] {
    const N = this.docLengths.length
    if (N === 0) return []

    const qTokens = tokenise(query)
    const scores = new Map<number, number>()

    for (const term of qTokens) {
      const list = this.postings.get(term)
      if (!list) continue
      const n = this.df.get(term) || 0
      // BM25 idf with the +0.5 smoothing that keeps it non-negative.
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      for (const { doc, tf } of list) {
        const dl = this.docLengths[doc]
        const denom = tf + K1 * (1 - B + (B * dl) / (this.avgdl || 1))
        const contribution = idf * ((tf * (K1 + 1)) / denom)
        scores.set(doc, (scores.get(doc) || 0) + contribution)
      }
    }

    const hits: Bm25Hit[] = []
    for (const [index, score] of scores) {
      if (score > 0) hits.push({ index, score })
    }
    hits.sort((a, b) => b.score - a.score)
    return hits.slice(0, k)
  }
}
