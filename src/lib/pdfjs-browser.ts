import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export function openPdf(bytes: ArrayBuffer) {
  return getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise;
}
