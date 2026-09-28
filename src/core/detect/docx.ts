import JSZip from 'jszip';
import type { DateRole, DayMode, DocxAnchor, DocxCellAnchor, DocxTextAnchor, Placeholder } from '../model';
import { newId } from '../ids';
import { allParagraphs, bodyBlocks, cellIndex, cellText, scanBlocks, textOf, type Block, type BodyBlock, type CellLoc } from '../docx/xml';
import { findMarkers } from './markers';
import {
  CONTENT_RE, DAYN_RE, END_RE, OBJ_RE, SIGNATURE_RE, START_RE, SUPERVISOR_ONLY_RE, WEEKDAYS, WEEKDAY_RE, WEEK_RE,
  WEEK_START_RE, defaultMarkerBinding, isPlaceholderOrBlank, matchCoverKey,
} from './labels';

type Draft = Omit<Placeholder, 'id' | 'region'>;

export interface DocxContext { xml: string; paras: Block[]; paraTexts: string[]; cells: CellLoc[]; blocks: BodyBlock[]; tables: Block[] }
export interface DocxDetection { placeholders: Placeholder[]; unitStartBlock: number; warnings: string[]; ctx: DocxContext }

export async function readDocxXml(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('This file is not a Word document (word/document.xml is missing).');
  return f.async('string');
}

export function docxContext(xml: string): DocxContext {
  const paras = allParagraphs(xml);
  return { xml, paras, paraTexts: paras.map(p => textOf(p.full)), cells: cellIndex(xml), blocks: bodyBlocks(xml), tables: scanBlocks(xml, 'w:tbl') };
}

const cellKey = (c: { table: number[]; row: number; col: number }) => `${c.table.join('.')}:${c.row}:${c.col}`;

function innermostCell(ctx: DocxContext, offset: number): CellLoc | undefined {
  let best: CellLoc | undefined;
  for (const c of ctx.cells) if (offset >= c.start && offset < c.end && (!best || c.end - c.start < best.end - best.start)) best = c;
  return best;
}

export function anchorOffset(ctx: DocxContext, a: DocxAnchor): number {
  if (a.kind === 'docx-cell') return ctx.cells.find(c => cellKey(c) === cellKey(a))?.start ?? -1;
  return ctx.paras[a.paragraph]?.start ?? -1;
}

/** Two anchors are "the same spot" when they're in the same cell (or the same non-table paragraph). */
function spotKey(ctx: DocxContext, a: DocxAnchor): string {
  if (a.kind === 'docx-cell') return cellKey(a);
  const p = ctx.paras[a.paragraph];
  const c = p && innermostCell(ctx, p.start);
  return c ? cellKey(c) : `p${a.paragraph}`;
}

export function regionOfDocxAnchor(ctx: DocxContext, a: DocxAnchor, unitStartBlock: number): 'cover' | 'unit' {
  const off = anchorOffset(ctx, a);
  const start = ctx.blocks[unitStartBlock]?.start ?? 0;
  return off >= 0 && off < start ? 'cover' : 'unit';
}

export function blockIndexOfTable(ctx: DocxContext, ti: number): number | null {
  const t = ctx.tables[ti];
  if (!t) return null;
  const i = ctx.blocks.findIndex(b => t.start >= b.start && t.start < b.end);
  return i >= 0 ? i : null;
}

export function tableIndexAtBlock(ctx: DocxContext, bi: number): number | null {
  const b = ctx.blocks[bi];
  if (!b) return null;
  const i = ctx.tables.findIndex(t => t.start >= b.start && t.end <= b.end);
  return i >= 0 ? i : null;
}

export function detectDocx(xml: string): DocxDetection {
  const ctx = docxContext(xml);
  const warnings: string[] = [];
  const found = detectByLabels(ctx);
  let unitStartBlock = 0;
  if (found.unitTable == null) warnings.push('Couldn\'t find the part that repeats each period — use "Set repeating start" to choose it.');
  else if (!found.coverInUnit) unitStartBlock = blockIndexOfTable(ctx, found.unitTable) ?? 0;

  const labels = new Map<string, Draft>();
  for (const d of found.drafts) labels.set(spotKey(ctx, d.anchor as DocxAnchor), d); // later (more specific) wins
  const drafts = mergeDrafts(ctx, detectMarkers(ctx), [...labels.values()]);
  const placeholders = drafts.map(d => ({ ...d, id: newId('ph'), region: regionOfDocxAnchor(ctx, d.anchor as DocxAnchor, unitStartBlock) }));
  return { placeholders, unitStartBlock, warnings, ctx };
}

function detectMarkers(ctx: DocxContext): Draft[] {
  const out: Draft[] = [];
  ctx.paras.forEach((p, pi) => {
    const text = ctx.paraTexts[pi];
    for (const hit of findMarkers(text)) {
      const cell = innermostCell(ctx, p.start);
      const whole = !!cell && hit.text === text.trim() && cellText(ctx.xml.slice(cell.start, cell.end)) === text.trim();
      const anchor: DocxAnchor = whole
        ? { kind: 'docx-cell', table: cell!.table, row: cell!.row, col: cell!.col }
        : { kind: 'docx-text', paragraph: pi, start: hit.start, end: hit.end };
      out.push({ source: 'marker', label: hit.label, binding: defaultMarkerBinding(hit.label), anchor });
    }
  });
  return out;
}

/** A label and a marker at the same spot become one placeholder: label semantics, marker anchor. */
function mergeDrafts(ctx: DocxContext, markers: Draft[], labels: Draft[]): Draft[] {
  const used = new Set<Draft>();
  const out: Draft[] = [];
  for (const l of labels) {
    const k = spotKey(ctx, l.anchor as DocxAnchor);
    const m = markers.find(x => !used.has(x) && spotKey(ctx, x.anchor as DocxAnchor) === k);
    if (m) { used.add(m); out.push({ ...l, source: 'marker', anchor: m.anchor }); } else out.push(l);
  }
  for (const m of markers) if (!used.has(m)) out.push(m);
  const pos = (d: Draft) => anchorOffset(ctx, d.anchor as DocxAnchor) * 1000 + (d.anchor.kind === 'docx-text' ? d.anchor.start : 0);
  return out.sort((a, b) => pos(a) - pos(b));
}

interface TCell { start: number; end: number; full: string; text: string }
interface TRow { cells: TCell[] }

function tableModel(ctx: DocxContext): TRow[][] {
  return ctx.tables.map(t => scanBlocks(t.full, 'w:tr').map(r => ({
    cells: scanBlocks(r.full, 'w:tc').map(c => {
      const start = t.start + r.start + c.start;
      return { start, end: start + c.full.length, full: c.full, text: cellText(c.full) };
    }),
  })));
}

/** Port of v14 detectTemplate (index.html:1485-1682), producing placeholder drafts. */
function detectByLabels(ctx: DocxContext): { drafts: Draft[]; unitTable: number | null; coverInUnit: boolean } {
  const T = tableModel(ctx);
  const drafts: Draft[] = [];
  const clean = (s: string) => s.replace(/:\s*$/, '').trim();
  const cellA = (ti: number, row: number, col: number): DocxCellAnchor => ({ kind: 'docx-cell', table: [ti], row, col });
  const textA = (paragraph: number, start: number, end: number): DocxTextAnchor => ({ kind: 'docx-text', paragraph, start, end });
  const parasIn = (c: TCell) => ctx.paras.flatMap((p, i) => (p.start >= c.start && p.end <= c.end ? [i] : []));
  const endOf = (c: TCell, ti: number, ri: number, ci: number): DocxAnchor => {
    const pis = parasIn(c);
    const pi = [...pis].reverse().find(i => ctx.paraTexts[i].trim()) ?? pis[0];
    if (pi == null) return cellA(ti, ri, ci);
    const len = ctx.paraTexts[pi].length;
    return textA(pi, len, len);
  };
  // Where the value for a label cell goes: a blank 2nd paragraph, else a blank cell beside it, else after the label.
  const valueSlot = (ti: number, ri: number, ci: number): DocxAnchor => {
    const c = T[ti][ri].cells[ci];
    const pis = parasIn(c);
    const last = pis[pis.length - 1];
    if (pis.length > 1 && isPlaceholderOrBlank(ctx.paraTexts[last])) return textA(last, 0, ctx.paraTexts[last].length);
    const next = T[ti][ri].cells[ci + 1];
    if (next && isPlaceholderOrBlank(next.text)) return cellA(ti, ri, ci + 1);
    return endOf(c, ti, ri, ci);
  };
  // Answer area for a Shape A label row (v14 fillLabelArea): blank last cell, 2nd paragraph, row below, or after the label.
  const areaSlot = (ti: number, ri: number): DocxAnchor => {
    const cells = T[ti][ri].cells;
    const lastCi = cells.length - 1;
    const last = cells[lastCi];
    if (cells.length >= 2 && isPlaceholderOrBlank(last.text)) return cellA(ti, ri, lastCi);
    const pis = parasIn(last);
    if (pis.length > 1) return textA(pis[1], 0, ctx.paraTexts[pis[1]].length);
    const next = T[ti][ri + 1];
    if (next?.cells.length && isPlaceholderOrBlank(next.cells[next.cells.length - 1].text)) return cellA(ti, ri + 1, next.cells.length - 1);
    return endOf(last, ti, ri, lastCi);
  };

  // 1. Cover table: the first table where at least 2 labels are recognised.
  let coverTi = -1;
  for (let ti = 0; ti < T.length && coverTi < 0; ti++) {
    const fields: Draft[] = [];
    let matched = 0;
    T[ti].forEach((r, ri) => {
      const add = (label: string, col: number) => {
        const l = clean(label);
        if (!l || WEEK_RE.test(l) || WEEK_START_RE.test(l)) return;
        if (matchCoverKey(l)) matched++;
        fields.push({ source: 'label', label: l, binding: 'cover', anchor: cellA(ti, ri, col) });
      };
      const n = r.cells.length;
      if (n === 2) add(r.cells[0].text, 1);
      else if (n >= 4 && n % 2 === 0) for (let i = 0; i < n; i += 2) if (r.cells[i].text && isPlaceholderOrBlank(r.cells[i + 1].text)) add(r.cells[i].text, i + 1);
    });
    if (matched >= 2) { coverTi = ti; drafts.push(...fields); }
  }

  // 2. The week/month row marks the start of the repeating unit.
  let weekTi = -1;
  outer: for (let ti = 0; ti < T.length; ti++) {
    for (let ri = 0; ri < T[ti].length; ri++) {
      const cells = T[ti][ri].cells;
      if (cells.length < 2) continue;
      const texts = cells.map(c => c.text);
      const wI = texts.findIndex(x => WEEK_RE.test(x));
      if (wI < 0) continue;
      weekTi = ti;
      const date = (label: string, role: DateRole, anchor: DocxAnchor) =>
        drafts.push({ source: 'label', label: clean(label) || 'Date', binding: 'date', dateRole: role, anchor });
      if (WEEK_START_RE.test(texts[wI])) { date(texts[wI], 'start', valueSlot(ti, ri, wI)); break outer; }
      const sI = texts.findIndex(x => START_RE.test(x));
      const eI = texts.findIndex(x => END_RE.test(x));
      const twoCellRange = sI < 0 && eI < 0 && cells.length === 2;
      date(texts[wI], 'number', twoCellRange ? endOf(cells[wI], ti, ri, wI) : valueSlot(ti, ri, wI));
      if (sI >= 0) date(texts[sI], 'start', valueSlot(ti, ri, sI));
      if (eI >= 0) date(texts[eI], 'end', valueSlot(ti, ri, eI));
      if (twoCellRange) date('Period dates', 'range', cellA(ti, ri, wI === 0 ? 1 : 0));
      break outer;
    }
  }
  if (weekTi < 0) return { drafts, unitTable: null, coverInUnit: false };
  const coverInUnit = coverTi === weekTi;

  // 3. Shape A: Objective/Content rows inside the week table.
  const rows = T[weekTi];
  const first = (ri: number) => rows[ri].cells[0]?.text ?? '';
  const objRi = rows.findIndex((_, ri) => OBJ_RE.test(first(ri)));
  const conRi = rows.findIndex((_, ri) => ri !== objRi && CONTENT_RE.test(first(ri)));
  if (objRi >= 0 || conRi >= 0) {
    for (const ri of [objRi, conRi]) if (ri >= 0) drafts.push({ source: 'label', label: clean(first(ri)), binding: 'period', anchor: areaSlot(weekTi, ri) });
    return { drafts, unitTable: weekTi, coverInUnit };
  }

  // 4. Shape B: a day grid in one of the next two tables; every header column is a field.
  let dayTi = -1;
  for (let ti = weekTi + 1; ti < T.length && ti <= weekTi + 2; ti++) {
    const found: { ri: number; dayIndex: number; dayMode: DayMode; label: string }[] = [];
    T[ti].forEach((r, ri) => {
      const lbl = r.cells[0]?.text ?? '';
      if (!lbl) return;
      const m = lbl.match(WEEKDAY_RE);
      if (m) { found.push({ ri, dayIndex: WEEKDAYS.indexOf(m[1].toLowerCase()), dayMode: 'weekday', label: clean(lbl) }); return; }
      const n = lbl.match(DAYN_RE);
      if (n) found.push({ ri, dayIndex: Number(n[1]) - 1, dayMode: 'nth', label: clean(lbl) });
    });
    if (found.length < 3) continue;
    dayTi = ti;
    let columns: { ci: number; label: string }[] = [];
    let dateCi = -1;
    for (let hi = found[0].ri - 1; hi >= 0; hi--) {
      const texts = T[ti][hi].cells.map(c => c.text);
      if (!texts.slice(1).some(Boolean)) continue;
      texts.forEach((t, i) => {
        if (i === 0 || !t) return;
        if (/^date\s*:?$/i.test(t)) { dateCi = i; return; }
        columns.push({ ci: i, label: t });
      });
      break;
    }
    if (!columns.length) columns = [{ ci: 1, label: 'Activity' }];
    for (const d of found) {
      const n = T[ti][d.ri].cells.length;
      for (const c of columns) if (c.ci < n) drafts.push({ source: 'label', label: `${d.label} – ${c.label}`, binding: 'daily', dayIndex: d.dayIndex, dayMode: d.dayMode, anchor: cellA(ti, d.ri, c.ci) });
      if (dateCi >= 0 && dateCi < n) drafts.push({ source: 'label', label: `${d.label} – Date`, binding: 'date', dateRole: 'day', dayIndex: d.dayIndex, dayMode: d.dayMode, anchor: cellA(ti, d.ri, dateCi) });
    }
    break;
  }
  if (dayTi < 0) return { drafts, unitTable: weekTi, coverInUnit };

  // 5. After the grid: weekly questions (each followed by a blank answer) and supervisor signature spots.
  for (let ti = dayTi + 1; ti < T.length && ti <= dayTi + 3; ti++) {
    let any = false;
    T[ti].forEach((r, ri) => {
      if (!r.cells.length) return;
      r.cells.forEach((c, ci) => {
        if (SIGNATURE_RE.test(c.text) && c.text.split(/\s+/).length <= 6) {
          drafts.push({ source: 'label', label: clean(c.text.replace(/_{3,}.*/, '')) || 'Supervisor signature', binding: 'signature', anchor: valueSlot(ti, ri, ci) });
          any = true;
        }
      });
      const lastCi = r.cells.length - 1;
      const q = r.cells[lastCi].text;
      if (q.split(/\s+/).length < 4 || SUPERVISOR_ONLY_RE.test(q)) return;
      const next = T[ti][ri + 1];
      if (next?.cells.length && isPlaceholderOrBlank(next.cells[next.cells.length - 1].text)) {
        drafts.push({ source: 'label', label: q, binding: 'period', anchor: cellA(ti, ri + 1, next.cells.length - 1) });
        any = true;
        return;
      }
      const pis = parasIn(r.cells[lastCi]);
      const lp = pis[pis.length - 1];
      if (pis.length > 1 && isPlaceholderOrBlank(ctx.paraTexts[lp])) {
        drafts.push({ source: 'label', label: q, binding: 'period', anchor: textA(lp, 0, ctx.paraTexts[lp].length) });
        any = true;
      }
    });
    if (!any && !/remark|supervisor|signature/i.test(T[ti].map(r => r.cells.map(c => c.text).join(' ')).join(' '))) break;
  }
  return { drafts, unitTable: weekTi, coverInUnit };
}
