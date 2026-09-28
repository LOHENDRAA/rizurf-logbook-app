import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { PageRole, PdfAnchor, Placeholder } from '../model';
import { boxLayout, toWinAnsi, wrap } from './pdfLayout';

let helvetica: Promise<PDFFont> | null = null;
/** A Helvetica instance for measuring text in the live preview (same metrics as the export). */
export function getHelvetica(): Promise<PDFFont> {
  helvetica ??= PDFDocument.create().then(d => d.embedFont(StandardFonts.Helvetica));
  return helvetica;
}

export interface PdfFillInput {
  templateBytes: Uint8Array;
  template: { placeholders: Placeholder[]; pageRoles?: PageRole[] };
  cover: Record<string, string>;
  periods: { label: string; values: Record<string, string> }[];
}
interface Overflow { heading: string; text: string }

export async function fillPdf(input: PdfFillInput): Promise<Uint8Array> {
  if (!input.periods.length) throw new Error('Select at least one period to export.');
  const src = await PDFDocument.load(input.templateBytes);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const n = src.getPageCount();
  const roles: PageRole[] = Array.from({ length: n }, (_, i) => input.template.pageRoles?.[i] ?? 'unit');
  const on = (i: number) => input.template.placeholders.filter(p => p.anchor.kind === 'pdf' && p.anchor.page === i);
  const overflow: Overflow[] = [];

  const addFilled = async (i: number, values: Record<string, string>, heading: string) => {
    const [page] = await out.copyPages(src, [i]);
    out.addPage(page);
    for (const ph of on(i)) drawValue(page, ph, values[ph.id], font, heading, overflow);
  };
  for (let i = 0; i < n; i++) if (roles[i] === 'cover') await addFilled(i, input.cover, 'Cover');
  for (const p of input.periods) for (let i = 0; i < n; i++) if (roles[i] === 'unit') await addFilled(i, p.values, p.label);

  if (overflow.length) {
    const { width, height } = src.getPage(0).getSize();
    appendOverflow(out, font, bold, overflow, width, height);
  }
  return out.save();
}

function drawValue(page: PDFPage, ph: Placeholder, value: string | undefined, font: PDFFont, heading: string, overflow: Overflow[]) {
  if (!value?.trim()) return;
  const a = ph.anchor as PdfAnchor;
  if (a.whiteout) page.drawRectangle({ x: a.x - 1, y: a.y - 1, width: a.w + 2, height: a.h + 2, color: rgb(1, 1, 1) });
  const text = toWinAnsi(value);
  const lay = boxLayout(text, font, a);
  let y = a.y + a.h - lay.size;
  for (const line of lay.lines) {
    if (line) page.drawText(line, { x: a.x + 1, y, size: lay.size, font });
    y -= lay.lineHeight;
  }
  if (lay.truncated) overflow.push({ heading: `${heading} - ${ph.label}`, text });
}

/**
 * Ported from v14 appendPdfOverflowPages (index.html:2608): nothing the intern wrote is dropped.
 * Uses a 36pt (0.5in) margin, deliberately smaller than v14's 50pt, so a long entry still fits
 * on one continuation page even when the template's pages are small.
 */
function appendOverflow(doc: PDFDocument, font: PDFFont, bold: PDFFont, items: Overflow[], pw: number, ph: number) {
  const margin = 36;
  const width = pw - margin * 2;
  let page = doc.addPage([pw, ph]);
  let y = ph - margin;
  const ensure = (needed: number) => { if (y - needed < margin) { page = doc.addPage([pw, ph]); y = ph - margin; } };
  page.drawText('Continued entries', { x: margin, y, size: 13, font: bold });
  y -= 20;
  for (const l of wrap('These entries were too long for their box on the form. The full text is below.', font, 9, width)) {
    page.drawText(l, { x: margin, y, size: 9, font });
    y -= 12;
  }
  y -= 8;
  for (const it of items) {
    for (const l of wrap(toWinAnsi(it.heading), bold, 10, width)) { ensure(13); page.drawText(l, { x: margin, y, size: 10, font: bold }); y -= 13; }
    for (const l of wrap(it.text, font, 10, width)) { ensure(13); if (l) page.drawText(l, { x: margin, y, size: 10, font }); y -= 13; }
    y -= 10;
  }
}
