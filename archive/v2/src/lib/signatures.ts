import { PDFDocument } from 'pdf-lib'

/**
 * Shared student-signature handling for cover auto-signature PDF rendering.
 * Signatures apply automatically whenever embeddable and never gate
 * completion.
 *
 * `isEmbeddableSignatureImage` is only a fast structural pre-check (PNG or
 * JPEG data URL with decodable base64 payload). It is NOT authoritative:
 * mismatched MIME labels and corrupt image bytes pass it but necessarily
 * fail at embed time. The authoritative check is `canEmbedSignatureImage`,
 * which performs the same pdf-lib decode the renderer uses.
 *
 * No fallback identity is ever synthesized here.
 */

const EMBEDDABLE_PATTERN = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/

export function isEmbeddableSignatureImage(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  const match = EMBEDDABLE_PATTERN.exec(trimmed)
  if (!match) return false
  const encoded = match[2].replace(/\s+/g, '')
  if (!encoded) return false
  try {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
    return bytes.length > 0
  } catch {
    return false
  }
}

/**
 * Single shared decode/embed implementation. Returns the embedded image, or
 * undefined for missing, unsupported, mislabeled, or corrupt data. Never
 * throws: signature data is untrusted.
 */
export async function embedSignatureImage(pdf: PDFDocument, dataUrl?: string) {
  if (!dataUrl) return undefined
  const source = dataUrl.trim()
  if (!source.startsWith('data:image/')) return undefined
  try {
    const encoded = source.slice(source.indexOf(',') + 1)
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
    return source.startsWith('data:image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
  } catch { return undefined }
}

/**
 * Authoritative signature eligibility: true only when the value actually
 * decodes through the same pdf-lib path the renderer uses. Never throws.
 */
export async function canEmbedSignatureImage(value: unknown): Promise<boolean> {
  if (!isEmbeddableSignatureImage(value)) return false
  try {
    const pdf = await PDFDocument.create()
    return (await embedSignatureImage(pdf, (value as string).trim())) !== undefined
  } catch {
    return false
  }
}
