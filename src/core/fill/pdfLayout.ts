import type { PdfAnchor } from '../model';

export interface FontLike { widthOfTextAtSize(text: string, size: number): number }
export interface Layout { size: number; lines: string[]; truncated: boolean; lineHeight: number }

export const MAX_SIZE = 10;
export const MIN_SIZE = 5.5;
export const LINE_GAP = 1.2;

function breakWord(word: string, font: FontLike, size: number, width: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= width) return [word];
  const parts: string[] = [];
  let cur = '';
  for (const ch of word) {
    if (cur && font.widthOfTextAtSize(cur + ch, size) > width) { parts.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

export function wrap(text: string, font: FontLike, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (!para.trim()) { out.push(''); continue; }
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      for (const piece of breakWord(word, font, size, width)) {
        const trial = cur ? `${cur} ${piece}` : piece;
        if (cur && font.widthOfTextAtSize(trial, size) > width) { out.push(cur); cur = piece; } else cur = trial;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Largest size from 10pt down to 5.5pt (0.5pt steps) at which the text fits; below that it's truncated. */
export function layoutText(text: string, font: FontLike, box: { w: number; h: number }): Layout {
  for (let k = 0; ; k++) {
    const size = MAX_SIZE - k * 0.5;
    const lineHeight = size * LINE_GAP;
    const lines = wrap(text, font, size, box.w);
    if (lines.length * lineHeight <= box.h + 0.01) return { size, lines, truncated: false, lineHeight };
    if (size <= MIN_SIZE) {
      const max = Math.max(1, Math.floor(box.h / lineHeight));
      return { size, lines: lines.slice(0, max), truncated: lines.length > max, lineHeight };
    }
  }
}

/** Text is drawn 1pt in from the box's left edge, so lay out against the inset width. Shared by fill and preview. */
export const boxLayout = (text: string, font: FontLike, a: PdfAnchor): Layout =>
  layoutText(text, font, { w: Math.max(1, a.w - 2), h: a.h });

const REPLACE: Record<string, string> = {
  '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2013': '-', '\u2014': '-',
  '\u2026': '...', '\u2022': '*', '\u00A0': ' ', '\t': '    ',
};

/** Helvetica (a standard PDF font) can only encode WinAnsi; anything else would make pdf-lib throw. */
export function toWinAnsi(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u2022\u00A0\t]/g, c => REPLACE[c])
    .replace(/\r\n?/g, '\n')
    .replace(/[^\n\x20-\x7E\xA1-\xFF]/gu, '?');
}
