import type { Format, PageRole, Placeholder, Template } from './model';
import { detectDocx, readDocxXml, type DocxContext } from './detect/docx';
import { detectPdf } from './detect/pdf';
import { extractPdfText } from './pdf/text';

/** An error whose message is written for the person using the app. */
export class UserError extends Error {}

export function formatOf(name: string): Format {
  const n = name.toLowerCase();
  if (n.endsWith('.docx')) return 'docx';
  if (n.endsWith('.pdf')) return 'pdf';
  throw new UserError('Only Word (.docx) and PDF (.pdf) templates are supported.');
}

export interface Detected {
  format: Format;
  bytes: ArrayBuffer;
  placeholders: Placeholder[];
  pageRoles?: PageRole[];
  unitStartBlock?: number;
  warnings: string[];
  docx?: DocxContext;
}

export async function detectFromFile(file: { name: string; arrayBuffer(): Promise<ArrayBuffer> }): Promise<Detected> {
  const format = formatOf(file.name);
  const bytes = await file.arrayBuffer();
  if (format === 'docx') {
    let xml: string;
    try { xml = await readDocxXml(bytes); } catch { throw new UserError("This Word file can't be opened — it may be corrupt, or not a .docx file."); }
    const d = detectDocx(xml);
    return { format, bytes, placeholders: d.placeholders, unitStartBlock: d.unitStartBlock, warnings: d.warnings, docx: d.ctx };
  }
  let pages;
  try {
    pages = await extractPdfText(new Uint8Array(bytes));
  } catch (e) {
    if ((e as { name?: string })?.name === 'PasswordException') throw new UserError('This PDF is password-protected; upload an unlocked copy.');
    throw new UserError("This PDF can't be opened — it may be corrupt.");
  }
  const d = detectPdf(pages);
  return { format, bytes, placeholders: d.placeholders, pageRoles: d.pageRoles, warnings: d.warnings };
}

export const normalizeUniversity = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

export function findByUniversity(list: Template[], name: string, exceptId?: string): Template | undefined {
  const n = normalizeUniversity(name);
  return list.find(t => t.id !== exceptId && normalizeUniversity(t.university) === n);
}

/** Whether a placeholder is actually exported: PDF placeholders on a page marked "Ignore" never are. */
export const isExported = (ph: Placeholder, pageRoles?: PageRole[]): boolean =>
  ph.anchor.kind !== 'pdf' || pageRoles?.[ph.anchor.page] !== 'ignore';

/** A template's placeholders, minus ones that are never exported (e.g. on an ignored PDF page). */
export const livePlaceholders = (t: Template): Placeholder[] => t.placeholders.filter(p => isExported(p, t.pageRoles));

export function validateTemplate(t: Template): string[] {
  const errors: string[] = [];
  if (!t.university.trim()) errors.push('Enter the university name.');
  if (t.format === 'pdf' && !(t.pageRoles ?? []).includes('unit')) errors.push('Mark at least one page as "Repeats every period".');
  if (t.format === 'docx' && t.unitStartBlock == null) errors.push('Choose where the repeating part starts.');
  if (!livePlaceholders(t).some(p => p.region === 'unit')) errors.push('Add at least one placeholder to the repeating part.');
  return errors;
}

export function cloneTemplate(t: Template): Template {
  return {
    ...t,
    pageRoles: t.pageRoles ? [...t.pageRoles] : undefined,
    placeholders: t.placeholders.map(p => ({ ...p, anchor: p.anchor.kind === 'docx-cell' ? { ...p.anchor, table: [...p.anchor.table] } : { ...p.anchor } })),
  };
}
