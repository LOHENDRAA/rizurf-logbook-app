export interface MarkerHit { start: number; end: number; text: string; label: string; kind: 'bracket' | 'line' }

const BRACKET_RE = /\{\{\s*([^{}]+?)\s*\}\}|\[([^[\]]{1,80})\]|<([^<>]{1,80})>/g;
// Five dots, not three, so an ordinary "..." in prose isn't taken for a blank.
const LINE_RE = /_{3,}|\.{5,}|…{2,}/g;

export function findMarkers(text: string): MarkerHit[] {
  const hits: MarkerHit[] = [];
  for (const m of text.matchAll(BRACKET_RE)) {
    const inner = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!inner) continue; // "[ ]" checkboxes
    hits.push({ start: m.index!, end: m.index! + m[0].length, text: m[0], label: inner, kind: 'bracket' });
  }
  for (const m of text.matchAll(LINE_RE)) {
    const s = m.index!;
    const e = s + m[0].length;
    if (hits.some(h => s < h.end && e > h.start)) continue;
    const before = text.slice(0, s).split(/_{3,}|\.{5,}|…{2,}|[[\]<>{}]/).pop() ?? '';
    const label = before.replace(/[:\s]+$/, '').trim();
    hits.push({ start: s, end: e, text: m[0], label: label || 'Blank', kind: 'line' });
  }
  return hits.sort((a, b) => a.start - b.start);
}
