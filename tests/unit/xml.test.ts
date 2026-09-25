import { describe, expect, it } from 'vitest';
import { allParagraphs, bodyBlocks, cellIndex, cellText, replaceCellContent, replaceTextRange, scanBlocks, tableAt, textOf } from '../../src/core/docx/xml';

const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const tc = (inner: string) => `<w:tc><w:tcPr><w:tcW w:w="100"/></w:tcPr>${inner}</w:tc>`;
const nested = `<w:tbl><w:tr>${tc(p('inner'))}</w:tr></w:tbl>`;
const doc = `<w:document><w:body>${p('Title')}<w:tbl><w:tr>${tc(p('Name'))}${tc(p('') + nested)}</w:tr></w:tbl><w:p/><w:sectPr/></w:body></w:document>`;

describe('xml helpers', () => {
  it('scans only top-level blocks', () => {
    expect(scanBlocks(doc, 'w:tbl')).toHaveLength(1);
  });
  it('lists body blocks in order with tags', () => {
    expect(bodyBlocks(doc).map(b => b.tag)).toEqual(['w:p', 'w:tbl', 'w:p', 'w:sectPr']);
  });
  it('lists every paragraph in document order, including inside tables and self-closing ones', () => {
    expect(allParagraphs(doc).map(b => textOf(b.full))).toEqual(['Title', 'Name', '', 'inner', '']);
  });
  it('indexes cells including one nested level', () => {
    const cells = cellIndex(doc);
    expect(cells.map(c => `${c.table.join('.')}:${c.row}:${c.col}`)).toEqual(['0:0:0', '0:0:1', '0.0:0:0']);
    const inner = cells[2];
    expect(cellText(doc.slice(inner.start, inner.end))).toBe('inner');
    expect(tableAt(doc, [0, 0])?.full.startsWith('<w:tbl>')).toBe(true);
    expect(tableAt(doc, [5])).toBeUndefined();
  });
  it('replaces a cell, keeping tcPr and run formatting, escaping and breaking lines', () => {
    const cell = tc('<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>old</w:t></w:r></w:p>');
    const out = replaceCellContent(cell, 'A & B <c>\nline 2');
    expect(out).toContain('<w:tcPr><w:tcW w:w="100"/></w:tcPr>');
    expect(out).toContain('<w:jc w:val="left"/>');
    expect(out).toContain('<w:rPr><w:b/></w:rPr>');
    expect(out).toContain('A &amp; B &lt;c&gt;</w:t><w:br/><w:t xml:space="preserve">line 2');
    expect(out).not.toContain('old');
  });
  it('replaces a character range across runs', () => {
    const para = '<w:p><w:r><w:t>Name: &lt;na</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>me&gt; end</w:t></w:r></w:p>';
    expect(textOf(replaceTextRange(para, 6, 12, 'Aina'))).toBe('Name: Aina end');
  });
  it('inserts at the end of a paragraph with a separating space', () => {
    expect(textOf(replaceTextRange(p('Week'), 4, 4, '3'))).toBe('Week 3');
    expect(textOf(replaceTextRange('<w:p/>', 0, 0, 'Hello'))).toBe('Hello');
  });
});
