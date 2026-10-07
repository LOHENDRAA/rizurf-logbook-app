import { openDB, type IDBPDatabase } from 'idb';
import type {
  InternMode, Item, Journal, JournalDetails, Organization, OrganizationInput, PeriodFill, Project, ProjectInput, ReviewAction, Student, Suggestions, Template,
} from '../core/model';
import type { Repository } from './repository';
import { plain } from './plain';
import { newId } from '../core/ids';
import { nameKey, standIn } from '../core/organize';

const STORES = ['templates', 'students', 'fills', 'actions', 'journal', 'projects', 'reflections'] as const;

type JournalRow = { owner: string; date: string; text: string; details?: JournalDetails; projectId?: string | null; items?: Item[] };
type ProjectRow = Project & { owner: string };
const NO_ENTRY = "There's no entry for that day yet.";

export class IdbRepository implements Repository {
  private dbp: Promise<IDBPDatabase> | null = null;
  constructor(private readonly name = 'intern-logbook') {}

  private db(): Promise<IDBPDatabase> {
    this.dbp ??= openDB(this.name, 5, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore('templates', { keyPath: 'id' });
          db.createObjectStore('students', { keyPath: 'id' });
          db.createObjectStore('fills', { keyPath: ['studentId', 'periodKey'] }).createIndex('byStudent', 'studentId');
          db.createObjectStore('actions', { keyPath: 'id' }).createIndex('byStudent', 'studentId');
        }
        // The journal start date lives in the same store, under the date key 'start'.
        if (oldVersion < 2) db.createObjectStore('journal', { keyPath: ['owner', 'date'] }).createIndex('byOwner', 'owner');
        // Version 3: one set of entries per person. Old notes join the owner's journal (same day: journal text, blank line, note).
        if (oldVersion >= 1 && oldVersion < 3) {
          const journal = tx.objectStore('journal');
          const [notes, rows] = await Promise.all([
            tx.objectStore('notes').getAll() as Promise<{ studentId: string; date: string; text: string }[]>,
            journal.getAll() as Promise<{ owner: string; date: string; text: string }[]>,
          ]);
          const have = new Map(rows.map(r => [`${r.owner}|${r.date}`, r.text]));
          for (const n of notes) {
            if (!n.text.trim()) continue;
            const old = have.get(`${n.studentId}|${n.date}`);
            void journal.put({ owner: n.studentId, date: n.date, text: old ? `${old.trimEnd()}\n\n${n.text.trim()}` : n.text.trim() });
          }
          db.deleteObjectStore('notes');
        }
        // Version 4: an intern's own projects (AI organising). Journal rows simply gain projectId/items when organized.
        if (oldVersion < 4) db.createObjectStore('projects', { keyPath: ['owner', 'id'] }).createIndex('byOwner', 'owner');
        // Version 5: interns' private weekly reflections.
        if (oldVersion < 5) db.createObjectStore('reflections', { keyPath: ['owner', 'week'] }).createIndex('byOwner', 'owner');
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
  async getJournal(owner: string): Promise<Journal> {
    const db = await this.db();
    const rows: JournalRow[] = await db.getAllFromIndex('journal', 'byOwner', owner);
    const projects: ProjectRow[] = await db.getAllFromIndex('projects', 'byOwner', owner);
    const reflections: { week: string; text: string }[] = await db.getAllFromIndex('reflections', 'byOwner', owner);
    const start = rows.find(r => r.date === 'start');
    return {
      startDate: start?.text ?? null,
      ...(start?.details ?? {}),
      entries: rows.filter(r => r.date !== 'start')
        .map(r => ({ date: r.date, text: r.text, ...(r.items ? { projectId: r.projectId ?? null, items: r.items } : {}) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      projects: projects.map(({ id, name, description }) => ({ id, name, description })).sort((a, b) => a.name.localeCompare(b.name)),
      reflections: reflections.map(({ week, text }) => ({ week, text })).sort((a, b) => a.week.localeCompare(b.week)),
    };
  }
  async putJournalEntry(owner: string, date: string, text: string): Promise<void> {
    const db = await this.db();
    if (!text.trim()) { await db.delete('journal', [owner, date]); return; }
    const old: JournalRow | undefined = await db.get('journal', [owner, date]);
    await db.put('journal', plain({ ...old, owner, date, text })); // typing keeps the day's project and items
  }
  async organize(owner: string, date: string): Promise<Suggestions> {
    const j = await this.getJournal(owner);
    const entry = j.entries.find(e => e.date === date);
    if (!entry) throw new Error(NO_ENTRY);
    return standIn(entry.text, j.projects ?? [], Object.fromEntries(j.entries.map(e => [e.date, { projectId: e.projectId ?? null }])));
  }
  async putOrganization(owner: string, date: string, input: OrganizationInput): Promise<Organization> {
    const db = await this.db();
    const old: JournalRow | undefined = await db.get('journal', [owner, date]);
    if (!old) throw new Error(NO_ENTRY);
    const name = input.newProjectName?.trim();
    let projectId = input.projectId;
    if (name) projectId = (await this.findProject(owner, name))?.id ?? (await this.createProject(owner, { name })).id;
    else if (projectId && !(await db.get('projects', [owner, projectId]))) throw new Error("That project isn't one of yours.");
    await db.put('journal', plain({ ...old, projectId, items: input.items }));
    return { projectId, items: input.items, projects: (await this.getJournal(owner)).projects ?? [] };
  }
  private async findProject(owner: string, name: string): Promise<ProjectRow | undefined> {
    const all: ProjectRow[] = await (await this.db()).getAllFromIndex('projects', 'byOwner', owner);
    return all.find(p => nameKey(p.name) === nameKey(name));
  }
  private async checkName(owner: string, name: string, self?: string): Promise<string> {
    const n = name.trim();
    if (!n) throw new Error('Give the project a name.');
    const clash = await this.findProject(owner, n);
    if (clash && clash.id !== self) throw new Error(`You already have a project called ${n}.`);
    return n;
  }
  async createProject(owner: string, p: ProjectInput): Promise<Project> {
    const project = { id: newId('project'), name: await this.checkName(owner, p.name), description: p.description?.trim() || null };
    await (await this.db()).put('projects', { owner, ...project });
    return project;
  }
  async updateProject(owner: string, id: string, p: ProjectInput): Promise<Project> {
    const db = await this.db();
    const old: ProjectRow | undefined = await db.get('projects', [owner, id]);
    if (!old) throw new Error("That project doesn't exist.");
    const project = { id, name: await this.checkName(owner, p.name, id), description: p.description === undefined ? old.description : p.description?.trim() || null };
    await db.put('projects', { owner, ...project });
    return project;
  }
  async deleteProject(owner: string, id: string): Promise<void> {
    const db = await this.db();
    const rows: JournalRow[] = await db.getAllFromIndex('journal', 'byOwner', owner);
    if (rows.some(r => r.projectId === id)) throw new Error('Entries still use this project. Move them first.');
    await db.delete('projects', [owner, id]);
  }
  async putReflection(owner: string, week: string, text: string): Promise<void> {
    const db = await this.db();
    const t = text.trim();
    if (t) await db.put('reflections', { owner, week, text: t });
    else await db.delete('reflections', [owner, week]);
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
