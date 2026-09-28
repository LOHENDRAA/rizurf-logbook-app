import type { NotepadEntry, PeriodFill, ReviewAction, Student, Template } from '../core/model';
import { IdbRepository } from './idb';

/** The one seam between the app and storage. The Laravel version swaps this for REST calls. */
export interface Repository {
  listTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  putTemplate(t: Template): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  listStudents(): Promise<Student[]>;
  putStudent(s: Student): Promise<void>;
  getNotes(studentId: string): Promise<NotepadEntry[]>;
  putNote(e: NotepadEntry): Promise<void>;
  getFills(studentId?: string): Promise<PeriodFill[]>;
  putFill(f: PeriodFill): Promise<void>;
  listActions(studentId?: string): Promise<ReviewAction[]>;
  addAction(a: ReviewAction): Promise<void>;
  reset(): Promise<void>;
}

let current: Repository | null = null;
export function repo(): Repository {
  current ??= new IdbRepository();
  return current;
}
export function setRepository(r: Repository): void {
  current = r;
}
