import JSZip from 'jszip';
import type { Placeholder } from '../model';
import { allParagraphs, bodyBlocks, bodyRange, cellIndex, replaceCellContent, replaceTextRange } from '../docx/xml';
import { SIGNATURE_FONT, usesSignatureFont } from '../autofill';

export const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

/**
 * Writes values into the ORIGINAL document XML. Anchors are resolved against
 * that same XML, and edits are applied back-to-front so earlier offsets stay
 * valid. When a cell edit contains a text edit, the cell edit wins.
 */
export function applyValues(xml: string, placeholders: Placeholder[], values: Record<string, string>): string {
  const paras = allParagraphs(xml);
  const cells = cellIndex(xml);
  const cellEdits: { start: number; end: number; replacement: string }[] = [];
  const textByPara = new Map<number, { start: number; end: number; v: string; font?: string }[]>();

  for (const ph of placeholders) {
    const v = values[ph.id];
    if (!v || !v.trim()) continue;
    const a = ph.anchor;
    const font = usesSignatureFont(ph) ? SIGNATURE_FONT : undefined;
    if (a.kind === 'docx-cell') {
      const c = cells.find(x => x.table.join('.') === a.table.join('.') && x.row === a.row && x.col === a.col);
      if (c) cellEdits.push({ start: c.start, end: c.end, replacement: replaceCellContent(xml.slice(c.start, c.end), v, font) });
    } else if (a.kind === 'docx-text' && paras[a.paragraph]) {
      const list = textByPara.get(a.paragraph) ?? [];
      list.push({ start: a.start, end: a.end, v, font });
      textByPara.set(a.paragraph, list);
    }
  }

  const uniq = cellEdits.filter((e, i) => cellEdits.findIndex(o => o.start === e.start && o.end === e.end) === i);
  const outer = uniq.filter(e => !uniq.some(o => o !== e && o.start <= e.start && o.end >= e.end));
  const edits = [...outer];
  for (const [pi, list] of textByPara) {
    const p = paras[pi];
    if (outer.some(e => p.start >= e.start && p.end <= e.end)) continue;
    let full = p.full;
    for (const t of list.sort((a, b) => b.start - a.start)) full = replaceTextRange(full, t.start, t.end, t.v, t.font);
    edits.push({ start: p.start, end: p.end, replacement: full });
  }
  let out = xml;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  return out;
}

/** Cover blocks (filled once), then the unit blocks filled once per period, joined by page breaks, then the final sectPr. */
export async function fillDocx(
  bytes: ArrayBuffer | Uint8Array,
  template: { placeholders: Placeholder[]; unitStartBlock?: number },
  cover: Record<string, string>,
  periods: Record<string, string>[],
): Promise<Uint8Array> {
  if (!periods.length) throw new Error('Select at least one period to export.');
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('This file is not a Word document.');
  const xml = await file.async('string');
  const start = template.unitStartBlock ?? 0;
  const coverPhs = template.placeholders.filter(p => p.region === 'cover');
  const unitPhs = template.placeholders.filter(p => p.region === 'unit');
  const notSect = (b: { tag: string }) => b.tag !== 'w:sectPr';

  const coverBlocks = bodyBlocks(applyValues(xml, coverPhs, cover));
  const coverPart = coverBlocks.slice(0, start).filter(notSect).map(b => b.full).join('');
  const sect = coverBlocks.find(b => b.tag === 'w:sectPr')?.full ?? '';
  const units = periods.map(v => bodyBlocks(applyValues(xml, unitPhs, v)).slice(start).filter(notSect).map(b => b.full).join(''));

  const { start: bs, end: be } = bodyRange(xml);
  zip.file('word/document.xml', xml.slice(0, bs) + coverPart + units.join(PAGE_BREAK) + sect + xml.slice(be));
  return zip.generateAsync({ type: 'uint8array' });
}
