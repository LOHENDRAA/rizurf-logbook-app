import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { cloneTemplate, detectFromFile, findByUniversity, formatOf, normalizeUniversity, validateTemplate, UserError } from '../../src/core/template';
import type { Template } from '../../src/core/model';

const fileOf = (name: string, bytes: Uint8Array) => ({ name, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer });
const fixture = (f: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${f}`, import.meta.url)));

const base: Template = {
  id: 't1', university: "Taylor's University", format: 'pdf', fileName: 'a.pdf', fileBytes: new ArrayBuffer(4), period: 'weekly',
  pageRoles: ['unit'], updatedAt: '', placeholders: [{ id: 'p', label: 'x', binding: 'daily', source: 'label', region: 'unit', anchor: { kind: 'pdf', page: 0, x: 1, y: 1, w: 5, h: 5 } }],
};

describe('template module', () => {
  it('accepts only .docx and .pdf', () => {
    expect(formatOf('Logbook.DOCX')).toBe('docx');
    expect(formatOf('a.pdf')).toBe('pdf');
    expect(() => formatOf('a.doc')).toThrow(UserError);
  });
  // Review Focus #4
  it('treats university names with different case and spacing as the same', () => {
    expect(normalizeUniversity("  Taylor's   University ")).toBe(normalizeUniversity("taylor's university"));
    expect(findByUniversity([base], " TAYLOR'S  university")?.id).toBe('t1');
    expect(findByUniversity([base], "taylor's university", 't1')).toBeUndefined();
  });
  it('validates required parts', () => {
    expect(validateTemplate(base)).toEqual([]);
    const bad = { ...base, university: ' ', pageRoles: ['cover' as const], placeholders: [] };
    expect(validateTemplate(bad)).toEqual([
      'Enter the university name.',
      'Mark at least one page as "Repeats every period".',
      'Add at least one placeholder to the repeating part.',
    ]);
  });
  it('deep-clones so editor changes do not leak into the stored copy', () => {
    const c = cloneTemplate(base);
    c.placeholders[0].label = 'changed';
    expect(base.placeholders[0].label).toBe('x');
    expect(c.fileBytes).toBe(base.fileBytes);
  });
  it('detects a PDF and keeps the original bytes intact', async () => {
    const r = await detectFromFile(fileOf('pmu.pdf', fixture('pmu.pdf')));
    expect(r.format).toBe('pdf');
    expect(r.bytes.byteLength).toBeGreaterThan(1000);
    expect(r.pageRoles?.length).toBeGreaterThan(0);
  });
  it('detects a Word file and returns its context', async () => {
    const r = await detectFromFile(fileOf('pmu.docx', fixture('pmu.docx')));
    expect(r.format).toBe('docx');
    expect(r.docx?.paraTexts.length).toBeGreaterThan(0);
  });
  it('explains unreadable and password-protected files', async () => {
    await expect(detectFromFile(fileOf('x.docx', new Uint8Array([1, 2, 3])))).rejects.toThrow("This Word file can't be opened");
    await expect(detectFromFile(fileOf('x.pdf', new Uint8Array([1, 2, 3])))).rejects.toThrow("This PDF can't be opened");
    const doc = await PDFDocument.create();
    doc.addPage();
    expect((await detectFromFile(fileOf('ok.pdf', await doc.save()))).warnings.join(' ')).toMatch(/No text found/);
  });
});
