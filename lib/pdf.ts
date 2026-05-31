/**
 * PDF text extraction with page boundaries.
 *
 * pdf-parse exposes a pagerender hook that fires once per page. We use it to
 * collect text page by page rather than as one flat blob, which is what lets
 * the chunker attach a real page number to every chunk and the UI render
 * page-level highlights.
 */

import pdfParse from 'pdf-parse'

interface PdfTextContentItem {
  str: string
}

interface PdfPage {
  getTextContent(): Promise<{ items: PdfTextContentItem[] }>
}

export interface ParsedPdf {
  /** Page text in reading order. */
  pages: string[]
  /** Convenience: every page joined with a single space. */
  text: string
}

export async function parsePdf(buf: Buffer): Promise<ParsedPdf> {
  const pages: string[] = []

  await pdfParse(buf, {
    // Called once per page; we capture each page's text in order.
    pagerender: async (pageData: PdfPage) => {
      const content = await pageData.getTextContent()
      const text = content.items.map((it) => it.str).join(' ')
      pages.push(text)
      return text
    },
  })

  const cleaned = pages.map((p) => p.replace(/\s+/g, ' ').trim())
  return { pages: cleaned, text: cleaned.join(' ').trim() }
}
