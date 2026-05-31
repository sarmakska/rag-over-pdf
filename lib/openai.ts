import OpenAI from 'openai'

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
export const CHAT_MODEL = process.env.CHAT_MODEL || 'gpt-4o-mini'

let client: OpenAI | null = null

/**
 * Lazily construct the OpenAI client. Building at module-load time crashes
 * `next build` when OPENAI_API_KEY is absent (for example in CI without
 * secrets), so the client is created on first use instead.
 */
export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
    client = new OpenAI({ apiKey })
  }
  return client
}

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  })
  return res.data.map((d) => d.embedding)
}
