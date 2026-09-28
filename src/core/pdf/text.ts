import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfWord { str: string; x: number; y: number; width: number; height: number }
export interface PdfTextPage { index: number; width: number; height: number; words: PdfWord[] }

export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextPage[]> {
  // pdf.js transfers (detaches) the buffer it is given, so hand it a copy.
  const doc = await getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  try {
    const pages: PdfTextPage[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const words: PdfWord[] = [];
      for (const it of content.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
        if (!it.str || !it.str.trim() || !it.transform) continue;
        words.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width ?? 0, height: it.height || Math.abs(it.transform[3]) || 10 });
      }
      pages.push({ index: p - 1, width: page.view[2], height: page.view[3], words });
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
