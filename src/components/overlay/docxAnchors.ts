import type { DocxAnchor, DocxCellAnchor, DocxTextAnchor } from '../../core/model';

/** Links the XML anchors to the DOM that docx-preview rendered. */
export interface DocxDomIndex {
  paraOf: (HTMLElement | null)[];          // xml paragraph index → rendered <p>
  domToXml: Map<Element, number>;          // rendered <p> → xml paragraph index
  texts: string[];                         // xml paragraph texts
  tables: HTMLTableElement[];              // top-level tables, document order
  nested: Map<HTMLTableElement, HTMLTableElement[]>;
}

const norm = (s: string) => s.replace(/\s+/g, '');

/**
 * docx-preview renders one <p> per <w:p>, in order, so index i usually lines up.
 * When it doesn't (e.g. an extra paragraph it synthesised), look nearby for the
 * paragraph with the same text instead of trusting the position blindly.
 */
export function indexDocxDom(root: HTMLElement, paraTexts: string[]): DocxDomIndex {
  const dom = Array.from(root.querySelectorAll<HTMLElement>('section.docx article p'));
  const same = (el: HTMLElement | undefined, want: string) => !!el && norm(el.textContent ?? '') === want;
  const paraOf = paraTexts.map((t, i) => {
    const want = norm(t);
    if (same(dom[i], want)) return dom[i];
    if (!want) return dom[i] ?? null;
    for (let d = 1; d < 40; d++) for (const j of [i - d, i + d]) if (same(dom[j], want)) return dom[j];
    return null;
  });
  const domToXml = new Map<Element, number>();
  paraOf.forEach((p, i) => { if (p && !domToXml.has(p)) domToXml.set(p, i); });
  const all = Array.from(root.querySelectorAll<HTMLTableElement>('section.docx article table'));
  const tables = all.filter(t => !t.parentElement?.closest('table'));
  const nested = new Map<HTMLTableElement, HTMLTableElement[]>();
  for (const t of tables) nested.set(t, all.filter(n => n !== t && n.parentElement?.closest('table') === t));
  return { paraOf, domToXml, texts: paraTexts, tables, nested };
}

function rangeRect(p: HTMLElement, start: number, end: number): DOMRect | null {
  if (start === end) return null;
  const range = document.createRange();
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let started = false;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent?.length ?? 0;
    if (!started && start <= pos + len) { range.setStart(n, start - pos); started = true; }
    if (started && end <= pos + len) {
      range.setEnd(n, end - pos);
      const r = range.getBoundingClientRect();
      return r.width ? r : null;
    }
    pos += len;
  }
  return null;
}

export function resolveAnchor(ix: DocxDomIndex, a: DocxAnchor): { el: HTMLElement; rect(): DOMRect } | null {
  if (a.kind === 'docx-cell') {
    const top = ix.tables[a.table[0]];
    if (!top || a.table.length > 2) return null;
    const t = a.table.length === 1 ? top : ix.nested.get(top)?.[a.table[1]];
    const cell = t?.rows[a.row]?.cells[a.col] as HTMLElement | undefined;
    return cell ? { el: cell, rect: () => cell.getBoundingClientRect() } : null;
  }
  const p = ix.paraOf[a.paragraph];
  return p ? { el: p, rect: () => rangeRect(p, a.start, a.end) ?? p.getBoundingClientRect() } : null;
}

export function anchorFromCell(ix: DocxDomIndex, td: HTMLTableCellElement): DocxCellAnchor | null {
  const t = td.closest('table') as HTMLTableElement | null;
  const tr = td.parentElement as HTMLTableRowElement | null;
  if (!t || !tr) return null;
  const ti = ix.tables.indexOf(t);
  if (ti >= 0) return { kind: 'docx-cell', table: [ti], row: tr.rowIndex, col: td.cellIndex };
  for (const [top, list] of ix.nested) {
    const ni = list.indexOf(t);
    if (ni >= 0) return { kind: 'docx-cell', table: [ix.tables.indexOf(top), ni], row: tr.rowIndex, col: td.cellIndex };
  }
  return null;
}

const elOf = (n: Node): Element | null => (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement);

export function anchorFromSelection(ix: DocxDomIndex, sel: Selection): DocxTextAnchor | null {
  const range = sel.getRangeAt(0);
  const p = elOf(range.startContainer)?.closest('p');
  if (!p || p !== elOf(range.endContainer)?.closest('p')) return null;
  const pi = ix.domToXml.get(p);
  if (pi == null) return null;
  const pre = document.createRange();
  pre.selectNodeContents(p);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  return { kind: 'docx-text', paragraph: pi, start, end: start + range.toString().length };
}

export function anchorAtParagraphEnd(ix: DocxDomIndex, p: HTMLElement): DocxTextAnchor | null {
  const pi = ix.domToXml.get(p);
  if (pi == null) return null;
  const len = ix.texts[pi].length;
  return { kind: 'docx-text', paragraph: pi, start: len, end: len };
}

export function topTableIndexOf(ix: DocxDomIndex, el: Element): number | null {
  let t = el.closest('table');
  while (t?.parentElement?.closest('table')) t = t.parentElement.closest('table');
  const i = t ? ix.tables.indexOf(t as HTMLTableElement) : -1;
  return i >= 0 ? i : null;
}
