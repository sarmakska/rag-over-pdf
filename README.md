# RAG-over-PDF

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![OpenAI](https://img.shields.io/badge/OpenAI-API-412991?logo=openai&logoColor=white)](https://platform.openai.com)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com)
[![Open Source](https://img.shields.io/badge/Open_Source-%E2%9D%A4-red)](https://github.com/sarmakska/rag-over-pdf)

**A minimal, production-shaped RAG starter. Upload a PDF, ask questions, get cited answers.**

Built by [Sarma Linux](https://sarmalinux.com). Built to ship, not to sit on a shelf.

---

## What this is

A working Retrieval-Augmented Generation (RAG) starter. Upload any PDF. The app chunks it, embeds it, and answers questions about it using only the relevant chunks as context. Streaming, with citations.

This is the cleanest possible end-to-end RAG you can clone, run, and ship in 10 minutes. No vector DB to provision, no Pinecone account, no LangChain weight. Just the moving parts.

## What it solves

- "I have 200 internal PDFs nobody reads, can we make them searchable?"
- "We need a chatbot grounded in our actual documentation, not the open web"
- "I want to learn how RAG actually works under the hood, without a framework hiding it"

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Upload PDF                                                 │
│    ↓ pdf-parse extract text                                 │
│    ↓ chunk (1000 chars, 200 overlap)                        │
│    ↓ embed (OpenAI text-embedding-3-small)                  │
│    ↓ store in-memory vector index (cosine similarity)       │
└─────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────┐
│  Question                                                   │
│    ↓ embed question                                         │
│    ↓ retrieve top-5 chunks                                  │
│    ↓ stream answer through gpt-4o-mini with chunks in       │
│       system prompt                                          │
└─────────────────────────────────────────────────────────────┘
```

Single-process, single-machine. Swap the in-memory store for `pgvector`, Supabase Vector, Pinecone or Qdrant when you outgrow it. The interface is a 30-line module.

## Quick start

```bash
git clone https://github.com/sarmakska/rag-over-pdf.git
cd rag-over-pdf
pnpm install
cp .env.example .env.local
# add your OPENAI_API_KEY to .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), upload a PDF, ask a question.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 App Router | Streaming, server actions, edge-ready |
| Language | TypeScript | Catch errors before runtime |
| PDF parsing | `pdf-parse` | Pure JS, no native deps, runs anywhere |
| Embeddings | OpenAI `text-embedding-3-small` | $0.02 / 1M tokens, 1536 dims, fast |
| Vector store | In-memory cosine | Zero-infra, swap to pgvector when needed |
| Generation | OpenAI `gpt-4o-mini` (streaming) | Cheap, fast, smart enough |
| Styling | Tailwind CSS | What everyone uses, get on with it |

## Configuration

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `OPENAI_API_KEY` | yes | — | Used for embeddings + generation |
| `EMBEDDING_MODEL` | no | `text-embedding-3-small` | Override if you have a preferred model |
| `CHAT_MODEL` | no | `gpt-4o-mini` | Override the generation model |
| `CHUNK_SIZE` | no | `1000` | Characters per chunk |
| `CHUNK_OVERLAP` | no | `200` | Overlap between chunks |
| `TOP_K` | no | `5` | How many chunks to retrieve per question |

## Swap to pgvector (when you need persistence)

The in-memory store lives in `lib/vector-store.ts`. Replace its three methods (`add`, `search`, `clear`) with Postgres calls and you're on a real DB. The retrieval pipeline does not care.

```sql
create extension if not exists vector;
create table chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(1536) not null,
  source text,
  created_at timestamptz default now()
);
create index on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/sarmakska/rag-over-pdf)

Vercel will prompt for the `OPENAI_API_KEY` env var. That is all the configuration needed.

## Limitations (honest list)

- **In-memory store.** Restarting the server clears the index. Fine for demos, swap to pgvector for anything real.
- **One PDF at a time** in the demo UI. The `vector-store.ts` API supports multiple, the UI just doesn't expose it.
- **No re-ranking.** Adding a cross-encoder re-ranker on the top-20 retrieved chunks measurably improves quality. Not included to keep the surface small.
- **No chunking strategy beyond fixed-size.** Real production RAG benefits from semantic chunking or document-structure-aware chunking. Out of scope for a starter.
- **Cost.** Each question is an embedding call plus a generation call. With OpenAI's smallest models that's well under £0.001 per question, but it is not free.

## Roadmap

- [x] PDF upload and parsing
- [x] In-memory vector store
- [x] Streaming answers
- [ ] Multi-document support in UI
- [ ] pgvector adapter as a drop-in
- [ ] Citation rendering with page numbers
- [ ] Local embedding option (sentence-transformers via Ollama)

PRs welcome.

## Related work

- [SarmaLink-AI](https://github.com/sarmakska/Sarmalink-ai) — multi-provider AI backend with automatic failover
- [StaffPortal](https://github.com/sarmakska/staff-portal) — open-source staff management platform

## License

MIT. Use it however you want. Attribution appreciated, not required.

Built by [Sarma Linux](https://sarmalinux.com).


---

## More open source by Sarma

Part of a portfolio of twelve production-shaped open-source repositories built and maintained by [Sarma](https://sarmalinux.com).

| Repository | What it is |
|---|---|
| [Sarmalink-ai](https://github.com/sarmakska/Sarmalink-ai) | Multi-provider OpenAI-compatible AI gateway with 14-engine failover and intent-based plugin auto-routing |
| [agent-orchestrator](https://github.com/sarmakska/agent-orchestrator) | Durable multi-agent workflows in TypeScript with deterministic replay and Inspector UI |
| [voice-agent-starter](https://github.com/sarmakska/voice-agent-starter) | Sub-second full-duplex voice agent loop. WebRTC, mediasoup, pluggable STT / LLM / TTS |
| [ai-eval-runner](https://github.com/sarmakska/ai-eval-runner) | Evals as code. Python, DuckDB, FastAPI viewer, regression mode for CI |
| [mcp-server-toolkit](https://github.com/sarmakska/mcp-server-toolkit) | Production Model Context Protocol server starter (Python / FastAPI) |
| [local-llm-router](https://github.com/sarmakska/local-llm-router) | OpenAI-compatible proxy that routes to Ollama or cloud providers based on policy |
| [rag-over-pdf](https://github.com/sarmakska/rag-over-pdf) | Minimal end-to-end RAG starter for PDF corpora |
| [receipt-scanner](https://github.com/sarmakska/receipt-scanner) | Vision OCR for receipts with Zod-validated JSON output |
| [webhook-to-email](https://github.com/sarmakska/webhook-to-email) | Webhook receiver that forwards events to email via Resend |
| [k8s-ops-toolkit](https://github.com/sarmakska/k8s-ops-toolkit) | Helm chart for shipping Next.js to Kubernetes with full observability stack |
| [terraform-stack](https://github.com/sarmakska/terraform-stack) | Vercel + Supabase + Cloudflare + DigitalOcean modules in one Terraform repo |
| [staff-portal](https://github.com/sarmakska/staff-portal) | Open-source HR / ops portal — leave, attendance, expenses, kiosk mode |

Engineering essays at [sarmalinux.com/blog](https://sarmalinux.com/blog) &middot; All projects at [sarmalinux.com/open-source](https://sarmalinux.com/open-source)
