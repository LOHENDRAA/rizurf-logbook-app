import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdfText } from '../../src/core/pdf/text';

GlobalWorkerOptions.workerSrc = pathToFileURL(createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;

export const fixture = (f: string) => path.resolve('tests/fixtures', f);
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function lastWeekday(d = new Date()): Date {
  const x = new Date(d);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() - 1);
  return x;
}
export async function asRole(page: Page, label: string) {
  await page.getByTestId('role-select').selectOption({ label });
}
export async function pdfWords(bytes: Uint8Array): Promise<string> {
  return (await extractPdfText(bytes)).flatMap(p => p.words.map(w => w.str)).join(' ');
}
