import { NextRequest } from 'next/server'
import { embed, getOpenAI, CHAT_MODEL } from '@/lib/openai'
import { size } from '@/lib/vector-store'
import { retrieve } from '@/lib/retrieval'
import { llmRerank } from '@/lib/reranker'
import { buildCitations, encodeEvent } from '@/lib/citations'

export const runtime = 'nodejs'
export const maxDuration = 60

const TOP_K = parseInt(process.env.TOP_K || '5', 10)

/**
 * Answer a question over the indexed documents.
 *
 * Pipeline: embed the question, run hybrid retrieval, rerank, then stream an
 * NDJSON response. The first event is the citation list (so the UI can render
 * sources and page highlights immediately); the rest are answer tokens; a final
 * done event closes the stream. Pass docIds to scope the question to a subset
 * of documents.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { question?: unknown; docIds?: unknown }
    const question = body.question
    if (!question || typeof question !== 'string') {
      return new Response('Missing question', { status: 400 })
    }
    const docIds = Array.isArray(body.docIds)
      ? body.docIds.filter((d): d is string => typeof d === 'string')
      : undefined

    if (size() === 0) {
      return new Response('No PDF indexed yet. Upload one first.', { status: 400 })
    }

    const [questionEmbedding] = await embed([question])
    const top = await retrieve({
      queryEmbedding: questionEmbedding,
      queryText: question,
      topK: TOP_K,
      docIds,
      rerank: llmRerank,
    })

    const citations = buildCitations(top)
    const context = top
      .map((c, i) => `[${i + 1}] (source: ${c.chunk.source}, page ${c.chunk.page})\n${c.chunk.content}`)
      .join('\n\n---\n\n')

    const completion = await getOpenAI().chat.completions.create({
      model: CHAT_MODEL,
      stream: true,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You answer questions strictly from the provided document passages. Each passage is numbered. Cite the passages you use inline with their number in square brackets, for example [1] or [2][3]. If the answer is not in the passages, say so plainly. Be concise.',
        },
        { role: 'user', content: `Passages:\n\n${context}\n\nQuestion: ${question}` },
      ],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(encodeEvent({ type: 'citations', citations })))
          for await (const part of completion) {
            const token = part.choices[0]?.delta?.content
            if (token) controller.enqueue(encoder.encode(encodeEvent({ type: 'token', value: token })))
          }
          controller.enqueue(encoder.encode(encodeEvent({ type: 'done' })))
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Stream failed'
          controller.enqueue(encoder.encode(encodeEvent({ type: 'error', message })))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Chat failed'
    console.error('Chat error:', e)
    return new Response(message, { status: 500 })
  }
}
