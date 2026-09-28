import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { applyValues, fillDocx } from '../../src/core/fill/docx';
import { detectDocx, readDocxXml } from '../../src/core/detect/docx';
import type { Placeholder } from '../../src/core/model';

const P = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const BODY = P('Name: &lt;name&gt;  Date: &lt;date&gt;') +
  '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Monday</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>';
const XML = `<w:document><w:body>${BODY}<w:sectPr/></w:body></w:document>`;

async function makeDocx(xml: string) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'uint8array' });
}
const docXml = async (bytes: Uint8Array) => (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string');

const phs: Placeholder[] = [
  { id: 'name', label: 'name', binding: 'cover', source: 'marker', region: 'cover', anchor: { kind: 'docx-text', paragraph: 0, start: 6, end: 12 } },
  { id: 'date', label: 'date', binding: 'cover', source: 'marker', region: 'cover', anchor: { kind: 'docx-text', paragraph: 0, start: 20, end: 26 } },
  { id: 'mon', label: 'Monday', binding: 'daily', source: 'label', region: 'unit', anchor: { kind: 'docx-cell', table: [0], row: 0, col: 1 } },
];
const template = { placeholders: phs, unitStartBlock: 1 };

describe('fillDocx', () => {
  it('fills the cover once and clones the unit per period with page breaks', async () => {
    const out = await docXml(await fillDocx(await makeDocx(XML), template, { name: 'Aina', date: '01/09/2026' }, [{ mon: 'Week one' }, { mon: 'Week two' }]));
    expect(out).toContain('Name: Aina  Date: 01/09/2026');
    expect(out.match(/<w:tbl>/g)).toHaveLength(2);
    expect(out.match(/w:type="page"/g)).toHaveLength(1);
    expect(out.indexOf('Week one')).toBeLessThan(out.indexOf('Week two'));
    expect(out.trimEnd().endsWith('<w:sectPr/></w:body></w:document>')).toBe(true);
  });
  // Review Focus #1: XML-special characters and newlines.
  it('escapes XML characters and turns newlines into line breaks', async () => {
    const out = await docXml(await fillDocx(await makeDocx(XML), template, {}, [{ mon: 'R&D <api> "ok"\nsecond line' }]));
    expect(out).toContain('R&amp;D &lt;api&gt; "ok"</w:t><w:br/><w:t xml:space="preserve">second line');
    expect(() => new DOMParserLike(out)).not.toThrow();
  });
  // Review Focus #5: stale ids and anchors that no longer resolve.
  it('ignores values for unknown placeholders and anchors that point nowhere', () => {
    const stale: Placeholder[] = [
      { id: 'gone', label: 'x', binding: 'free', source: 'manual', region: 'unit', anchor: { kind: 'docx-cell', table: [9], row: 0, col: 0 } },
      { id: 'gone2', label: 'y', binding: 'free', source: 'manual', region: 'unit', anchor: { kind: 'docx-text', paragraph: 99, start: 0, end: 0 } },
    ];
    expect(applyValues(XML, stale, { gone: 'a', gone2: 'b', never: 'c' })).toBe(XML);
  });
  it('refuses an empty selection', async () => {
    await expect(fillDocx(await makeDocx(XML), template, {}, [])).rejects.toThrow('Select at least one period');
  });
  it("round-trips a real template (Taylor's)", async () => {
    const bytes = new Uint8Array(readFileSync(new URL('../fixtures/taylors.docx', import.meta.url)));
    const det = detectDocx(await readDocxXml(bytes));
    const values = Object.fromEntries(det.placeholders.filter(p => p.binding === 'daily').map((p, i) => [p.id, `MARK-${i}`]));
    const out = await docXml(await fillDocx(bytes, det, {}, [values]));
    expect(out).toContain('MARK-0');
    expect(out).toContain('MARK-14');
  });
});

/** Minimal well-formedness check: every opened w: element is closed in order. */
class DOMParserLike {
  constructor(xml: string) {
    const stack: string[] = [];
    for (const m of xml.matchAll(/<(\/?)(w:[A-Za-z]+)[^>]*?(\/?)>/g)) {
      if (m[3]) continue;
      if (!m[1]) stack.push(m[2]);
      else if (stack.pop() !== m[2]) throw new Error(`Mismatched </${m[2]}>`);
    }
    if (stack.length) throw new Error(`Unclosed ${stack.join(',')}`);
  }
}

describe('fillDocx: supervisor sign-off', () => {
  it('writes the approving supervisor name and approval date into every sign-off spot', async () => {
    const { resolveValues } = await import('../../src/core/autofill');
    const bytes = new Uint8Array(readFileSync(new URL('../../public/demo/taylors.docx', import.meta.url)));
    const det = detectDocx(await readDocxXml(bytes));
    const approval = { id: 'a', studentId: 's', periodKey: 'w:x', action: 'approve' as const, by: 'Supervisor', signature: 'Nur Aziz', at: new Date(2026, 8, 18, 10).toISOString() };
    const values = resolveValues(det.placeholders, {}, {}, approval);
    const out = await docXml(await fillDocx(bytes, det, values, [values]));
    expect(out.match(/Nur Aziz/g)?.length).toBeGreaterThanOrEqual(2); // name + signature
    expect(out).toContain('18/09/2026');
  });
});

describe('fillDocx: signature font', () => {
  it('writes only the signature in Vladimir Script; the printed name and date keep the template font', async () => {
    const { resolveValues } = await import('../../src/core/autofill');
    const bytes = new Uint8Array(readFileSync(new URL('../../public/demo/taylors.docx', import.meta.url)));
    const det = detectDocx(await readDocxXml(bytes));
    const approval = { id: 'a', studentId: 's', periodKey: 'w:x', action: 'approve' as const, by: 'Supervisor', signature: 'Nur Aziz', at: new Date(2026, 8, 18, 10).toISOString() };
    const values = resolveValues(det.placeholders, {}, {}, approval);
    const out = await docXml(await fillDocx(bytes, det, values, [values]));
    const runs = out.match(/<w:r>(?:(?!<\/w:r>)[\s\S])*Nur Aziz[\s\S]*?<\/w:r>/g) ?? [];
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs.filter(r => r.includes('w:ascii="Vladimir Script"'))).toHaveLength(1); // signature yes, "Name:" no
    const dateRun = out.match(/<w:r>(?:(?!<\/w:r>)[\s\S])*18\/09\/2026[\s\S]*?<\/w:r>/)?.[0] ?? '';
    expect(dateRun).not.toContain('Vladimir Script');
  });
});
