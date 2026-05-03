import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'RAG-over-PDF',
  description: 'Upload a PDF, ask questions, get streaming answers grounded in the document.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
