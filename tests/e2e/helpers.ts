import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { expect, type Page } from '@playwright/test';
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

/** Click a sidebar link, then move the mouse onto the page so the hover rail collapses (as a person's would). */
export async function nav(page: Page, name: string) {
  // Starts with the label: "Review 1 waiting" is the Review link, "← Journal" isn't the Journal link.
  await page.getByRole('link', { name: new RegExp(`^${name}(\\s|$)`) }).click();
  await page.mouse.move(700, 400);
}

/** Writes one day's entry from the Journal page's "Write for another day" and waits until it's saved. */
export async function writeEntry(page: Page, date: string, text: string) {
  await nav(page, 'Journal');
  await page.getByTestId('journal-date').fill(date);
  await page.getByTestId('journal-open').click();
  await expect(page).toHaveURL(new RegExp(`#/journal/${date}$`));
  await page.getByTestId('entry-text').fill(text);
  await expect(page.getByTestId('entry-status')).toContainText('Saved');
}
