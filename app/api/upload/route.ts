import { NextRequest, NextResponse } from 'next/server'
import pdfParse from 'pdf-parse'
import { embed } from '@/lib/openai'
import { add, clear } from '@/lib/vector-store'
import { chunk } from '@/lib/chunker'

export const runtime = 'nodejs'
export const maxDuration = 60

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '1000', 10)
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP || '200', 10)

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })
    }
    const buf = Buffer.from(await file.arrayBuffer())
    const parsed = await pdfParse(buf)
    const text = parsed.text.replace(/\s+/g, ' ').trim()
    if (!text) {
      return NextResponse.json({ ok: false, error: 'PDF has no extractable text' }, { status: 400 })
    }

    const chunks = chunk(text, CHUNK_SIZE, CHUNK_OVERLAP)
    const embeddings = await embed(chunks)

    clear()
    add(
      chunks.map((content, i) => ({
        content,
        embedding: embeddings[i],
        source: file.name,
      })),
    )

    return NextResponse.json({ ok: true, chunks: chunks.length, source: file.name })
  } catch (e: any) {
    console.error('Upload error:', e)
    return NextResponse.json({ ok: false, error: e?.message || 'Upload failed' }, { status: 500 })
  }
}

export async function DELETE() {
  clear()
  return NextResponse.json({ ok: true })
}
