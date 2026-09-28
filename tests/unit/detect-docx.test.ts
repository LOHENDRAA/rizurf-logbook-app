import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { blockIndexOfTable, detectDocx, docxContext, readDocxXml, regionOfDocxAnchor, tableIndexAtBlock } from '../../src/core/detect/docx';
import type { Placeholder } from '../../src/core/model';

const load = async (f: string) => readDocxXml(new Uint8Array(readFileSync(new URL(`../fixtures/${f}`, import.meta.url))));
const count = (phs: Placeholder[], binding: Placeholder['binding']) => phs.filter(p => p.binding === binding).length;
const debug = (phs: Placeholder[]) => phs.map(p => `${p.region} ${p.binding} ${p.label}`).join('\n');

const P = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const TC = (t: string) => `<w:tc>${P(t)}</w:tc>`;
const doc = (body: string) => `<w:document><w:body>${body}<w:sectPr/></w:body></w:document>`;

describe('detectDocx: synthetic documents', () => {
  it('turns markers into placeholders, whole-cell markers into cell anchors', () => {
    const xml = doc(P('Name: {{student_name}} Date: ______') + `<w:tbl><w:tr>${TC('Week')}${TC('&lt;insert dates&gt;')}</w:tr></w:tbl>`);
    const r = detectDocx(xml);
    const labels = r.placeholders.map(p => [p.label, p.anchor.kind, p.binding]);
    expect(labels).toContainEqual(['student_name', 'docx-text', 'free']);
    expect(labels).toContainEqual(['Date', 'docx-text', 'date']);
    // A 2-cell "Week | <dates>" row: the range label merged with the marker in the value cell,
    // and the week number is inserted after the word "Week".
    const range = r.placeholders.find(p => p.dateRole === 'range')!;
    expect(range.source).toBe('marker');
    expect(range.anchor).toEqual({ kind: 'docx-cell', table: [0], row: 0, col: 1 });
    expect(r.placeholders.find(p => p.dateRole === 'number')!.anchor.kind).toBe('docx-text');
    expect(r.unitStartBlock).toBe(1);
  });
  it('finds a weekday grid with every header column as a daily field', () => {
    const grid = `<w:tbl><w:tr>${TC('Day')}${TC('Task')}${TC('Hours')}</w:tr>` +
      ['Monday', 'Tuesday', 'Wednesday'].map(d => `<w:tr>${TC(d)}${TC('')}${TC('')}</w:tr>`).join('') + '</w:tbl>';
    const r = detectDocx(doc(P('Cover page') + `<w:tbl><w:tr>${TC('Week:')}${TC('')}</w:tr></w:tbl>` + grid));
    const daily = r.placeholders.filter(p => p.binding === 'daily');
    expect(daily).toHaveLength(6);
    expect(daily.map(p => p.dayIndex)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(daily.every(p => p.dayMode === 'weekday' && p.region === 'unit')).toBe(true);
    expect(r.unitStartBlock).toBe(1);
  });
  it('warns and repeats the whole document when there is no week row', () => {
    const r = detectDocx(doc(P('Just text &lt;name&gt;')));
    expect(r.unitStartBlock).toBe(0);
    expect(r.warnings[0]).toMatch(/repeats each period/);
  });
  it('maps between tables and body blocks and computes regions', () => {
    const ctx = docxContext(doc(P('a') + `<w:tbl><w:tr>${TC('x')}</w:tr></w:tbl>`));
    expect(blockIndexOfTable(ctx, 0)).toBe(1);
    expect(tableIndexAtBlock(ctx, 1)).toBe(0);
    expect(tableIndexAtBlock(ctx, 0)).toBeNull();
    expect(regionOfDocxAnchor(ctx, { kind: 'docx-text', paragraph: 0, start: 0, end: 0 }, 1)).toBe('cover');
    expect(regionOfDocxAnchor(ctx, { kind: 'docx-cell', table: [0], row: 0, col: 0 }, 1)).toBe('unit');
  });
});

// These fixture expectations come from v14's documented behaviour (CLAUDE.md, "Templates in templates/").
// If one fails, print debug(r.placeholders) and compare the port with v14's detectTemplate at the cited lines.
describe('detectDocx: real university templates', () => {
  it("Taylor's: Monday–Friday grid with Task/Tools/Lesson", async () => {
    const r = detectDocx(await load('taylors.docx'));
    const daily = r.placeholders.filter(p => p.binding === 'daily');
    expect(daily, debug(r.placeholders)).toHaveLength(15);
    expect(new Set(daily.map(p => p.dayIndex))).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(daily.every(p => p.dayMode === 'weekday')).toBe(true);
  });
  it('PMU replica: Day 1–10 rows and 5 weekly questions', async () => {
    const r = detectDocx(await load('pmu.docx'));
    const daily = r.placeholders.filter(p => p.binding === 'daily');
    expect(daily, debug(r.placeholders)).toHaveLength(10);
    expect(daily.map(p => p.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(daily.every(p => p.dayMode === 'nth')).toBe(true);
    expect(count(r.placeholders, 'period'), debug(r.placeholders)).toBe(5);
  });
  it('PMU with extra columns: 3 fields per day', async () => {
    const r = detectDocx(await load('pmu_extra.docx'));
    expect(count(r.placeholders, 'daily'), debug(r.placeholders)).toBe(30);
  });
  it('APU: objective/content answer areas and a week number', async () => {
    const r = detectDocx(await load('apu.docx'));
    expect(count(r.placeholders, 'period'), debug(r.placeholders)).toBeGreaterThanOrEqual(1);
    expect(r.placeholders.some(p => p.binding === 'date' && p.dateRole === 'number'), debug(r.placeholders)).toBe(true);
  });
});

describe('detectDocx: supervisor sign-off spots', () => {
  const sig = async (f: string) => detectDocx(await load(f)).placeholders.filter(p => p.binding === 'signature').map(p => p.label);
  it("Taylor's: name, signature and date on the supervisor row are all signed on approval", async () => {
    expect(await sig('../../public/demo/taylors.docx')).toEqual(expect.arrayContaining(['Supervisor name', 'Signature', 'Date']));
  });
  it("APU: the Date line under the signature is the approval date, not the period's", async () => {
    expect(await sig('../../public/demo/apu.docx')).toEqual(expect.arrayContaining(['Industrial Supervisor’s signature & stamp', 'Date']));
  });
});

describe("detectDocx: Taylor's weekly page details", () => {
  it('gives each "Monday <date>" marker that day\'s date, and replaces the printed week number', async () => {
    const r = detectDocx(await load('../../public/demo/taylors.docx'));
    const dayDates = r.placeholders.filter(p => p.binding === 'date' && p.dateRole === 'day');
    expect(dayDates.map(p => p.dayIndex)).toEqual([0, 1, 2, 3, 4]);
    const week = r.placeholders.find(p => p.dateRole === 'number')!;
    expect(week.anchor.kind === 'docx-text' && r.ctx.paraTexts[week.anchor.paragraph].slice(week.anchor.start, week.anchor.end)).toBe('1');
  });
});
