import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('tooling', () => {
  it('loads a fixture PDF with pdf.js in Node', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('../fixtures/pmu.pdf', import.meta.url)));
    const doc = await getDocument({ data: bytes }).promise;
    expect(doc.numPages).toBeGreaterThan(0);
  });
});
