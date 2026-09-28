import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractPdfText } from '../../src/core/pdf/text';
import { detectPdf } from '../../src/core/detect/pdf';
import type { Placeholder, PdfAnchor } from '../../src/core/model';

const fixture = (f: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${f}`, import.meta.url)));
const debug = (phs: Placeholder[]) => phs.map(p => `${p.region} ${p.binding} ${p.label}`).join('\n');

describe('extractPdfText', () => {
  it('returns words with positions and leaves the input usable', async () => {
    const bytes = fixture('pmu.pdf');
    const pages = await extractPdfText(bytes);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0].words.length).toBeGreaterThan(10);
    expect(bytes.byteLength).toBeGreaterThan(0); // not detached
  });
});

describe('detectPdf: synthetic', () => {
  it('finds bracket markers with whiteout and flags image-only PDFs', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([400, 300]).drawText('Student: <student name>', { x: 40, y: 200, size: 12, font });
    const withText = detectPdf(await extractPdfText(await doc.save()));
    const m = withText.placeholders.find(p => p.label === 'student name')!;
    expect(m.source).toBe('marker');
    expect((m.anchor as PdfAnchor).whiteout).toBe(true);
    expect((m.anchor as PdfAnchor).x).toBeGreaterThan(80);

    const blank = await PDFDocument.create();
    blank.addPage([400, 300]);
    const none = detectPdf(await extractPdfText(await blank.save()));
    expect(none.placeholders).toEqual([]);
    expect(none.warnings.join(' ')).toMatch(/No text found/);
    expect(none.pageRoles).toEqual(['unit']);
  });
});

describe('detectPdf: real university templates', () => {
  it('PMU: Day 1–10 rows and 5 numbered questions', async () => {
    const r = detectPdf(await extractPdfText(fixture('pmu.pdf')));
    const daily = r.placeholders.filter(p => p.binding === 'daily');
    expect(daily, debug(r.placeholders)).toHaveLength(10);
    expect(daily.every(p => p.dayMode === 'nth')).toBe(true);
    expect(r.placeholders.filter(p => p.binding === 'period'), debug(r.placeholders)).toHaveLength(5);
    expect(r.pageRoles).toContain('unit');
  });
  it("Taylor's: weekday grid with three columns", async () => {
    const r = detectPdf(await extractPdfText(fixture('taylors.pdf')));
    const daily = r.placeholders.filter(p => p.binding === 'daily');
    expect(daily, debug(r.placeholders)).toHaveLength(15);
    expect(daily.every(p => p.dayMode === 'weekday')).toBe(true);
  });
  it('APU: at least one answer area', async () => {
    const r = detectPdf(await extractPdfText(fixture('apu.pdf')));
    expect(r.placeholders.filter(p => p.binding === 'period').length, debug(r.placeholders)).toBeGreaterThanOrEqual(1);
  });
});
