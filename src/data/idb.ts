import { openDB, type IDBPDatabase } from 'idb';
import type { InternMode, Journal, JournalDetails, NotepadEntry, PeriodFill, ReviewAction, Student, Template } from '../core/model';
import type { Repository } from './repository';
import { plain } from './plain';

const STORES = ['templates', 'students', 'notes', 'fills', 'actions', 'journal'] as const;

export class IdbRepository implements Repository {
  private dbp: Promise<IDBPDatabase> | null = null;
  constructor(private readonly name = 'intern-logbook') {}

  private db(): Promise<IDBPDatabase> {
    this.dbp ??= openDB(this.name, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('templates', { keyPath: 'id' });
          db.createObjectStore('students', { keyPath: 'id' });
          db.createObjectStore('notes', { keyPath: ['studentId', 'date'] }).createIndex('byStudent', 'studentId');
          db.createObjectStore('fills', { keyPath: ['studentId', 'periodKey'] }).createIndex('byStudent', 'studentId');
          db.createObjectStore('actions', { keyPath: 'id' }).createIndex('byStudent', 'studentId');
        }
        // The journal start date lives in the same store, under the date key 'start'.
        if (oldVersion < 2) db.createObjectStore('journal', { keyPath: ['owner', 'date'] }).createIndex('byOwner', 'owner');
      },
    });
    return this.dbp;
  }

  async listTemplates(): Promise<Template[]> { return (await this.db()).getAll('templates'); }
  async getTemplate(id: string): Promise<Template | undefined> { return (await this.db()).get('templates', id); }
  async putTemplate(t: Template): Promise<void> { await (await this.db()).put('templates', plain(t)); }
  async deleteTemplate(id: string): Promise<void> { await (await this.db()).delete('templates', id); }
  async listStudents(): Promise<Student[]> { return (await this.db()).getAll('students'); }
  async putStudent(s: Student): Promise<void> { await (await this.db()).put('students', plain(s)); }
  async getNotes(studentId: string): Promise<NotepadEntry[]> { return (await this.db()).getAllFromIndex('notes', 'byStudent', studentId); }
  async putNote(e: NotepadEntry): Promise<void> { await (await this.db()).put('notes', plain(e)); }
  async getJournal(owner: string): Promise<Journal> {
    const rows: { owner: string; date: string; text: string; details?: JournalDetails }[] = await (await this.db()).getAllFromIndex('journal', 'byOwner', owner);
    const start = rows.find(r => r.date === 'start');
    return {
      startDate: start?.text ?? null,
      ...(start?.details ?? {}),
      entries: rows.filter(r => r.date !== 'start').map(r => ({ date: r.date, text: r.text })).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
  async putJournalEntry(owner: string, date: string, text: string): Promise<void> {
    const db = await this.db();
    if (text.trim()) await db.put('journal', { owner, date, text });
    else await db.delete('journal', [owner, date]);
  }
  async setJournalStart(owner: string, date: string, details?: JournalDetails): Promise<void> {
    const db = await this.db();
    const old: { details?: JournalDetails } | undefined = await db.get('journal', [owner, 'start']);
    const merged = old?.details || details ? { details: { ...old?.details, ...details } } : {};
    await db.put('journal', plain({ owner, date: 'start', text: date, ...merged }));
  }
  async setMode(studentId: string, mode: InternMode): Promise<void> {
    const db = await this.db();
    const s: Student | undefined = await db.get('students', studentId);
    if (!s) throw new Error(`Unknown student ${studentId}`);
    await db.put('students', plain({ ...s, mode }));
  }
  async getFills(studentId?: string): Promise<PeriodFill[]> {
    const db = await this.db();
    return studentId ? db.getAllFromIndex('fills', 'byStudent', studentId) : db.getAll('fills');
  }
  async putFill(f: PeriodFill): Promise<void> { await (await this.db()).put('fills', plain(f)); }
  async listActions(studentId?: string): Promise<ReviewAction[]> {
    const db = await this.db();
    return studentId ? db.getAllFromIndex('actions', 'byStudent', studentId) : db.getAll('actions');
  }
  async addAction(a: ReviewAction): Promise<void> { await (await this.db()).put('actions', plain(a)); }
  async reset(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([...STORES], 'readwrite');
    await Promise.all([...STORES.map(s => tx.objectStore(s).clear()), tx.done]);
  }
}
