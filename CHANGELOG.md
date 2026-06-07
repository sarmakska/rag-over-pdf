# Changelog

All notable changes to rag-over-pdf are documented here.

The format follows Keep a Changelog. Versioning follows Semver.

## [Unreleased]

### Added

- Weighted Reciprocal Rank Fusion in `hybridSearch` (`lib/vector-store.ts`). Each ranking now contributes `weight / (60 + rank)`, with the dense and lexical weights read from `HYBRID_DENSE_WEIGHT` and `HYBRID_LEXICAL_WEIGHT`. Both default to 1, which reproduces plain RRF exactly, so existing behaviour is unchanged. Raise the lexical weight on identifier-heavy corpora, raise the dense weight on prose-heavy ones.
- BM25 inverted postings index (`lib/bm25.ts`). Term frequencies and document lengths are now precomputed once when the corpus is set, and a query scores only the documents that contain a query term via the postings list. Measured on a 5,000-chunk corpus this cuts average lexical-search latency from ~26ms to ~1.4ms (over 10x), and the gap widens with corpus size. Ranking output is unchanged.
- Tests for weighted fusion (dense-heavy versus lexical-heavy ordering, equal weights reproducing plain RRF) and for the postings-based BM25 (term-frequency weighting, postings filtering, corpus re-set). Twenty-seven tests in total, all offline.

- Hybrid retrieval (`lib/vector-store.ts`, `lib/bm25.ts`). Dense cosine search now runs alongside a dependency-free BM25 lexical index, and the two rankings are fused with Reciprocal Rank Fusion. Dense search handles paraphrase, BM25 handles exact terms such as error codes and identifiers, and fusion is more robust than either alone.
- Reranker step (`lib/reranker.ts`). A second-stage reranker reorders the recall-oriented candidate pool for precision. The default LLM reranker scores each candidate against the question and falls back to a deterministic lexical reranker if the model call fails, so a rerank hiccup never breaks a question.
- Citation streaming (`lib/citations.ts`). The chat route streams newline-delimited JSON. The first event is the citation list (source, page, snippet, marker) so the UI renders sources immediately, then answer tokens stream, then a final done event closes the stream.
- Multi-document chat. The store holds many documents at once, the upload route adds documents rather than replacing, and the UI lists indexed documents with chunk and page counts. A question can be scoped to a subset of documents or run across all of them.
- Page-level highlights (`lib/pdf.ts`, `lib/chunker.ts`). PDF text is extracted page by page through the pdf-parse pagerender hook, the chunker tracks which page each chunk starts on, and that page number flows through retrieval into the citation payload so the UI can show the exact page a passage came from.
- Retrieval orchestrator (`lib/retrieval.ts`) so the chat route and the tests exercise the identical hybrid-plus-rerank path.
- End-to-end tests with committed fixture PDFs covering parse, chunk, index, retrieve, scope, and cite. Unit tests for the chunker, BM25 index, vector store, reranker, and citation protocol. Twenty-two tests in total, all offline.

### Changed

- `POST /api/upload` is now multi-document and page-aware, returns a document id and page count, and accepts a `replace` flag.
- `POST /api/chat` returns an NDJSON stream of citations and tokens instead of plain text, and accepts an optional `docIds` array to scope the question.
- `GET /api/upload` lists indexed documents; `DELETE /api/upload` removes a single document by `docId` or clears everything.
- The vector store interface gained `documents()` and `hybridSearch()` and now carries chunk id, document id, source, and page on every chunk.
- Tests moved from `lib/rag.test.ts` to a dedicated `tests/` directory.
- Applied non-breaking dependency updates within existing semver ranges (openai, pdf-parse, postcss, autoprefixer, tailwindcss patch lines).
- CI now runs on Node 24.

### Documented

- README rewritten around the new feature set with a Mermaid architecture diagram and an updated quickstart.
- Every wiki page rewritten to describe hybrid search, reranking, citation streaming, multi-document chat, and page-level highlights.

## [1.0.0] - 2026-05-03

First public release. The project is intentionally small and complete.

### Added

- Next.js 14 App Router project with two API routes and a single chat page.
- PDF upload route (`/api/upload`) that parses, chunks, and embeds documents.
- Chat route (`/api/chat`) that retrieves the top-k chunks and streams a completion.
- Fixed-size chunker with configurable overlap in `lib/chunker.ts`.
- In-memory vector store with cosine similarity search in `lib/vector-store.ts`.
- OpenAI client wrapper with a single embed helper and a single chat helper.
- Streaming UI rendered as plain text tokens.
- Clear separation between indexing and retrieval so each can be replaced.
- README with quick start, configuration, and a link to the wiki.
- Deployed example targeting Vercel serverless functions with Node runtime.

### Documented

- Architecture, retrieval flow, chunking trade-offs, and known failure modes.
- Cost and performance reference for typical PDF sizes.
- A migration recipe for swapping the in-memory store with pgvector.

### Known limits at 1.0.0

- Single-tenant. No auth. The store is global and resets on cold start.
- No OCR. Scanned PDFs with no extractable text are rejected with 400.
- No persistence. Reindex on each deploy or restart.
- Single embedding provider (OpenAI). Local embeddings are on the roadmap.
