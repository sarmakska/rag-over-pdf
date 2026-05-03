import { NextRequest } from 'next/server'
import { embed, openai, CHAT_MODEL } from '@/lib/openai'
import { search, size } from '@/lib/vector-store'

export const runtime = 'nodejs'
export const maxDuration = 60

const TOP_K = parseInt(process.env.TOP_K || '5', 10)

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json()
    if (!question || typeof question !== 'string') {
      return new Response('Missing question', { status: 400 })
    }
    if (size() === 0) {
      return new Response('No PDF indexed yet. Upload one first.', { status: 400 })
    }

    const [questionEmbedding] = await embed([question])
    const topChunks = search(questionEmbedding, TOP_K)

    const context = topChunks
      .map((c, i) => `[Chunk ${i + 1}]\n${c.content}`)
      .join('\n\n---\n\n')

    const stream = await openai.chat.completions.create({
      model: CHAT_MODEL,
      stream: true,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `You answer questions strictly from the provided document chunks. If the answer is not in the chunks, say so plainly. Be concise. Quote short passages when useful.`,
        },
        {
          role: 'user',
          content: `Document chunks:\n\n${context}\n\nQuestion: ${question}`,
        },
      ],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const part of stream) {
          const token = part.choices[0]?.delta?.content
          if (token) controller.enqueue(encoder.encode(token))
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (e: any) {
    console.error('Chat error:', e)
    return new Response(e?.message || 'Chat failed', { status: 500 })
  }
}
