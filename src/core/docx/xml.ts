export interface Block { start: number; end: number; full: string; selfClosing: boolean }
export interface BodyBlock extends Block { tag: string }
export interface CellLoc { table: number[]; row: number; col: number; start: number; end: number }

export const xmlEscape = (s: string): string =>
  s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const xmlUnescape = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Top-level blocks of one tag (nested ones of the same tag are inside them). Ported from v14 index.html:1379. */
export function scanBlocks(xml: string, tag: string): Block[] {
  const re = new RegExp(`<(\\/?)${tag}(\\s[^>]*?)?(\\/?)>`, 'g');
  const blocks: Block[] = [];
  let depth = 0;
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const closing = m[1] === '/';
    const selfClosing = m[3] === '/';
    if (selfClosing) {
      if (depth === 0) blocks.push({ start: m.index, end: m.index + m[0].length, full: m[0], selfClosing: true });
      continue;
    }
    if (!closing) { if (depth === 0) start = m.index; depth++; }
    else {
      depth--;
      if (depth === 0) blocks.push({ start, end: m.index + m[0].length, full: xml.slice(start, m.index + m[0].length), selfClosing: false });
    }
  }
  return blocks;
}

export function textOf(fragment: string): string {
  const m = fragment.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) ?? [];
  return xmlUnescape(m.map(t => t.replace(/^<w:t(?:\s[^>]*)?>/, '').replace(/<\/w:t>$/, '')).join(''));
}

export const cellText = (cellFull: string): string =>
  scanBlocks(cellFull, 'w:p').map(p => textOf(p.full)).join(' ').replace(/\s+/g, ' ').trim();

export function bodyRange(xml: string): { start: number; end: number } {
  const open = xml.match(/<w:body(?:\s[^>]*)?>/);
  const end = xml.lastIndexOf('</w:body>');
  if (!open || open.index == null || end < 0) throw new Error('This file has no Word document body.');
  return { start: open.index + open[0].length, end };
}

/** Direct children of <w:body> (paragraphs, tables, content controls, the final sectPr), in order. */
export function bodyBlocks(xml: string): BodyBlock[] {
  const { start, end } = bodyRange(xml);
  const re = /<(\/?)(w:[A-Za-z]+)(?:\s[^>]*?)?(\/?)>/g;
  re.lastIndex = start;
  const out: BodyBlock[] = [];
  let depth = 0;
  let cur: { tag: string; start: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && m.index < end) {
    const [tok, closing, tag, self] = m;
    if (self) {
      if (depth === 0) out.push({ tag, start: m.index, end: m.index + tok.length, full: tok, selfClosing: true });
      continue;
    }
    if (!closing) { if (depth === 0) cur = { tag, start: m.index }; depth++; }
    else {
      depth--;
      if (depth === 0 && cur) {
        const e = m.index + tok.length;
        out.push({ tag: cur.tag, start: cur.start, end: e, full: xml.slice(cur.start, e), selfClosing: false });
        cur = null;
      }
    }
  }
  return out;
}

/** Every <w:p> in document order, including ones inside tables. (Text boxes, which nest paragraphs, aren't supported.) */
export function allParagraphs(xml: string): Block[] {
  const re = /<w:p(?:\s[^>]*?)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  const out: Block[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ start: m.index, end: m.index + m[0].length, full: m[0], selfClosing: m[0].endsWith('/>') });
  return out;
}

function innerOf(b: Block): { full: string; offset: number } {
  const open = b.full.indexOf('>') + 1;
  const close = b.full.lastIndexOf('</');
  return { full: b.full.slice(open, close), offset: b.start + open };
}
const shift = (b: Block, by: number): Block => ({ ...b, start: b.start + by, end: b.end + by });

export function tableAt(xml: string, path: number[]): Block | undefined {
  const top = scanBlocks(xml, 'w:tbl')[path[0]];
  if (!top || path.length === 1) return top;
  if (path.length > 2) return undefined;
  const inner = innerOf(top);
  const n = scanBlocks(inner.full, 'w:tbl')[path[1]];
  return n && shift(n, inner.offset);
}

function collectCells(t: Block, path: number[], out: CellLoc[]) {
  scanBlocks(t.full, 'w:tr').forEach((r, ri) =>
    scanBlocks(r.full, 'w:tc').forEach((c, ci) =>
      out.push({ table: path, row: ri, col: ci, start: t.start + r.start + c.start, end: t.start + r.start + c.end })));
}

/** Every cell of every top-level table and of tables nested one level deep. */
export function cellIndex(xml: string): CellLoc[] {
  const out: CellLoc[] = [];
  scanBlocks(xml, 'w:tbl').forEach((t, ti) => {
    collectCells(t, [ti], out);
    const inner = innerOf(t);
    scanBlocks(inner.full, 'w:tbl').forEach((n, ni) => collectCells(shift(n, inner.offset), [ti, ni], out));
  });
  return out;
}

export function runXml(rPr: string, text: string): string {
  const parts = text.split(/\r?\n/).map(l => `<w:t xml:space="preserve">${xmlEscape(l)}</w:t>`).join('<w:br/>');
  return `<w:r>${rPr}${parts}</w:r>`;
}

/** Replaces a cell's paragraphs with one paragraph holding `text`, keeping the cell's
 *  tcPr and the first paragraph's pPr and first run's rPr, so it looks like the template. */
export function replaceCellContent(cellFull: string, text: string): string {
  const open = cellFull.match(/^<w:tc(?:\s[^>]*)?>/)?.[0] ?? '<w:tc>';
  const tcPr = cellFull.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>|<w:tcPr\/>/)?.[0] ?? '';
  const firstP = scanBlocks(cellFull, 'w:p')[0]?.full ?? '';
  const pPr = firstP.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  const run = firstP.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/)?.[0] ?? '';
  const rPr = run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
  return `${open}${tcPr}<w:p>${pPr}${runXml(rPr, text)}</w:p></w:tc>`;
}

function setRunText(rFull: string, content: string): string {
  const open = rFull.match(/^<w:r(?:\s[^>]*)?>/)?.[0] ?? '<w:r>';
  const rPr = rFull.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
  if (!content) return `${open}${rPr}</w:r>`;
  return runXml(rPr, content).replace(/^<w:r>/, open);
}

/**
 * Replaces characters [start, end) of a paragraph's joined run text with `text`.
 * The first touched run takes the new text (and keeps its formatting), and later
 * touched runs lose the replaced part. start === end inserts text there, with a
 * leading space when it's glued to a word.
 */
export function replaceTextRange(pFull: string, start: number, end: number, text: string): string {
  const p = pFull.endsWith('/>') ? `${pFull.slice(0, -2)}></w:p>` : pFull;
  const runs = scanBlocks(p, 'w:r');
  const full = runs.map(r => textOf(r.full)).join('');
  let value = text;
  if (start === end && start > 0 && !/\s$/.test(full.slice(0, start))) value = ` ${value}`;
  if (!runs.length) return `${p.slice(0, -'</w:p>'.length)}${runXml('', value)}</w:p>`;

  const edits: { block: Block; replacement: string }[] = [];
  let pos = 0;
  let placed = false;
  for (const r of runs) {
    const t = textOf(r.full);
    const rs = pos;
    const re = pos + t.length;
    pos = re;
    const touches = start === end ? !placed && start >= rs && start <= re : re > start && rs < end;
    if (!touches) continue;
    const before = t.slice(0, Math.max(0, start - rs));
    const after = end - rs < t.length ? t.slice(Math.max(0, end - rs)) : '';
    edits.push({ block: r, replacement: setRunText(r.full, before + (placed ? '' : value) + after) });
    placed = true;
  }
  if (!placed) {
    const last = runs[runs.length - 1];
    edits.push({ block: last, replacement: setRunText(last.full, textOf(last.full) + value) });
  }
  let out = p;
  for (const e of edits.sort((a, b) => b.block.start - a.block.start)) out = out.slice(0, e.block.start) + e.replacement + out.slice(e.block.end);
  return out;
}
