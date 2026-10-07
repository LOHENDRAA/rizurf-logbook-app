import type { PeriodFill, PeriodStatus, Placeholder, ReviewAction } from './model';
import { newId } from './ids';
import { isCoverField } from './autofill';

export const STATUS_TEXT: Record<PeriodStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  changes_requested: 'Changes requested',
  approved: 'Approved',
};

export const isLocked = (fill?: PeriodFill): boolean => !!fill && (fill.status === 'submitted' || fill.status === 'approved');

export const emptyFill = (studentId: string, periodKey: string, templateId: string): PeriodFill =>
  ({ studentId, periodKey, templateId, values: {}, autofilled: {}, status: 'draft' });

function action(fill: PeriodFill, kind: ReviewAction['action'], by: string, at: string, extra: Partial<ReviewAction> = {}): ReviewAction {
  return { id: newId('ra'), studentId: fill.studentId, periodKey: fill.periodKey, action: kind, by, at, ...extra };
}

export function submitFill(fill: PeriodFill, by: string, now = new Date()) {
  if (fill.status !== 'draft' && fill.status !== 'changes_requested') throw new Error(`Can't submit a period that is ${STATUS_TEXT[fill.status].toLowerCase()}.`);
  const at = now.toISOString();
  return { fill: { ...fill, status: 'submitted' as const, submittedAt: at }, action: action(fill, 'submit', by, at, { values: { ...fill.values } }) };
}

export function approveFill(fill: PeriodFill, by: string, signature: string, now = new Date()) {
  if (fill.status !== 'submitted') throw new Error("This period isn't waiting for review.");
  if (!signature.trim()) throw new Error('Type your full name to sign the approval.');
  const at = now.toISOString();
  return { fill: { ...fill, status: 'approved' as const }, action: action(fill, 'approve', by, at, { signature: signature.trim() }) };
}

export function requestChangesFill(fill: PeriodFill, by: string, comment: string, now = new Date()) {
  if (fill.status !== 'submitted') throw new Error("This period isn't waiting for review.");
  if (!comment.trim()) throw new Error('Write what needs to change.');
  const at = now.toISOString();
  return { fill: { ...fill, status: 'changes_requested' as const }, action: action(fill, 'request_changes', by, at, { comment: comment.trim() }) };
}

export const canChangeSetup = (fills: PeriodFill[]): boolean => fills.every(f => f.status === 'draft');

export function latestAction(actions: ReviewAction[], studentId: string, periodKey: string, kind?: ReviewAction['action']): ReviewAction | undefined {
  return actions
    .filter(a => a.studentId === studentId && a.periodKey === periodKey && (!kind || a.action === kind))
    .sort((a, b) => b.at.localeCompare(a.at))[0];
}

export function emptyRequired(placeholders: Placeholder[], values: Record<string, string>): Placeholder[] {
  return placeholders.filter(p => p.binding !== 'free' && p.binding !== 'signature' && !(values[p.id] ?? '').trim());
}

/** The boxes a resubmit changed: non-cover, non-signature answers whose trimmed text differs (missing counts as empty). */
export function changedSince(before: Record<string, string>, now: Record<string, string>, placeholders: Placeholder[]): Placeholder[] {
  return placeholders.filter(p => !isCoverField(p) && p.binding !== 'signature' && (before[p.id] ?? '').trim() !== (now[p.id] ?? '').trim());
}

/** A submit's copy, or null when it has none (demo weeks from before copies, or an old server body that gave {}). */
export const sentCopy = (a?: ReviewAction): Record<string, string> | null => (a?.values && Object.keys(a.values).length ? a.values : null);
