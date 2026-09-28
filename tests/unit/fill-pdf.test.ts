import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { fillPdf } from '../../src/core/fill/pdf';
import { layoutText, toWinAnsi, wrap, type FontLike } from '../../src/core/fill/pdfLayout';
import { extractPdfText } from '../../src/core/pdf/text';
import type { Placeholder } from '../../src/core/model';

const mono: FontLike = { widthOfTextAtSize: (t, s) => t.length * s * 0.5 };

describe('layout', () => {
  it('keeps 10pt when text fits', () => {
    expect(layoutText('short text', mono, { w: 200, h: 30 })).toMatchObject({ size: 10, truncated: false, lines: ['short text'] });
  });
  it('shrinks to fit, then truncates at 5.5pt', () => {
    const long = 'word '.repeat(40);
    const shrunk = layoutText(long, mono, { w: 200, h: 40 });
    expect(shrunk.size).toBeLessThan(10);
    expect(shrunk.truncated).toBe(false);
    const cut = layoutText(long.repeat(10), mono, { w: 100, h: 10 });
    expect(cut).toMatchObject({ size: 5.5, truncated: true });
  });
  it('hard-breaks a word longer than the box and keeps blank lines', () => {
    expect(wrap('abcdefghij', mono, 10, 25)).toEqual(['abcde', 'fghij']);
    expect(wrap('a\n\nb', mono, 10, 100)).toEqual(['a', '', 'b']);
  });
  // Review Focus #2 (unit level)
  it('maps text to what Helvetica can encode', () => {
    expect(toWinAnsi('Kerja 完成 ✅ “done” – ok…')).toBe('Kerja ?? ? "done" - ok...');
  });
});

async function template() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([300, 300]).drawText('COVER', { x: 20, y: 280, size: 10, font });
  doc.addPage([300, 300]).drawText('UNIT', { x: 20, y: 280, size: 10, font });
  return doc.save();
}
const ph = (id: string, page: number, extra: Partial<Placeholder> = {}): Placeholder => ({
  id, label: id, binding: 'free', source: 'manual', region: page === 0 ? 'cover' : 'unit',
  anchor: { kind: 'pdf', page, x: 20, y: 150, w: 250, h: 100 }, ...extra,
});
const words = (p: { words: { str: string }[] }) => p.words.map(w => w.str).join(' ');

describe('fillPdf', () => {
  it('copies cover pages once and unit pages per period, drawing values', async () => {
    const out = await fillPdf({
      templateBytes: await template(),
      template: { placeholders: [ph('c', 0), ph('u', 1)], pageRoles: ['cover', 'unit'] },
      cover: { c: 'Aina Rahman' },
      periods: [{ label: 'Week 1', values: { u: 'Did task one' } }, { label: 'Week 2', values: { u: 'Did task two' } }],
    });
    const pages = await extractPdfText(out);
    expect(pages).toHaveLength(3);
    expect(words(pages[0])).toContain('Aina Rahman');
    expect(words(pages[1])).toContain('Did task one');
    expect(words(pages[2])).toContain('Did task two');
  });
  it('skips ignored pages and appends overflow pages for text that cannot fit', async () => {
    const tiny = ph('u', 1, { anchor: { kind: 'pdf', page: 1, x: 20, y: 150, w: 40, h: 8 } });
    const out = await fillPdf({
      templateBytes: await template(),
      template: { placeholders: [tiny], pageRoles: ['ignore', 'unit'] },
      cover: {},
      periods: [{ label: 'Week 1', values: { u: 'A very long entry '.repeat(30) } }],
    });
    const pages = await extractPdfText(out);
    expect(pages).toHaveLength(2);
    expect(words(pages[1])).toContain('Continued entries');
    expect(words(pages[1])).toContain('Week 1 - u');
  });
  // Review Focus #2 (end to end)
  it('does not crash on non-Latin text or emoji', async () => {
    const out = await fillPdf({
      templateBytes: await template(),
      template: { placeholders: [ph('u', 1)], pageRoles: ['cover', 'unit'] },
      cover: {},
      periods: [{ label: 'W1', values: { u: 'Siti “Nur” 完成 ✅' } }],
    });
    expect(words((await extractPdfText(out))[1])).toContain('"Nur"');
  });
  // Review Focus #5
  it('ignores stale values and anchors on pages that no longer exist', async () => {
    const out = await fillPdf({
      templateBytes: await template(),
      template: { placeholders: [ph('u', 7)], pageRoles: ['cover', 'unit'] },
      cover: {},
      periods: [{ label: 'W1', values: { u: 'x', gone: 'y' } }],
    });
    expect(await extractPdfText(out)).toHaveLength(2);
  });
});
