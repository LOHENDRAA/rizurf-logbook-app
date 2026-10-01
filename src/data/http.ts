import type { Journal, NotepadEntry, PeriodFill, PeriodStatus, Placeholder, ReviewAction, Student, Template } from '../core/model';
import type { Repository } from './repository';
import { newId } from '../core/ids';
import { api, apiBytes, ApiError, quote, type Me } from './api';

/** Shapes from appv3's step-2 API (see its plan's Interfaces blocks). */
export interface ApiWeek {
  weekNumber: number; periodKey: string; startDate: string; endDate: string;
  status: string; fillStatus: PeriodStatus; templateId: string | null;
  values: Record<string, string>; autofilled: Record<string, string>;
  version: string; submittedAt?: string;
  capabilities: { canEdit: boolean; canSubmit: boolean; canReview: boolean };
  dailyEntries: { date: string; body: string; updatedAt?: string }[];
  history: { id: string; action: ReviewAction['action']; by: string; signature?: string; comment?: string; at: string }[];
}
export interface ApiLogbook {
  student: {
    id: string; name: string; templateId: string | null; startDate: string | null; endDate: string | null;
    coverValues: Record<string, string>; version: string | null; canChangeSetup: boolean;
  };
  weeks: ApiWeek[];
}
export interface ApiTemplate {
  id: string; universityName: string; format?: 'docx' | 'pdf'; fileName?: string; placeholders?: Placeholder[];
  pageRoles?: Template['pageRoles'] | null; unitStartBlock?: number | null; version?: string; updatedAt?: string | null;
}

const toTemplate = (d: ApiTemplate, fileBytes: ArrayBuffer): Template => ({
  id: d.id,
  university: d.universityName,
  format: d.format ?? 'docx',
  fileName: d.fileName ?? '',
  fileBytes,
  period: 'weekly',
  pageRoles: d.pageRoles ?? undefined,
  unitStartBlock: d.unitStartBlock ?? undefined,
  placeholders: d.placeholders ?? [],
  updatedAt: d.updatedAt ?? '',
});

/** The screens' Repository on top of appv3's /api/v1. */
export class HttpRepository implements Repository {
  private books = new Map<string, ApiLogbook>();
  private loading: Promise<void> | null = null;
  private files = new Map<string, { version: string; template: Template }>();

  constructor(private readonly me: Me) {}

  private get supervisor(): boolean { return this.me.role === 'supervisor'; }

  /** One fetch of every logbook this person can see; readers in the same screen load share it. */
  private refresh(): Promise<void> {
    this.loading = (async () => {
      // ponytail: one request per intern; add a supervisor-wide endpoint if a company has more than a few dozen interns.
      const paths = this.supervisor
        ? (await api<{ data: { studentId: string }[] }>('supervisor/interns?per_page=100')).data.data.map(i => `supervisor/interns/${i.studentId}/logbook`)
        : ['me/logbook'];
      const books = await Promise.all(paths.map(p => api<ApiLogbook>(p)));
      this.books = new Map(books.map(({ data }) => [data.student.id, data]));
    })();
    return this.loading;
  }

  private async all(studentId?: string): Promise<ApiLogbook[]> {
    await (this.loading ?? this.refresh());
    return [...this.books.values()].filter(b => !studentId || b.student.id === studentId);
  }

  async listStudents(): Promise<Student[]> {
    await this.refresh();
    return [...this.books.values()].map(({ student: s }) => ({
      id: s.id,
      name: s.name,
      ...(s.templateId ? { templateId: s.templateId } : {}),
      ...(s.startDate ? { startDate: s.startDate } : {}),
      ...(s.endDate ? { endDate: s.endDate } : {}),
      coverValues: s.coverValues,
    }));
  }

  async getNotes(studentId: string): Promise<NotepadEntry[]> {
    return (await this.all(studentId)).flatMap(b => b.weeks.flatMap(w =>
      w.dailyEntries.map(d => ({ studentId: b.student.id, date: d.date, text: d.body, updatedAt: d.updatedAt ?? '' }))));
  }

  async getFills(studentId?: string): Promise<PeriodFill[]> {
    return (await this.all(studentId)).flatMap(b => b.weeks.filter(w => w.templateId).map(w => ({
      studentId: b.student.id,
      periodKey: w.periodKey,
      templateId: w.templateId!,
      values: w.values,
      autofilled: w.autofilled,
      status: w.fillStatus,
      ...(w.submittedAt ? { submittedAt: w.submittedAt } : {}),
    })));
  }

  async listActions(studentId?: string): Promise<ReviewAction[]> {
    return (await this.all(studentId)).flatMap(b => b.weeks.flatMap(w => w.history.map(h => ({
      id: h.id,
      studentId: b.student.id,
      periodKey: w.periodKey,
      action: h.action,
      by: h.by,
      ...(h.signature ? { signature: h.signature } : {}),
      ...(h.comment ? { comment: h.comment } : {}),
      at: h.at,
    }))));
  }

  /** A full template with its file, downloaded again only when its version changes. */
  private async full(detailPath: string): Promise<Template | undefined> {
    try {
      const { data, etag } = await api<ApiTemplate>(detailPath);
      const version = data.version ?? etag ?? '';
      const cached = this.files.get(data.id);
      if (cached?.version === version) return cached.template;
      const template = toTemplate(data, await apiBytes(`templates/${data.id}/file`));
      this.files.set(data.id, { version, template });
      return template;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return undefined;
      throw e;
    }
  }

  // ponytail: supervisors fetch every template on each list (files only when their version changes); fine for a handful of universities.
  async listTemplates(): Promise<Template[]> {
    const list = (await api<{ data: ApiTemplate[] }>('templates')).data.data;
    if (this.supervisor) {
      return (await Promise.all(list.map(t => this.full(`templates/${t.id}`)))).filter((t): t is Template => !!t);
    }
    // Interns only need the names (to pick their university) plus their own template in full.
    const own = await this.full('me/template');
    return list.map(t => (t.id === own?.id ? own : toTemplate(t, new ArrayBuffer(0))));
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    if (this.supervisor) return this.full(`templates/${id}`);
    return (await this.listTemplates()).find(t => t.id === id);
  }

  private weekOf(b: ApiLogbook, pick: (w: ApiWeek) => boolean): ApiWeek {
    const w = b.weeks.find(pick);
    if (!w) throw new Error("That day isn't part of your internship. Reload the page.");
    return w;
  }

  private async bookOf(studentId: string): Promise<ApiLogbook> {
    const [b] = await this.all(studentId);
    if (!b) throw new Error('That intern is no longer in your list. Reload the page.');
    return b;
  }

  async putStudent(s: Student): Promise<void> {
    const version = this.books.get(s.id)?.student.version;
    const { data } = await api<ApiLogbook>('me/internship', {
      method: 'PUT',
      body: { templateId: s.templateId, startDate: s.startDate, endDate: s.endDate, coverValues: s.coverValues },
      ifMatch: version ? quote(version) : undefined,
    });
    // Keep the cached weeks: a week saved while this was in flight may be newer than this snapshot.
    // A date change reloads everything anyway (the student store calls load() after setup).
    const cached = this.books.get(data.student.id);
    if (cached) cached.student = data.student;
    else this.books.set(data.student.id, data);
  }

  async putNote(e: NotepadEntry): Promise<void> {
    const w = this.weekOf(await this.bookOf(e.studentId), x => e.date >= x.startDate && e.date <= x.endDate);
    const { data } = await api<{ date: string; body: string; updatedAt?: string; version: string }>(
      `me/journal/weeks/${w.weekNumber}/daily`,
      { method: 'PUT', body: { date: e.date, body: e.text }, ifMatch: quote(w.version) },
    );
    w.version = data.version;
    w.dailyEntries = [...w.dailyEntries.filter(d => d.date !== data.date), { date: data.date, body: data.body, updatedAt: data.updatedAt }];
  }

  // The journal is always the signed-in person's own; the server takes no owner, so `_owner` is unused.
  async getJournal(_owner: string): Promise<Journal> { return (await api<Journal>('journal')).data; }
  async putJournalEntry(_owner: string, date: string, text: string): Promise<void> { await api(`journal/${date}`, { method: 'PUT', body: { text } }); }
  async setJournalStart(_owner: string, date: string): Promise<void> { await api('journal', { method: 'PUT', body: { startDate: date } }); }

  async putFill(f: PeriodFill): Promise<void> {
    // Only interns write answers. The stores also persist a fill with its new status just before addAction
    // (a supervisor's review included); the server changes status itself.
    if (this.supervisor || f.status === 'submitted' || f.status === 'approved') return;
    const w = this.weekOf(await this.bookOf(f.studentId), x => x.periodKey === f.periodKey);
    const { data } = await api<ApiWeek>(`me/journal/weeks/${w.weekNumber}/values`, {
      method: 'PUT',
      body: { templateId: f.templateId, values: f.values, autofilled: f.autofilled },
      ifMatch: quote(w.version),
    });
    Object.assign(w, data);
  }

  async addAction(a: ReviewAction): Promise<void> {
    const w = this.weekOf(await this.bookOf(a.studentId), x => x.periodKey === a.periodKey);
    const { data } = a.action === 'submit'
      ? await api<ApiWeek>(`me/journal/weeks/${w.weekNumber}/submit`, {
          method: 'POST', body: { version: w.version }, ifMatch: quote(w.version), idempotencyKey: newId('idem'),
        })
      : await api<ApiWeek>(`supervisor/interns/${a.studentId}/weeks/${w.weekNumber}/review`, {
          method: 'POST',
          // The server signs approvals with the signed-in supervisor's name; a signature from here would be ignored.
          body: a.action === 'approve' ? { decision: 'approve' } : { decision: 'request_changes', feedback: a.comment },
          ifMatch: quote(w.version),
          idempotencyKey: newId('idem'),
        });
    Object.assign(w, data);
  }

  async putTemplate(t: Template): Promise<void> {
    const known = this.files.get(t.id);
    if (known) {
      const { data } = await api<{ version: string }>(`templates/${t.id}`, {
        method: 'PUT',
        body: { universityName: t.university, placeholders: t.placeholders, pageRoles: t.pageRoles ?? null, unitStartBlock: t.unitStartBlock ?? null },
        ifMatch: quote(known.version),
      });
      this.files.set(t.id, { version: data.version, template: t });
      return;
    }
    // A template made in the editor has a local id; the server assigns its own and the list reloads after saving.
    const form = new FormData();
    form.append('file', new Blob([t.fileBytes]), t.fileName);
    form.append('universityName', t.university);
    form.append('placeholders', JSON.stringify(t.placeholders));
    if (t.pageRoles) form.append('pageRoles', JSON.stringify(t.pageRoles));
    if (t.unitStartBlock !== undefined) form.append('unitStartBlock', String(t.unitStartBlock));
    await api('templates', { method: 'POST', body: form });
  }

  async deleteTemplate(id: string): Promise<void> {
    const known = this.files.get(id);
    await api(`templates/${id}`, { method: 'DELETE', ifMatch: known ? quote(known.version) : undefined });
    this.files.delete(id);
  }

  async reset(): Promise<void> {
    throw new Error('Demo data only exists in the browser version.');
  }
}
