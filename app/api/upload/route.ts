import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { parsePdf } from '@/lib/pdf'
import { embed } from '@/lib/openai'
import { add, clear, documents, type Chunk } from '@/lib/vector-store'
import { chunkPages } from '@/lib/chunker'

export const runtime = 'nodejs'
export const maxDuration = 60

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '1000', 10)
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP || '200', 10)

/**
 * Index a PDF.
 *
 * Multi-document by default: each upload becomes its own document and is added
 * alongside whatever is already indexed. Pass replace=true in the form to wipe
 * the store first. Pages are tracked through parsing and chunking so every
 * stored chunk carries the page it came from.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    const replace = form.get('replace') === 'true'
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const { pages, text } = await parsePdf(buf)
    if (!text) {
      return NextResponse.json(
        { ok: false, error: 'PDF has no extractable text' },
        { status: 400 },
      )
    }

    const pieces = chunkPages(pages, CHUNK_SIZE, CHUNK_OVERLAP)
    const embeddings = await embed(pieces.map((p) => p.content))

    const docId = randomUUID()
    const chunks: Chunk[] = pieces.map((p, i) => ({
      id: `${docId}:${i}`,
      docId,
      source: file.name,
      page: p.page,
      content: p.content,
      embedding: embeddings[i],
    }))

    if (replace) clear()
    add(chunks)

    return NextResponse.json({
      ok: true,
      docId,
      source: file.name,
      chunks: chunks.length,
      pages: pages.length,
      documents: documents(),
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Upload failed'
    console.error('Upload error:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** List indexed documents. */
export async function GET() {
  return NextResponse.json({ ok: true, documents: documents() })
}

/** Clear one document (docId query param) or the whole store. */
export async function DELETE(req: NextRequest) {
  const docId = new URL(req.url).searchParams.get('docId')
  clear(docId ?? undefined)
  return NextResponse.json({ ok: true, documents: documents() })
}
