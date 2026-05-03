import OpenAI from 'openai'

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
export const CHAT_MODEL = process.env.CHAT_MODEL || 'gpt-4o-mini'

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  })
  return res.data.map((d) => d.embedding)
}
