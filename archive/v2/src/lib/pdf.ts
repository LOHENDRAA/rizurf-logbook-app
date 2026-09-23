import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'
import { getDocuments } from '../data'
import { combinedPageSelection, renderOfficialDocument } from './officialTemplates'
import type { InternRecord, PartId, SignatureProfile, StoredFile, User } from '../types'

const gray = rgb(90 / 255, 100 / 255, 116 / 255)

function write(page: PDFPage, text: string, x: number, y: number, size: number, font: Awaited<ReturnType<PDFDocument['embedFont']>>, color = gray) {
  page.drawText(String(text).replace(/[–—]/g, '-'), { x, y, size, font, color, maxWidth: 490, lineHeight: size * 1.35 })
}

async function appendUploaded(pdf: PDFDocument, file: StoredFile) {
  const name = file.name
  try {
    const bytes = await file.blob.arrayBuffer()
    const isPdf = file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')
    const isPng = file.type === 'image/png' || name.toLowerCase().endsWith('.png')
    const isJpg = file.type === 'image/jpeg' || file.type === 'image/jpg' || /\.jpe?g$/i.test(name)
    if (isPdf) return { kind: 'pdf' as const, bytes }
    if (isPng || isJpg) return { kind: 'image' as const, bytes, png: isPng }
  } catch { /* fall through to a useful error page */ }
  return { kind: 'unsupported' as const }
}

async function appendUploadPage(pdf: PDFDocument, file: StoredFile) {
  const result = await appendUploaded(pdf, file)
  const name = file.name ?? 'uploaded file'
  if (result.kind === 'pdf') {
    const uploaded = await PDFDocument.load(result.bytes)
    ;(await pdf.copyPages(uploaded, uploaded.getPageIndices())).forEach((page) => pdf.addPage(page))
    return
  }
  if (result.kind === 'image') {
    const image = result.png ? await pdf.embedPng(result.bytes) : await pdf.embedJpg(result.bytes)
    const page = pdf.addPage([595.28, 841.89])
    const ratio = Math.min(515 / image.width, 761 / image.height)
    page.drawImage(image, { x: (595.28 - image.width * ratio) / 2, y: (841.89 - image.height * ratio) / 2, width: image.width * ratio, height: image.height * ratio })
    return
  }
  const page = pdf.addPage([595.28, 841.89])
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  write(page, 'Uploaded document could not be converted', 42, 760, 17, regular)
  write(page, name, 42, 720, 11, regular)
  write(page, 'Open the original file from the document page to inspect it.', 42, 680, 10, regular)
}

/**
 * Build the submission pack. Official pages are rendered by the same manifest
 * driven renderer used by DocumentPreview, so the two views cannot drift into
 * different field layouts.
 */
export async function createCombinedPdf(record: InternRecord, intern: User, supervisor: User | undefined, part: PartId, signatures: Record<string, SignatureProfile>) {
  const pdf = await PDFDocument.create()
  const definitions = getDocuments(part)
  const context = { record, intern, supervisor, signatures }

  for (const definition of definitions) {
    const document = record.documents[definition.id]
    if (definition.kind === 'upload') {
      for (const file of document.files) await appendUploadPage(pdf, file)
      continue
    }
    const official = await renderOfficialDocument(definition, context, combinedPageSelection(definition))
    const rendered = await PDFDocument.load(await official.arrayBuffer())
    ;(await pdf.copyPages(rendered, rendered.getPageIndices())).forEach((page) => pdf.addPage(page))
  }
  pdf.setTitle(`${intern.name} ${part === 'part1' ? 'Part 1' : 'Part 2'} Internship Logbook`)
  pdf.setAuthor('InternFlow')
  return new Blob([await pdf.save()], { type: 'application/pdf' })
}
