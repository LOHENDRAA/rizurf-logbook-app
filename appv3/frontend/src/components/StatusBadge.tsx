import { AlertTriangle, Check, CircleDashed, Clock3, Lock, MessageSquareWarning } from 'lucide-react'
import type { JournalStatus, ReviewStatus } from '../types'
import type { LifecycleStage, OverallReviewStatus } from '../domain/review'

export type BadgeStatus = JournalStatus | ReviewStatus | OverallReviewStatus | LifecycleStage | 'locked' | 'overdue'

const labels: Record<BadgeStatus, string> = {
  not_started: 'Not started',
  draft: 'Draft',
  submitted: 'Submitted',
  pending: 'Pending review',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  completed: 'Completed',
  locked: 'Locked',
  overdue: 'Overdue',
  awaiting_company: 'Awaiting company review',
  revision_required: 'Revision required',
  awaiting_mentor: 'Awaiting mentor review',
}

export function StatusBadge({ status }: { status: BadgeStatus }) {
  const Icon =
    status === 'submitted' || status === 'approved' || status === 'completed' ? Check
      : status === 'changes_requested' || status === 'revision_required' ? MessageSquareWarning
        : status === 'pending' || status === 'awaiting_company' || status === 'awaiting_mentor' ? Clock3
          : status === 'draft' ? Clock3
            : status === 'overdue' ? AlertTriangle
              : status === 'locked' ? Lock
                : CircleDashed
  return <span className={`status status-${status}`}><Icon size={13} />{labels[status]}</span>
}

export function ProgressBar({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)))
  return <div className="progress-track" role="progressbar" aria-label={`${clamped}% complete`} aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${clamped}%` }} /></div>
}
