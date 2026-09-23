export type Role = 'intern' | 'supervisor'
export type PartId = 'part1' | 'part2'
export type DocumentStatus = 'not_started' | 'draft' | 'submitted_for_review' | 'changes_requested' | 'approved' | 'completed'
export type DocumentKind = 'form' | 'upload' | 'logbook' | 'attendance' | 'assessment'

export interface User {
  id: string
  name: string
  email: string
  password: string
  role: Role
  avatar: string
}

export interface HistoryEntry {
  id: string
  action: string
  actor: string
  date: string
  comment?: string
}

export interface SectionRecord {
  id: string
  label: string
  status: DocumentStatus
  fields: Record<string, string>
  comment?: string
  updatedAt?: string
  approvedAt?: string
  history: HistoryEntry[]
}

export interface StoredFile {
  id: string
  name: string
  type: string
  size: number
  blob: Blob
  uploadedAt: string
}

export interface DocumentRecord {
  id: string
  sections: SectionRecord[]
  files: StoredFile[]
  updatedAt?: string
}

export interface PdfVersion {
  id: string
  part: PartId
  createdAt: string
  filename: string
  blob: Blob
  outdated: boolean
}

export interface InternRecord {
  internId: string
  company: string
  title: string
  studentId: string
  intake: string
  department: string
  identityNumber: string
  contactNumber: string
  supervisorId: string
  startDate: string
  endDate: string
  dueDates: Record<PartId, string>
  documents: Record<string, DocumentRecord>
  pdfs: PdfVersion[]
}

export interface Notification {
  id: string
  userId: string
  title: string
  body: string
  createdAt: string
  read: boolean
}

export interface SignatureProfile {
  signature?: string
  stamp?: string
}

export interface AppData {
  users: User[]
  records: InternRecord[]
  notifications: Notification[]
  signatures: Record<string, SignatureProfile>
}

export interface DocumentDefinition {
  id: string
  part: PartId
  order: number
  title: string
  shortTitle: string
  description: string
  guideline: string
  kind: DocumentKind
  reviewRequired: boolean
  owner: Role
  sections: string[]
  fields?: Array<{ key: string; label: string; type?: 'text' | 'date' | 'textarea' | 'number'; placeholder?: string; readOnly?: boolean }>
}
