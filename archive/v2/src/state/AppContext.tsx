import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createSeedData, LOCKED_KEYS } from '../data'
import { hydrateAppData } from '../lib/autofill'
import { clearData, loadData, saveData } from '../lib/storage'
import { definitionFor, isCoverDefinition, isSectionValid, partComplete, removeStoredFile } from '../lib/workflow'
import type { AppData, PartId, SignatureProfile, StoredFile, User } from '../types'

interface AppContextValue {
  data: AppData
  currentUser?: User
  ready: boolean
  login: (email: string, password: string) => boolean
  quickLogin: (userId: string) => void
  logout: () => void
  resetDemo: () => Promise<void>
  updateFields: (internId: string, documentId: string, sectionId: string, fields: Record<string, string>) => void
  addFiles: (internId: string, documentId: string, files: File[]) => void
  removeFile: (internId: string, documentId: string, fileId: string) => void
  reorderFile: (internId: string, documentId: string, fileId: string, direction: -1 | 1) => void
  submitSections: (internId: string, documentId: string, sectionIds: string[]) => Promise<{ ok: boolean; message: string }>
  approveSections: (internId: string, documentId: string, sectionIds: string[]) => void
  requestChanges: (internId: string, documentId: string, sectionId: string, comment?: string) => void
  updateSignature: (userId: string, profile: SignatureProfile) => void
  generatePdf: (internId: string, part: PartId) => Promise<void>
  markNotificationsRead: () => void
  isPartComplete: (internId: string, part: PartId) => boolean
}

const AppContext = createContext<AppContextValue | null>(null)
const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()

function applySubmit(previous: AppData, internId: string, documentId: string, sectionIds: string[], nextStatus: 'submitted_for_review' | 'approved' | 'completed', actor: string, supervisorId: string, shortTitle: string, reviewRequired: boolean): AppData {
  return {
    ...previous,
    records: previous.records.map((item) => item.internId !== internId ? item : {
      ...item,
      documents: { ...item.documents, [documentId]: { ...item.documents[documentId], sections: item.documents[documentId].sections.map((section) => sectionIds.includes(section.id) ? {
        ...section, status: nextStatus, updatedAt: now(), comment: undefined,
        history: [...section.history, { id: uid(), action: nextStatus === 'submitted_for_review' ? 'Submitted for review' : 'Completed', actor, date: now() }],
      } : section) } },
    }),
    notifications: reviewRequired ? [...previous.notifications, { id: uid(), userId: supervisorId, title: 'Review requested', body: `${actor} submitted ${shortTitle} for review.`, createdAt: now(), read: false }] : previous.notifications,
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(createSeedData)
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(() => sessionStorage.getItem('internflow-user') ?? undefined)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadData().then((saved) => {
      if (saved) setData(hydrateAppData(saved, createSeedData()))
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (ready) void saveData(data)
  }, [data, ready])

  const currentUser = data.users.find((user) => user.id === currentUserId)

  const selectUser = (id: string) => {
    sessionStorage.setItem('internflow-user', id)
    setCurrentUserId(id)
  }

  const login = (email: string, password: string) => {
    const user = data.users.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase() && candidate.password === password)
    if (!user) return false
    selectUser(user.id)
    return true
  }

  const quickLogin = (userId: string) => {
    const user = data.users.find((candidate) => candidate.id === userId)
    if (user) selectUser(user.id)
  }

  const logout = () => {
    sessionStorage.removeItem('internflow-user')
    setCurrentUserId(undefined)
  }

  const resetDemo = async () => {
    await clearData()
    setData(createSeedData())
  }

  const updateFields = (internId: string, documentId: string, sectionId: string, fields: Record<string, string>) => {
    // Locked (auto-filled) keys are never user-controllable for any document:
    // strip them here (in addition to hiding/disabling the inputs) so stale
    // or forged values cannot be injected; autofill/hydrate restores the
    // canonical values.
    const locked = LOCKED_KEYS[documentId]
    const safeFields = locked ? Object.fromEntries(Object.entries(fields).filter(([key]) => !(locked as readonly string[]).includes(key))) : fields
    if (Object.keys(safeFields).length === 0) return
    // The two covers share one academic mentor value: mirror mentorName
    // edits to the sibling cover in the same state update.
    const siblingId = documentId === 'p1-cover' ? 'p2-cover' : documentId === 'p2-cover' ? 'p1-cover' : undefined
    const mirrorMentor = siblingId !== undefined && Object.prototype.hasOwnProperty.call(safeFields, 'mentorName') ? safeFields.mentorName : undefined
    setData((previous) => ({
      ...previous,
      records: previous.records.map((record) => {
        if (record.internId !== internId) return record
        const siblingDoc = siblingId ? record.documents[siblingId] : undefined
        // Mirror by section index (covers are single-section today), so the
        // sync never depends on the differing section ids.
        const editedIndex = record.documents[documentId]?.sections.findIndex((section) => section.id === sectionId) ?? -1
        const targetIndex = editedIndex >= 0 && siblingDoc && editedIndex < siblingDoc.sections.length ? editedIndex : 0
        const canMirror = mirrorMentor !== undefined && siblingDoc?.sections[targetIndex] !== undefined
        return {
          ...record,
          pdfs: record.pdfs.map((pdf) => ({ ...pdf, outdated: true })),
          documents: {
            ...record.documents,
            [documentId]: {
              ...record.documents[documentId], updatedAt: now(),
              sections: record.documents[documentId].sections.map((section) => section.id === sectionId ? {
                ...section,
                fields: { ...section.fields, ...safeFields },
                status: section.status === 'not_started' || section.status === 'approved' || section.status === 'completed' || section.status === 'changes_requested' ? 'draft' : section.status,
                // A reverted approval/completion must not keep a stale approval
                // timestamp that rendering could mistake for a fresh approval.
                approvedAt: section.status === 'approved' || section.status === 'completed' ? undefined : section.approvedAt,
                comment: section.status === 'changes_requested' ? section.comment : undefined,
                updatedAt: now(),
              } : section),
            },
            ...(canMirror ? {
              [siblingId as string]: {
                ...siblingDoc, updatedAt: now(),
                sections: siblingDoc!.sections.map((section, index) => index === targetIndex ? {
                  ...section,
                  fields: { ...section.fields, mentorName: mirrorMentor as string },
                  status: section.status === 'not_started' || section.status === 'approved' || section.status === 'completed' || section.status === 'changes_requested' ? 'draft' : section.status,
                  approvedAt: section.status === 'approved' || section.status === 'completed' ? undefined : section.approvedAt,
                  comment: section.status === 'changes_requested' ? section.comment : undefined,
                  updatedAt: now(),
                } : section),
              },
            } : {}),
          },
        }
      }),
    }))
  }

  const addFiles = (internId: string, documentId: string, files: File[]) => {
    const additions: StoredFile[] = files.map((file) => ({ id: uid(), name: file.name, type: file.type, size: file.size, blob: file, uploadedAt: now() }))
    setData((previous) => ({
      ...previous,
      records: previous.records.map((record) => record.internId !== internId ? record : {
        ...record,
        pdfs: record.pdfs.map((pdf) => ({ ...pdf, outdated: true })),
        documents: {
          ...record.documents,
          [documentId]: {
            ...record.documents[documentId], files: [...record.documents[documentId].files, ...additions], updatedAt: now(),
            sections: record.documents[documentId].sections.map((section) => ({ ...section, status: 'draft', updatedAt: now() })),
          },
        },
      }),
    }))
  }

  const removeFile = (internId: string, documentId: string, fileId: string) => {
    setData((previous) => ({ ...previous, records: previous.records.map((record) => {
      if (record.internId !== internId) return record
      const document = record.documents[documentId]
      if (!document || !document.files.some((file) => file.id === fileId)) return record
      const updatedAt = now()
      return {
        ...record,
        pdfs: record.pdfs.map((pdf) => ({ ...pdf, outdated: true })),
        documents: { ...record.documents, [documentId]: removeStoredFile(document, fileId, updatedAt) },
      }
    }) }))
  }

  const reorderFile = (internId: string, documentId: string, fileId: string, direction: -1 | 1) => {
    setData((previous) => ({ ...previous, records: previous.records.map((record) => {
      if (record.internId !== internId) return record
      const files = [...record.documents[documentId].files]
      const index = files.findIndex((file) => file.id === fileId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= files.length) return record
      ;[files[index], files[target]] = [files[target], files[index]]
      return { ...record, pdfs: record.pdfs.map((pdf) => ({ ...pdf, outdated: true })), documents: { ...record.documents, [documentId]: { ...record.documents[documentId], files } } }
    }) }))
  }

  const submitSections = async (internId: string, documentId: string, sectionIds: string[]) => {
    const record = data.records.find((candidate) => candidate.internId === internId)
    const definition = definitionFor(documentId)
    if (!record || !definition) return { ok: false, message: 'Document could not be found.' }
    const document = record.documents[documentId]
    if (!document) return { ok: false, message: 'Document could not be found.' }
    const invalid = document.sections.filter((section) => sectionIds.includes(section.id) && !isSectionValid(definition, section, document.files.length))
    if (invalid.length) return { ok: false, message: `Complete the required information for ${invalid[0].label}.` }
    const actor = currentUser?.name ?? 'Intern'
    // Covers are visual-only: validate manual fields, set `completed`, append
    // a history entry, update timestamps — never approve, never notify the
    // supervisor, never set approvedAt, never touch signatures. Idempotent so
    // double-clicks or reloads cannot duplicate history or escalate.
    if (isCoverDefinition(definition)) {
      const pending = document.sections.filter((section) => sectionIds.includes(section.id) && section.status !== 'completed')
      if (!pending.length) return { ok: true, message: 'Marked complete.' }
      const pendingIds = pending.map((section) => section.id)
      setData((previous) => {
        const current = previous.records.find((candidate) => candidate.internId === internId)?.documents[documentId]
        if (!current) return previous
        const stillPending = current.sections.filter((section) => pendingIds.includes(section.id) && section.status !== 'completed')
        if (!stillPending.length) return previous
        // Re-validate against the latest state so cleared manual fields
        // cannot complete.
        const nowInvalid = stillPending.filter((section) => !isSectionValid(definition, section, current.files.length))
        if (nowInvalid.length) return previous
        return applySubmit(previous, internId, documentId, stillPending.map((section) => section.id), 'completed', actor, record.supervisorId, definition.shortTitle, false)
      })
      return { ok: true, message: 'Marked complete.' }
    }
    const nextStatus = definition.reviewRequired ? 'submitted_for_review' : 'approved'
    setData((previous) => applySubmit(previous, internId, documentId, sectionIds, nextStatus, actor, record.supervisorId, definition.shortTitle, definition.reviewRequired))
    return { ok: true, message: definition.reviewRequired ? 'Sent to your supervisor for review.' : 'Marked complete.' }
  }

  const approveSections = (internId: string, documentId: string, sectionIds: string[]) => {
    const definition = definitionFor(documentId)
    const record = data.records.find((candidate) => candidate.internId === internId)
    if (!definition || !record) return
    // Covers are intern-only visual website state; supervisors never approve
    // or sign them (they never enter submitted_for_review).
    if (isCoverDefinition(definition)) return
    const actor = currentUser?.name ?? 'Supervisor'
    setData((previous) => ({
      ...previous,
      records: previous.records.map((item) => item.internId !== internId ? item : {
        ...item,
        pdfs: item.pdfs.map((pdf) => ({ ...pdf, outdated: true })),
        documents: { ...item.documents, [documentId]: { ...item.documents[documentId], sections: item.documents[documentId].sections.map((section) => sectionIds.includes(section.id) ? {
          ...section, status: 'approved', approvedAt: now(), comment: undefined,
          history: [...section.history, { id: uid(), action: 'Approved and signed', actor, date: now() }],
        } : section) } },
      }),
      notifications: [...previous.notifications, { id: uid(), userId: internId, title: `${definition.shortTitle} approved`, body: `${actor} approved and signed ${sectionIds.length > 1 ? `${sectionIds.length} sections` : 'your submission'}.`, createdAt: now(), read: false }],
    }))
  }

  const requestChanges = (internId: string, documentId: string, sectionId: string, comment?: string) => {
    const definition = definitionFor(documentId)
    if (definition && isCoverDefinition(definition)) return
    const actor = currentUser?.name ?? 'Supervisor'
    setData((previous) => ({
      ...previous,
      records: previous.records.map((item) => item.internId !== internId ? item : {
        ...item,
        pdfs: item.pdfs.map((pdf) => ({ ...pdf, outdated: true })),
        documents: { ...item.documents, [documentId]: { ...item.documents[documentId], sections: item.documents[documentId].sections.map((section) => section.id === sectionId ? {
          ...section, status: 'changes_requested', comment,
          history: [...section.history, { id: uid(), action: 'Changes requested', actor, date: now(), comment }],
        } : section) } },
      }),
      notifications: [...previous.notifications, { id: uid(), userId: internId, title: 'Changes requested', body: `${actor} requested changes to ${definition?.shortTitle ?? 'a section'}.`, createdAt: now(), read: false }],
    }))
  }

  const updateSignature = (userId: string, profile: SignatureProfile) => setData((previous) => ({ ...previous, signatures: { ...previous.signatures, [userId]: { ...previous.signatures[userId], ...profile } } }))

  const generatePdf = async (internId: string, part: PartId) => {
    const record = data.records.find((candidate) => candidate.internId === internId)
    const intern = data.users.find((user) => user.id === internId)
    const supervisor = record && data.users.find((user) => user.id === record.supervisorId)
    if (!record || !intern) return
    const { createCombinedPdf } = await import('../lib/pdf')
    const blob = await createCombinedPdf(record, intern, supervisor, part, data.signatures)
    const createdAt = now()
    const version = { id: uid(), part, createdAt, filename: `${record.studentId}-${part === 'part1' ? 'Part-1' : 'Part-2'}-${createdAt.slice(0, 10)}.pdf`, blob, outdated: false }
    setData((previous) => ({ ...previous, records: previous.records.map((item) => {
      if (item.internId !== internId) return item
      const versions = [...item.pdfs, version]
      const retained = (['part1', 'part2'] as PartId[]).flatMap((partId) => versions.filter((pdf) => pdf.part === partId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3))
      return { ...item, pdfs: retained }
    }) }))
  }

  const markNotificationsRead = () => currentUser && setData((previous) => ({ ...previous, notifications: previous.notifications.map((item) => item.userId === currentUser.id ? { ...item, read: true } : item) }))
  const isPartComplete = (internId: string, part: PartId) => {
    const record = data.records.find((candidate) => candidate.internId === internId)
    return record ? partComplete(record, part) : false
  }

  return <AppContext.Provider value={{ data, currentUser, ready, login, quickLogin, logout, resetDemo, updateFields, addFiles, removeFile, reorderFile, submitSections, approveSections, requestChanges, updateSignature, generatePdf, markNotificationsRead, isPartComplete }}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}
