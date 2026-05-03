'use client'

import { useState, useRef, FormEvent } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function Home() {
  const [uploaded, setUploaded] = useState(false)
  const [chunkCount, setChunkCount] = useState(0)
  const [filename, setFilename] = useState('')
  const [uploading, setUploading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    setUploading(false)
    if (data.ok) {
      setUploaded(true)
      setChunkCount(data.chunks)
      setFilename(file.name)
    } else {
      alert(`Upload failed: ${data.error}`)
    }
  }

  async function onAsk(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!input.trim() || streaming) return
    const question = input.trim()
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: question }, { role: 'assistant', content: '' }])
    setStreaming(true)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    })

    if (!res.ok || !res.body) {
      setMessages((m) => {
        const copy = [...m]
        copy[copy.length - 1].content = '(Error from server)'
        return copy
      })
      setStreaming(false)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      setMessages((m) => {
        const copy = [...m]
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: copy[copy.length - 1].content + chunk,
        }
        return copy
      })
    }
    setStreaming(false)
  }

  return (
    <main className="min-h-screen px-4 py-12 max-w-3xl mx-auto">
      <header className="mb-10">
        <h1 className="text-3xl font-bold mb-2">RAG-over-PDF</h1>
        <p className="text-zinc-400 text-sm">
          Upload a PDF. Ask questions. Get streaming answers grounded in the document.
        </p>
      </header>

      {!uploaded ? (
        <form onSubmit={onUpload} className="border border-white/10 rounded-2xl p-8 bg-white/[0.02]">
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-3">Pick a PDF (under ~10MB works best)</span>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              required
              className="block w-full text-sm text-zinc-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-violet-500 file:text-white file:font-medium hover:file:bg-violet-400 cursor-pointer"
            />
          </label>
          <button
            type="submit"
            disabled={uploading}
            className="mt-6 w-full px-4 py-3 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-medium transition-colors"
          >
            {uploading ? 'Indexing PDF...' : 'Upload and index'}
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="border border-white/10 rounded-xl px-4 py-3 bg-white/[0.02] flex items-center justify-between text-sm">
            <span className="text-zinc-300">
              <span className="text-zinc-500">Indexed:</span>{' '}
              <span className="font-medium">{filename}</span>
              <span className="text-zinc-500"> ({chunkCount} chunks)</span>
            </span>
            <button
              onClick={async () => {
                await fetch('/api/upload', { method: 'DELETE' })
                setUploaded(false)
                setMessages([])
              }}
              className="text-zinc-400 hover:text-white text-xs"
            >
              Reset
            </button>
          </div>

          <div className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <div
                  className={
                    m.role === 'user'
                      ? 'inline-block max-w-[85%] px-4 py-2 rounded-2xl bg-violet-500 text-white text-sm'
                      : 'inline-block max-w-[85%] px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/10 text-sm whitespace-pre-wrap'
                  }
                >
                  {m.content || (streaming && i === messages.length - 1 ? <span className="text-zinc-500">Thinking…</span> : '')}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={onAsk} className="sticky bottom-4">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about the PDF…"
                disabled={streaming}
                className="flex-1 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 focus:border-violet-400 outline-none text-sm"
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                className="px-5 py-3 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-medium text-sm transition-colors"
              >
                Ask
              </button>
            </div>
          </form>
        </div>
      )}

      <footer className="mt-20 text-xs text-zinc-600 text-center">
        Open source · MIT · <a href="https://github.com/sarmakska/rag-over-pdf" className="hover:text-zinc-400">GitHub</a> · built by <a href="https://sarmalinux.com" className="hover:text-zinc-400">Sarma Linux</a>
      </footer>
    </main>
  )
}
