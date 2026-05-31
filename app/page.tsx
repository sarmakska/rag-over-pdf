'use client'

import { useEffect, useState, useRef, FormEvent } from 'react'
import { parseEvents, type Citation } from '@/lib/citations'

interface DocumentSummary {
  docId: string
  source: string
  chunks: number
  pages: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}

export default function Home() {
  const [docs, setDocs] = useState<DocumentSummary[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/upload')
      .then((r) => r.json())
      .then((d) => setDocs(d.documents ?? []))
      .catch(() => {})
  }, [])

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
      setDocs(data.documents)
      if (fileRef.current) fileRef.current.value = ''
    } else {
      alert(`Upload failed: ${data.error}`)
    }
  }

  async function removeDoc(docId: string) {
    const res = await fetch(`/api/upload?docId=${encodeURIComponent(docId)}`, { method: 'DELETE' })
    const data = await res.json()
    setDocs(data.documents ?? [])
    setSelected((s) => s.filter((d) => d !== docId))
  }

  function toggleSelect(docId: string) {
    setSelected((s) => (s.includes(docId) ? s.filter((d) => d !== docId) : [...s, docId]))
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
      body: JSON.stringify({ question, docIds: selected.length ? selected : undefined }),
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
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const { events, rest } = parseEvents(buffer)
      buffer = rest
      for (const ev of events) {
        if (ev.type === 'citations') {
          setMessages((m) => {
            const copy = [...m]
            copy[copy.length - 1] = { ...copy[copy.length - 1], citations: ev.citations }
            return copy
          })
        } else if (ev.type === 'token') {
          setMessages((m) => {
            const copy = [...m]
            copy[copy.length - 1] = {
              ...copy[copy.length - 1],
              content: copy[copy.length - 1].content + ev.value,
            }
            return copy
          })
        } else if (ev.type === 'error') {
          setMessages((m) => {
            const copy = [...m]
            copy[copy.length - 1].content += `\n(Error: ${ev.message})`
            return copy
          })
        }
      }
    }
    setStreaming(false)
  }

  const hasDocs = docs.length > 0

  return (
    <main className="min-h-screen px-4 py-12 max-w-3xl mx-auto">
      <header className="mb-10">
        <h1 className="text-3xl font-bold mb-2">RAG-over-PDF</h1>
        <p className="text-zinc-400 text-sm">
          Upload PDFs. Ask questions across them. Get streaming answers with page-level citations.
        </p>
      </header>

      <form onSubmit={onUpload} className="border border-white/10 rounded-2xl p-6 bg-white/[0.02] mb-6">
        <label className="block">
          <span className="block text-sm text-zinc-400 mb-3">Add a PDF (under ~10MB works best)</span>
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
          className="mt-4 w-full px-4 py-3 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-medium transition-colors"
        >
          {uploading ? 'Indexing PDF...' : 'Upload and index'}
        </button>
      </form>

      {hasDocs && (
        <div className="border border-white/10 rounded-xl p-4 bg-white/[0.02] mb-6 text-sm">
          <div className="text-zinc-500 mb-2">
            Indexed documents. Tick to scope a question, or leave all unticked to search everything.
          </div>
          <ul className="space-y-1">
            {docs.map((d) => (
              <li key={d.docId} className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(d.docId)}
                    onChange={() => toggleSelect(d.docId)}
                    className="accent-violet-500"
                  />
                  <span className="font-medium">{d.source}</span>
                  <span className="text-zinc-500">
                    ({d.chunks} chunks, {d.pages} pages)
                  </span>
                </label>
                <button
                  onClick={() => removeDoc(d.docId)}
                  className="text-zinc-500 hover:text-white text-xs"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasDocs && (
        <div className="space-y-6">
          <div className="space-y-5">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <div
                  className={
                    m.role === 'user'
                      ? 'inline-block max-w-[85%] px-4 py-2 rounded-2xl bg-violet-500 text-white text-sm'
                      : 'inline-block max-w-[85%] px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/10 text-sm whitespace-pre-wrap text-left'
                  }
                >
                  {m.content ||
                    (streaming && i === messages.length - 1 ? (
                      <span className="text-zinc-500">Retrieving and reranking...</span>
                    ) : (
                      ''
                    ))}
                </div>
                {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                  <div className="mt-2 space-y-1 text-left">
                    <div className="text-xs text-zinc-500">Sources</div>
                    {m.citations.map((c) => (
                      <details
                        key={c.chunkId}
                        className="text-xs border border-white/10 rounded-lg px-3 py-2 bg-white/[0.02]"
                      >
                        <summary className="cursor-pointer text-zinc-300">
                          <span className="text-violet-400 font-medium">[{c.marker}]</span> {c.source}
                          <span className="text-zinc-500"> page {c.page}</span>
                        </summary>
                        <p className="mt-2 text-zinc-400">{c.snippet}</p>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={onAsk} className="sticky bottom-4">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your documents..."
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
        Open source, MIT.{' '}
        <a href="https://github.com/sarmakska/rag-over-pdf" className="hover:text-zinc-400">
          GitHub
        </a>{' '}
        built by{' '}
        <a href="https://sarmalinux.com" className="hover:text-zinc-400">
          Sarma Linux
        </a>
      </footer>
    </main>
  )
}
