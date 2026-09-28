import type { Student } from '../core/model';
import type { Repository } from './repository';

export const DEMO_STUDENTS: Student[] = [
  { id: 'student-aina', name: 'Aina Rahman', coverValues: {} },
  { id: 'student-daniel', name: 'Daniel Lim', coverValues: {} },
];

export async function ensureSeed(r: Repository): Promise<void> {
  const existing = new Set((await r.listStudents()).map(s => s.id));
  for (const s of DEMO_STUDENTS) if (!existing.has(s.id)) await r.putStudent({ ...s, coverValues: {} });
}

export async function resetDemoData(r: Repository): Promise<void> {
  await r.reset();
  await ensureSeed(r);
}
