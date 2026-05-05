# Changelog

All notable changes to rag-over-pdf are documented here.

The format follows Keep a Changelog. Versioning follows Semver.

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
