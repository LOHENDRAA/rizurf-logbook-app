import type { DateRole, PageRole, PdfAnchor, Placeholder } from '../model';
import type { PdfTextPage, PdfWord } from '../pdf/text';
import { newId } from '../ids';
import { findMarkers } from './markers';
import {
  BRACKET_ONLY_RE, CONTENT_RE, DAYN_RE, END_RE, LESSON_RE, OBJ_RE, QNUM_RE, SIGNATURE_RE, START_RE, SUPERVISOR_ONLY_RE,
  TASK_RE, TOOLS_RE, WEEKDAYS, WEEKDAY_RE, WEEK_RE, WEEK_START_RE, defaultMarkerBinding, matchCoverKey,
} from './labels';

type Draft = Omit<Placeholder, 'id' | 'region' | 'anchor'> & { anchor: PdfAnchor };
interface Line { y: number; words: PdfWord[] }
interface Seg { y: number; x0: number; x1: number; h: number; words: PdfWord[]; text: string }
interface PageDet {
  coverFields: { key: string | null; line: Line; text: string }[];
  matchedCoverCount: number;
  weekLine?: Line; dayLines: Line[]; objLine?: Line; contentLine?: Line; headerLine?: Line;
}
interface Pg extends PdfTextPage { lines: Line[]; det: PageDet }
export interface PdfDetection { placeholders: Placeholder[]; pageRoles: PageRole[]; warnings: string[] }

const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const hasSigBlank = (t: string) => /_{3,}/.test(t) || /\bsignature\b/i.test(t);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const box = (page: number, x: number, y: number, w: number, h: number): PdfAnchor => ({ kind: 'pdf', page, x, y, w: Math.max(4, w), h: Math.max(4, h) });
const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function detectPdf(pages: PdfTextPage[]): PdfDetection {
  const warnings: string[] = [];
  if (!pages.some(p => p.words.length)) warnings.push('No text found — place placeholders manually.');
  const P: Pg[] = pages.map(p => { const lines = groupLines(p.words); return { ...p, lines, det: detectPage(lines) }; });

  let labels: Draft[] = [];
  let unitPage: number | null = null;
  for (const pg of P) {
    const g = detectGeneric(pg, P);
    if (g) { labels = g.drafts; unitPage = g.unitPage; break; }
  }
  if (unitPage == null) {
    const k = detectKnown(P);
    if (k) { labels = k.drafts; unitPage = k.unitPage; }
  }
  if (unitPage == null && P.some(p => p.words.length)) warnings.push("Couldn't find the page that repeats each period — set it with the page menus.");

  const pageRoles: PageRole[] = pages.map((_, i) => (unitPage != null && i < unitPage ? 'cover' : 'unit'));
  const drafts = merge(P.flatMap(markerDrafts), labels);
  return {
    placeholders: drafts.map(d => ({ ...d, id: newId('ph'), region: pageRoles[d.anchor.page] === 'cover' ? 'cover' : 'unit' })),
    pageRoles,
    warnings,
  };
}

// ---- merging (spec 5.2 step 3, PDF variant) ----
const center = (a: PdfAnchor) => ({ x: a.x + a.w / 2, y: a.y + a.h / 2 });
const contains = (a: PdfAnchor, p: { x: number; y: number }) => p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h;
const sameSpot = (a: PdfAnchor, b: PdfAnchor) => a.page === b.page && (contains(a, center(b)) || contains(b, center(a)));

function merge(markers: Draft[], labels: Draft[]): Draft[] {
  const used = new Set<Draft>();
  const out: Draft[] = [];
  for (const l of labels) {
    const ms = markers.filter(m => !used.has(m) && sameSpot(m.anchor, l.anchor));
    if (!ms.length) { out.push(l); continue; }
    ms.forEach(m => used.add(m));
    const biggest = [l.anchor, ...ms.map(m => m.anchor)].reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    const whiteout = ms.some(m => m.anchor.whiteout);
    out.push({ ...l, source: 'marker', anchor: { ...biggest, ...(whiteout ? { whiteout: true } : {}) } });
  }
  for (const m of markers) if (!used.has(m)) out.push(m);
  return out.sort((a, b) => a.anchor.page - b.anchor.page || (b.anchor.y + b.anchor.h) - (a.anchor.y + a.anchor.h) || a.anchor.x - b.anchor.x);
}

function markerDrafts(pg: Pg): Draft[] {
  const out: Draft[] = [];
  for (const line of pg.lines) {
    // Rebuild the line's text with a map from each character back to its word, so markers split across items still get a box.
    let text = '';
    const map: { w: PdfWord; off: number }[] = [];
    line.words.forEach((w, i) => {
      if (i) { text += ' '; map.push({ w, off: 0 }); }
      for (let k = 0; k < w.str.length; k++) { text += w.str[k]; map.push({ w, off: k }); }
    });
    for (const hit of findMarkers(text)) {
      const a = map[hit.start];
      const b = map[hit.end - 1];
      const xAt = (m: { w: PdfWord; off: number }, after: boolean) => m.w.x + (m.w.str.length ? (m.w.width * (m.off + (after ? 1 : 0))) / m.w.str.length : 0);
      const x0 = xAt(a, false);
      const x1 = xAt(b, true);
      const h = Math.max(a.w.height, 8);
      const anchor = box(pg.index, x0, line.y - h * 0.25, Math.max(x1 - x0, 12), h * 1.3);
      out.push({ source: 'marker', label: hit.label, binding: defaultMarkerBinding(hit.label), anchor: hit.kind === 'bracket' ? { ...anchor, whiteout: true } : anchor });
    }
  }
  return out;
}

// ---- ports of v14 helpers ----
function groupLines(words: PdfWord[], tol = 2.5): Line[] {
  const lines: Line[] = [];
  for (const w of words) {
    let line = lines.find(l => Math.abs(l.y - w.y) <= tol);
    if (!line) { line = { y: w.y, words: [] }; lines.push(line); }
    line.words.push(w);
  }
  lines.forEach(l => l.words.sort((a, b) => a.x - b.x));
  return lines.sort((a, b) => b.y - a.y);
}
const lineText = (l: Line) => l.words.map(w => w.str).join(' ').replace(/\s+/g, ' ').trim();
const findLabelLine = (lines: Line[], re: RegExp, maxWords = 10) =>
  lines.find(l => { const t = lineText(l); return wordCount(t) <= maxWords && !hasSigBlank(t) && re.test(t); });

function detectPage(lines: Line[]): PageDet {
  const out: PageDet = { coverFields: [], matchedCoverCount: 0, dayLines: [] };
  for (const l of lines) {
    const t = lineText(l);
    if (wordCount(t) > 5 || hasSigBlank(t)) continue;
    const label = t.replace(/:\s*$/, '').trim();
    if (!label) continue;
    const key = matchCoverKey(label);
    if (key) out.matchedCoverCount++;
    out.coverFields.push({ key, line: l, text: t });
  }
  out.weekLine = lines.find(l => WEEK_RE.test(l.words[0]?.str ?? ''));
  out.dayLines = lines.filter(l => WEEKDAY_RE.test(l.words[0]?.str ?? ''));
  out.objLine = findLabelLine(lines, OBJ_RE, 25);
  out.contentLine = findLabelLine(lines, CONTENT_RE, 25);
  if (out.dayLines.length) {
    const firstY = out.dayLines[0].y;
    out.headerLine = lines.find(l => l.y > firstY && TASK_RE.test(lineText(l)) && wordCount(lineText(l)) <= 8);
  }
  return out;
}

function segments(lines: Line[], gap = 12): Seg[] {
  const segs: Seg[] = [];
  for (const l of lines) {
    let cur: Seg | null = null;
    const flush = () => {
      if (!cur) return;
      cur.text = cur.words.map(w => w.str).join(' ').replace(/\s+/g, ' ').replace(/\s+([:.,?;)])/g, '$1').trim();
      if (cur.text) segs.push(cur);
      cur = null;
    };
    for (const w of l.words) {
      if (cur && w.x - (cur as Seg).x1 > gap) flush();
      if (!cur) cur = { y: l.y, x0: w.x, x1: w.x + w.width, h: w.height, words: [w], text: '' };
      else { cur.words.push(w); cur.x1 = Math.max(cur.x1, w.x + w.width); cur.h = Math.max(cur.h, w.height); }
    }
    flush();
  }
  return segs;
}

/** Port of v14 pdfDetectGeneric (index.html:2209-2372): numbered/weekday day rows, header columns, numbered questions, cover labels. */
function detectGeneric(pg: Pg, pages: Pg[]): { drafts: Draft[]; unitPage: number } | null {
  const segs = segments(pg.lines);
  const dayN = segs.filter(s => DAYN_RE.test(s.text));
  const wkd = segs.filter(s => WEEKDAY_RE.test(s.text) && wordCount(s.text) <= 3);
  let rowsRaw: Seg[];
  let kind: 'dayN' | 'weekday';
  if (dayN.length >= 3) { rowsRaw = dayN; kind = 'dayN'; }
  else if (wkd.length >= 3 && !pg.det.headerLine) { rowsRaw = wkd; kind = 'weekday'; }
  else return null;

  const colX = median(rowsRaw.map(s => s.x0));
  const dayRowsS = rowsRaw.filter(s => Math.abs(s.x0 - colX) < 8).sort((a, b) => b.y - a.y);
  if (dayRowsS.length < 3) return null;
  const pitch = median(dayRowsS.slice(1).map((s, i) => dayRowsS[i].y - s.y));
  const h = median(dayRowsS.map(s => s.h)) || 11;
  const firstY = dayRowsS[0].y;
  const lastY = dayRowsS[dayRowsS.length - 1].y;
  const dayLabelX0 = Math.min(...dayRowsS.map(s => s.x0));
  const dayLabelX1 = Math.max(...dayRowsS.map(s => s.x1));

  // Header: the short lines stacked directly above the first day row.
  const headerSegs: Seg[] = [];
  let prevY = firstY;
  pg.lines.filter(l => l.y > firstY + 2).sort((a, b) => a.y - b.y).some(l => {
    if (l.y - prevY > pitch) return true;
    const ls = segs.filter(s => Math.abs(s.y - l.y) < 0.5);
    if (ls.some(s => wordCount(s.text) > 8)) return true;
    headerSegs.push(...ls);
    prevY = l.y;
    return false;
  });
  const headerTop = headerSegs.length ? Math.max(...headerSegs.map(s => s.y)) : firstY;
  const inDayCol = (s: Seg) => s.x1 > dayLabelX0 - 6 && s.x0 < dayLabelX1 + 24;
  const dayHead = headerSegs.filter(inDayCol);
  const dataHead: { x0: number; x1: number; parts: Seg[]; label: string }[] = [];
  headerSegs.filter(s => !inDayCol(s)).sort((a, b) => a.x0 - b.x0).forEach(s => {
    const m = dataHead.find(c => s.x0 < c.x1 && s.x1 > c.x0);
    if (m) { m.parts.push(s); m.x0 = Math.min(m.x0, s.x0); m.x1 = Math.max(m.x1, s.x1); }
    else dataHead.push({ x0: s.x0, x1: s.x1, parts: [s], label: '' });
  });
  dataHead.forEach(c => { c.label = c.parts.sort((a, b) => b.y - a.y).map(p => p.text).join(' '); });
  const pageRight = pg.width - 36;
  let dayColRight = dayLabelX1 + 14;
  if (dayHead.length) {
    const widest = dayHead.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a));
    const centered = 2 * ((widest.x0 + widest.x1) / 2) - (dayLabelX0 - 5);
    if (centered > dayLabelX1 + 4) dayColRight = centered;
  }
  if (dataHead.length) dayColRight = Math.min(dayColRight, dataHead[0].x0 - 4);
  let columns: { label: string; left: number; right: number }[];
  if (!dataHead.length) columns = [{ label: 'Activity', left: dayColRight, right: pageRight }];
  else {
    let left = dayColRight;
    columns = dataHead.map((c, i) => {
      const next = dataHead[i + 1];
      const leftAligned = c.x0 - left < 14;
      let right = leftAligned ? (next ? next.x0 - 6 : pageRight) : 2 * ((c.x0 + c.x1) / 2) - left;
      right = Math.min(right, next ? next.x0 - 2 : pg.width - 20);
      if (!next && !leftAligned) right = Math.max(right, Math.min(pageRight, c.x1 + 8));
      const col = { label: c.label, left, right };
      left = right;
      return col;
    });
  }

  const drafts: Draft[] = [];
  for (const s of dayRowsS) {
    const top = s.y + h * 1.2;
    const bottom = top - pitch;
    const dayIndex = kind === 'weekday' ? WEEKDAYS.indexOf(s.text.match(WEEKDAY_RE)![1].toLowerCase()) : Number(s.text.match(DAYN_RE)![1]) - 1;
    const dayMode = kind === 'weekday' ? 'weekday' as const : 'nth' as const;
    const rowLabel = s.text.replace(/:\s*$/, '');
    for (const c of columns) drafts.push({ source: 'label', label: `${rowLabel} – ${c.label}`, binding: 'daily', dayIndex, dayMode, anchor: box(pg.index, c.left + 2, bottom + 1, c.right - c.left - 4, top - bottom - 2) });
    drafts.push({ source: 'label', label: `${rowLabel} – Date`, binding: 'date', dateRole: 'day', dayIndex, dayMode, anchor: box(pg.index, s.x1 + 4, s.y - 2, Math.max(20, dayColRight - s.x1 - 8), 9) });
  }

  // Weekly questions between the grid and the signature line.
  const sig = segs.filter(s => s.y < lastY && SIGNATURE_RE.test(s.text)).sort((a, b) => b.y - a.y)[0];
  const floorY = sig ? sig.y + sig.h + 2 : 30;
  const zone = segs.filter(s => s.y < lastY - 4 && s.y > floorY);
  const nums = zone.filter(s => QNUM_RE.test(s.text));
  const numX1 = nums.length ? Math.max(...nums.map(n => n.x1)) : -Infinity;
  const texts = zone.filter(s => !QNUM_RE.test(s.text) && !/^\(.*\)\.?$/.test(s.text) && s.x0 > numX1 && s.h >= h * 0.8).sort((a, b) => b.y - a.y);
  const groups: { segs: Seg[]; topY: number; bottomY: number; x0: number; x1: number; h: number; label: string }[] = [];
  for (const s of texts) {
    const g = groups[groups.length - 1];
    if (g && g.bottomY - s.y <= s.h * 1.3 && Math.abs(s.x0 - g.x0) < 10) { g.segs.push(s); g.bottomY = s.y; g.x1 = Math.max(g.x1, s.x1); }
    else groups.push({ segs: [s], topY: s.y, bottomY: s.y, x0: s.x0, x1: s.x1, h: s.h, label: '' });
  }
  const qGroups = groups.filter(g => {
    const text = g.segs.map(s => s.text).join(' ');
    g.label = text;
    if (wordCount(text) < 3 || SUPERVISOR_ONLY_RE.test(text)) return false;
    if (nums.length) return nums.some(n => n.y >= g.bottomY - g.h && n.y <= g.topY + g.h * 0.6);
    return wordCount(text) >= 4 && (/\?/.test(text) || /^(what|how|why|describe|explain|list|state|discuss|reflect)/i.test(text));
  });
  const heights: number[] = [];
  const qs = qGroups.map((g, i) => {
    const top = g.bottomY - g.h * 0.25 - 0.5;
    const next = qGroups[i + 1];
    const bottom = next ? next.topY + next.h * 0.875 : null;
    if (bottom != null) heights.push(top - bottom);
    return { label: g.label, x0: g.x0, width: pageRight - g.x0, top, bottom };
  });
  const typical = heights.length ? median(heights) : h * 2.2;
  for (const q of qs) {
    const bottom = q.bottom ?? Math.max(floorY + 2, q.top - typical);
    if (q.top - bottom >= 6) drafts.push({ source: 'label', label: short(q.label), binding: 'period', anchor: box(pg.index, q.x0, bottom, q.width, q.top - bottom) });
  }
  // A signature line drawn with underscores is found by the marker pass instead (it merges by label).
  if (sig && !/_{3,}/.test(sig.text)) drafts.push({ source: 'label', label: sig.text.replace(/[:\s]+$/, ''), binding: 'signature', anchor: box(pg.index, sig.x1 + 6, sig.y - 2, Math.max(40, pageRight - sig.x1 - 6), sig.h + 4) });

  // Cover labels above the grid, including 2-line labels and side-by-side pairs.
  interface Cluster { x0: number; items: Lbl[]; pairedRight: number | null }
  interface Lbl { text: string; x0: number; x1: number; y: number; yTop: number; yBot: number; cluster?: Cluster; paired?: boolean }
  const above = segs.filter(s => s.y > headerTop + 2 && wordCount(s.text) <= 6).sort((a, b) => b.y - a.y);
  const used = new Set<Seg>();
  const lbls: Lbl[] = [];
  for (const s of above) {
    if (used.has(s)) continue;
    const parts = [s];
    let cur = s;
    while (!/:$/.test(cur.text)) {
      const c = cur;
      const nxt = above.find(o => !used.has(o) && !parts.includes(o) && Math.abs(o.x0 - c.x0) < 4 && c.y - o.y > 0 && c.y - o.y <= c.h * 1.4);
      if (!nxt) break;
      parts.push(nxt);
      cur = nxt;
    }
    const text = parts.map(p => p.text).join(' ');
    if (!/:$/.test(cur.text) && !matchCoverKey(text.replace(/:$/, ''))) continue;
    parts.forEach(p => used.add(p));
    lbls.push({ text, x0: s.x0, x1: Math.max(...parts.map(p => p.x1)), y: parts.reduce((a, p) => a + p.y, 0) / parts.length, yTop: s.y, yBot: cur.y });
  }
  const clusters: Cluster[] = [];
  for (const l of lbls) {
    let c = clusters.find(x => Math.abs(x.x0 - l.x0) < 8);
    if (!c) { c = { x0: l.x0, items: [], pairedRight: null }; clusters.push(c); }
    c.items.push(l);
    l.cluster = c;
  }
  clusters.sort((a, b) => a.x0 - b.x0);
  for (const l of lbls) l.paired = lbls.some(o => o.cluster !== l.cluster && o.yBot <= l.yTop + 3 && o.yTop >= l.yBot - 3);
  for (const c of clusters) { const pr = c.items.filter(l => l.paired); c.pairedRight = pr.length ? Math.max(...pr.map(l => l.x1)) : null; }
  const allRight = lbls.length ? Math.max(...lbls.map(l => l.x1)) : 0;
  const place = (l: Lbl) => {
    const x = clusters.length === 1 ? allRight + 22 : l.paired && l.cluster!.pairedRight != null ? l.cluster!.pairedRight + 22 : l.x1 + 34;
    const nextC = clusters.find(c => c.x0 > l.x0 + 8 && c.items.some(o => o.yBot <= l.yTop + 3 && o.yTop >= l.yBot - 3));
    return { x, y: l.y, w: Math.max(30, (nextC ? nextC.x0 - 10 : pageRight) - x) };
  };
  const coverHere: Draft[] = [];
  let matched = 0;
  for (const l of lbls) {
    const bare = l.text.replace(/:$/, '').trim();
    const p = place(l);
    const a = box(pg.index, p.x, p.y - 3, p.w, h + 4);
    const date = (role: DateRole) => drafts.push({ source: 'label', label: bare, binding: 'date', dateRole: role, anchor: a });
    if (WEEK_START_RE.test(bare) || START_RE.test(bare)) date('start');
    else if (END_RE.test(bare)) date('end');
    else if (WEEK_RE.test(bare)) date('number');
    else { if (matchCoverKey(bare)) matched++; coverHere.push({ source: 'label', label: bare, binding: 'cover', anchor: a }); }
  }
  if (matched) drafts.push(...coverHere);
  else {
    const cp = pages.filter(p => p !== pg).reduce<Pg | null>((best, p) => (p.det.matchedCoverCount > (best ? best.det.matchedCoverCount : 0) ? p : best), null);
    if (cp) drafts.push(...coverFieldsOf(cp));
  }
  return { drafts, unitPage: pg.index };
}

function coverFieldsOf(cp: Pg): Draft[] {
  const valueX = Math.max(...cp.det.coverFields.map(f => { const w = f.line.words[f.line.words.length - 1]; return w.x + w.width; })) + 22;
  return cp.det.coverFields.map(f => ({ source: 'label' as const, label: f.text.replace(/:\s*$/, '').trim(), binding: 'cover' as const, anchor: box(cp.index, valueX, f.line.y - 3, cp.width - 36 - valueX, 14) }));
}

/** Port of the known Shape A (APU) and Shape B (Taylor's) PDF layouts, v14 index.html:2388-2469. */
function detectKnown(P: Pg[]): { drafts: Draft[]; unitPage: number } | null {
  const weekPage = P.find(p => p.det.weekLine);
  if (!weekPage || !weekPage.det.weekLine) return null;
  const drafts: Draft[] = [];
  const coverPage = P.reduce<Pg | null>((best, p) => (p.det.matchedCoverCount > (best ? best.det.matchedCoverCount : 0) ? p : best), null);
  if (coverPage && coverPage.det.matchedCoverCount) drafts.push(...coverFieldsOf(coverPage));

  const ww = weekPage.det.weekLine.words;
  const fs = Math.round(ww[0]?.height || 11);
  const after = (w: PdfWord, role: DateRole) => drafts.push({ source: 'label', label: w.str.replace(/:\s*$/, ''), binding: 'date', dateRole: role, anchor: box(weekPage.index, w.x + w.width + 6, w.y - 3, 90, fs + 5) });
  const wn = ww.find(w => WEEK_RE.test(w.str));
  const sw = ww.find(w => START_RE.test(w.str));
  const ew = ww.find(w => END_RE.test(w.str));
  if (wn) after(wn, 'number');
  if (sw) after(sw, 'start');
  if (ew) after(ew, 'end');

  if (weekPage.det.dayLines.length >= 3) {
    const header = weekPage.det.headerLine?.words ?? [];
    const taskW = header.find(w => TASK_RE.test(w.str));
    const toolsW = header.find(w => TOOLS_RE.test(w.str));
    const lessonW = header.find(w => LESSON_RE.test(w.str));
    const right = weekPage.width - 40;
    const colXs = [taskW?.x ?? 150, toolsW?.x, lessonW?.x, right].filter((x): x is number => x != null).sort((a, b) => a - b);
    const colEnd = (x0: number) => colXs.find(x => x > x0) ?? right;
    const cols: { label: string; x0: number }[] = [{ label: taskW?.str ?? 'Task', x0: taskW?.x ?? 150 }];
    if (toolsW) cols.push({ label: toolsW.str, x0: toolsW.x });
    if (lessonW) cols.push({ label: lessonW.str, x0: lessonW.x });
    const dl = weekPage.det.dayLines;
    const rowH = dl.length > 1 ? Math.abs(dl[0].y - dl[1].y) : 24;
    for (const l of dl) {
      const name = l.words[0].str.toLowerCase().match(WEEKDAY_RE)![1];
      const dayIndex = WEEKDAYS.indexOf(name);
      const top = l.y + 9;
      const hgt = rowH - 4;
      for (const c of cols) drafts.push({ source: 'label', label: `${cap(name)} – ${c.label}`, binding: 'daily', dayIndex, dayMode: 'weekday', anchor: box(weekPage.index, c.x0 + 2, top - hgt, colEnd(c.x0) - c.x0 - 4, hgt) });
      const dateLine = weekPage.lines.find(ll => ll !== l && Math.abs(ll.y - (l.y - fs * 1.15)) < fs * 0.6 && ll.words.length === 1 && BRACKET_ONLY_RE.test(ll.words[0].str.trim()));
      if (dateLine) {
        const w = dateLine.words[0];
        drafts.push({ source: 'label', label: `${cap(name)} – Date`, binding: 'date', dateRole: 'day', dayIndex, dayMode: 'weekday', anchor: { ...box(weekPage.index, w.x, w.y - 3, w.width, fs + 5), whiteout: true } });
      }
    }
  } else {
    const obj = weekPage.det.objLine;
    const content = weekPage.det.contentLine;
    const absorb = (startY: number, maxGap = 16) => {
      let y = startY;
      weekPage.lines.filter(l => l.y < startY - 1).sort((a, b) => b.y - a.y).forEach(l => { if (y - l.y <= maxGap) y = l.y; });
      return y;
    };
    const nextLabelY = (afterY: number) => {
      const c = weekPage.lines.filter(l => l.y < afterY - 2 && wordCount(lineText(l)) <= 25 && (hasSigBlank(lineText(l)) || CONTENT_RE.test(lineText(l)))).map(l => l.y);
      return c.length ? Math.max(...c) : afterY - 300;
    };
    const area = (l: Line, bottom: number) => {
      const x0 = l.words[0].x;
      const top = absorb(l.y) - 4;
      drafts.push({ source: 'label', label: short(lineText(l)), binding: 'period', anchor: box(weekPage.index, x0, bottom, weekPage.width - x0 - 50, Math.max(10, top - bottom)) });
    };
    if (obj) area(obj, content ? absorb(content.y) + fs : nextLabelY(obj.y));
    if (content) area(content, nextLabelY(content.y));
  }
  return { drafts, unitPage: weekPage.index };
}
