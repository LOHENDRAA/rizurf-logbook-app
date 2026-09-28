export function downloadBytes(name: string, bytes: Uint8Array | Blob, type: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (...parts: string[]) =>
  parts.map(p => p.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).join('_');
