import { Check, CircleDashed, Clock3, RotateCcw, Send } from 'lucide-react'
import type { DocumentStatus } from '../types'

const labels: Record<DocumentStatus, string> = {
  not_started: 'Not started', draft: 'Draft', submitted_for_review: 'In review', changes_requested: 'Changes requested', approved: 'Approved', completed: 'Completed',
}

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const Icon = status === 'approved' || status === 'completed' ? Check : status === 'submitted_for_review' ? Send : status === 'changes_requested' ? RotateCcw : status === 'draft' ? Clock3 : CircleDashed
  return <span className={`status status-${status}`}><Icon size={13} />{labels[status]}</span>
}

export function ProgressBar({ value, compact = false }: { value: number; compact?: boolean }) {
  return <div className={`progress-track ${compact ? 'compact' : ''}`} aria-label={`${value}% complete`}><span style={{ width: `${value}%` }} /></div>
}
