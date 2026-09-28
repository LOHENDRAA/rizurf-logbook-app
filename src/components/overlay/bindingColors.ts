import type { Binding } from '../../core/model';

export const BINDING_META: Record<Binding, { label: string; color: string }> = {
  cover: { label: 'Cover (filled once)', color: '#2563eb' },
  daily: { label: 'Daily activity (notepad)', color: '#16a34a' },
  period: { label: 'Period answer', color: '#9333ea' },
  date: { label: 'Date', color: '#ea580c' },
  free: { label: 'Free text', color: '#64748b' },
  signature: { label: 'Supervisor signature', color: '#dc2626' },
};
