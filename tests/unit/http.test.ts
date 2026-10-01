import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpRepository, type ApiLogbook, type ApiWeek } from '../../src/data/http';
import type { PeriodFill, Template } from '../../src/core/model';

type Call = { method: string; path: string; headers: Record<string, string>; body: unknown };
let calls: Call[];
let routes: Record<string, (c: Call) => Response>;
const json = (status: number, body: unknown, etag?: string) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(etag ? { ETag: etag } : {}) } });

beforeEach(() => {
  calls = [];
  routes = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = { method: init.method ?? 'GET', path: url.replace(/^.*\/api\/v1\//, ''), headers: (init.headers ?? {}) as Record<string, string>, body: init.body };
    if (url.endsWith('/sanctum/csrf-cookie')) return new Response(null, { status: 204 });
    calls.push(c);
    const hit = routes[`${c.method} ${c.path}`];
    if (!hit) throw new Error(`unexpected ${c.method} ${c.path}`);
    return hit(c);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

const week = (n: number, over: Partial<ApiWeek> = {}): ApiWeek => ({
  weekNumber: n,
  periodKey: `w:2026-09-${String(14 + 7 * (n - 1)).padStart(2, '0')}`,
  startDate: `2026-09-${String(14 + 7 * (n - 1)).padStart(2, '0')}`,
  endDate: `2026-09-${String(20 + 7 * (n - 1)).padStart(2, '0')}`,
  status: 'not_started', fillStatus: 'draft', templateId: null, values: {}, autofilled: {},
  version: `v${n}-1`, capabilities: { canEdit: true, canSubmit: true, canReview: false },
  dailyEntries: [], history: [],
  ...over,
});

const book = (over: Partial<ApiLogbook['student']> = {}, weeks: ApiWeek[] = [week(1), week(2)]): ApiLogbook => ({
  student: { id: 'student-1', name: 'Aisha Rahman', templateId: 't1', startDate: '2026-09-14', endDate: '2026-09-27', coverValues: { name: 'Aisha' }, version: 'p-1', canChangeSetup: true, ...over },
  weeks,
});

const intern = () => new HttpRepository({ id: 'student-1', name: 'Aisha Rahman', role: 'student' });
const supervisor = () => new HttpRepository({ id: 'supervisor-1', name: 'Sarah Lim', role: 'supervisor' });

describe('HttpRepository reads', () => {
  it('maps an intern logbook onto Student, notes, fills and actions', async () => {
    routes['GET me/logbook'] = () => json(200, book({}, [
      week(1, {
        templateId: 't1', fillStatus: 'changes_requested', values: { a: 'x' }, autofilled: { a: 'x' }, submittedAt: '2026-09-19T02:00:00.000000Z',
        dailyEntries: [{ date: '2026-09-15', body: 'Set up laptop', updatedAt: '2026-09-15T01:00:00.000000Z' }],
        history: [
          { id: 's1', action: 'submit', by: 'Aisha Rahman', at: '2026-09-19T02:00:00.000000Z' },
          { id: 'r1', action: 'request_changes', by: 'Sarah Lim', comment: 'More detail', at: '2026-09-20T02:00:00.000000Z' },
        ],
      }),
      week(2),
    ]));
    const r = intern();

    expect(await r.listStudents()).toEqual([
      { id: 'student-1', name: 'Aisha Rahman', templateId: 't1', startDate: '2026-09-14', endDate: '2026-09-27', coverValues: { name: 'Aisha' } },
    ]);
    expect(await r.getNotes('student-1')).toEqual([
      { studentId: 'student-1', date: '2026-09-15', text: 'Set up laptop', updatedAt: '2026-09-15T01:00:00.000000Z' },
    ]);
    // Weeks never saved (templateId null) aren't fills; the screens treat a missing fill as a fresh draft.
    expect(await r.getFills('student-1')).toEqual([
      { studentId: 'student-1', periodKey: 'w:2026-09-14', templateId: 't1', values: { a: 'x' }, autofilled: { a: 'x' }, status: 'changes_requested', submittedAt: '2026-09-19T02:00:00.000000Z' },
    ]);
    expect(await r.listActions('student-1')).toEqual([
      { id: 's1', studentId: 'student-1', periodKey: 'w:2026-09-14', action: 'submit', by: 'Aisha Rahman', at: '2026-09-19T02:00:00.000000Z' },
      { id: 'r1', studentId: 'student-1', periodKey: 'w:2026-09-14', action: 'request_changes', by: 'Sarah Lim', comment: 'More detail', at: '2026-09-20T02:00:00.000000Z' },
    ]);
    expect(calls.filter(c => c.path === 'me/logbook')).toHaveLength(1);
  });

  it('an intern without a placement lists as a student with no dates', async () => {
    routes['GET me/logbook'] = () => json(200, book({ templateId: null, startDate: null, endDate: null, coverValues: {}, version: null }, []));

    expect(await intern().listStudents()).toEqual([{ id: 'student-1', name: 'Aisha Rahman', coverValues: {} }]);
  });

  it('a supervisor loads each intern logbook in the company', async () => {
    routes['GET supervisor/interns?per_page=100'] = () => json(200, { data: [{ studentId: 'student-1' }, { studentId: 'student-3' }], meta: {} });
    routes['GET supervisor/interns/student-1/logbook'] = () => json(200, book());
    routes['GET supervisor/interns/student-3/logbook'] = () => json(200, book({ id: 'student-3', name: 'Maya Chen' }));
    const r = supervisor();

    const [students, fills] = await Promise.all([r.listStudents(), r.getFills()]);

    expect(students.map(s => s.name)).toEqual(['Aisha Rahman', 'Maya Chen']);
    expect(fills).toEqual([]);
    expect(calls).toHaveLength(3); // the parallel getFills reused the same load
  });

  it('a supervisor gets full templates with their files, downloaded once per version', async () => {
    const detail = { id: 't1', universityName: 'UTM', format: 'docx', fileName: 'utm.docx', placeholders: [{ id: 'p1' }], pageRoles: null, unitStartBlock: 2, version: 'v-1', updatedAt: '2026-09-30T00:00:00+00:00' };
    routes['GET templates'] = () => json(200, { data: [{ id: 't1', universityName: 'UTM', format: 'docx', version: 'v-1' }] });
    routes['GET templates/t1'] = () => json(200, detail, '"v-1"');
    routes['GET templates/t1/file'] = () => new Response(new Uint8Array([1, 2, 3]));
    const r = supervisor();

    const [t] = await r.listTemplates();
    await r.listTemplates();

    expect(t).toMatchObject({ id: 't1', university: 'UTM', format: 'docx', fileName: 'utm.docx', period: 'weekly', unitStartBlock: 2, placeholders: [{ id: 'p1' }] });
    expect(t.pageRoles).toBeUndefined();
    expect(new Uint8Array(t.fileBytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls.filter(c => c.path === 'templates/t1/file')).toHaveLength(1);
  });

  it('an intern sees every university but only their own template in full', async () => {
    routes['GET templates'] = () => json(200, { data: [{ id: 't1', universityName: 'UTM' }, { id: 't2', universityName: 'Taylor’s' }] });
    routes['GET me/template'] = () => json(200, { id: 't1', universityName: 'UTM', format: 'pdf', fileName: 'utm.pdf', placeholders: [], pageRoles: ['unit'], unitStartBlock: null, version: 'v-1', updatedAt: null }, '"v-1"');
    routes['GET templates/t1/file'] = () => new Response(new Uint8Array([9]));
    const r = intern();

    const list = await r.listTemplates();
    const other = await r.getTemplate('t2');

    expect(list.map(t => [t.id, t.university, t.fileBytes.byteLength])).toEqual([['t1', 'UTM', 1], ['t2', 'Taylor’s', 0]]);
    expect(other).toMatchObject({ id: 't2', university: 'Taylor’s', placeholders: [] });
  });

  it('an intern with no template yet still gets the list', async () => {
    routes['GET templates'] = () => json(200, { data: [{ id: 't1', universityName: 'UTM' }] });
    routes['GET me/template'] = () => json(404, { error: { code: 'RESOURCE_NOT_FOUND', message: 'Not found', correlation_id: 'c', details: null } });

    expect((await intern().listTemplates()).map(t => t.id)).toEqual(['t1']);
  });
});

const fill = (over: Partial<PeriodFill> = {}): PeriodFill =>
  ({ studentId: 'student-1', periodKey: 'w:2026-09-14', templateId: 't1', values: { a: 'x' }, autofilled: {}, status: 'draft', ...over });

async function loadedIntern(weeks = [week(1), week(2)]) {
  routes['GET me/logbook'] = () => json(200, book({}, weeks));
  const r = intern();
  await r.listStudents();
  return r;
}

async function loadedSupervisor() {
  routes['GET supervisor/interns?per_page=100'] = () => json(200, { data: [{ studentId: 'student-1' }] });
  routes['GET supervisor/interns/student-1/logbook'] = () => json(200, book());
  const r = supervisor();
  await r.listStudents();
  return r;
}

describe('HttpRepository writes', () => {
  it('putNote writes to the week holding the date and keeps its new version', async () => {
    const r = await loadedIntern();
    let n = 1;
    routes['PUT me/journal/weeks/2/daily'] = c => json(200, { date: '2026-09-22', body: JSON.parse(c.body as string).body, updatedAt: 't', version: `v2-${++n}` });

    await r.putNote({ studentId: 'student-1', date: '2026-09-22', text: 'first', updatedAt: '' });
    await r.putNote({ studentId: 'student-1', date: '2026-09-22', text: 'second', updatedAt: '' });

    const puts = calls.filter(c => c.method === 'PUT');
    expect(puts.map(c => c.headers['If-Match'])).toEqual(['"v2-1"', '"v2-2"']);
    expect(JSON.parse(puts[1].body as string)).toEqual({ date: '2026-09-22', body: 'second' });
    expect((await r.getNotes('student-1')).map(e => e.text)).toEqual(['second']);
  });

  it('putNote refuses a date outside the internship', async () => {
    const r = await loadedIntern();

    await expect(r.putNote({ studentId: 'student-1', date: '2026-12-01', text: 'x', updatedAt: '' }))
      .rejects.toThrow("That day isn't part of your internship. Reload the page.");
  });

  it('putFill saves answers with If-Match and caches the returned week', async () => {
    const r = await loadedIntern();
    routes['PUT me/journal/weeks/1/values'] = () => json(200, week(1, { templateId: 't1', values: { a: 'x' }, version: 'v1-2' }));

    await r.putFill(fill());

    const put = calls.find(c => c.method === 'PUT')!;
    expect(put.headers['If-Match']).toBe('"v1-1"');
    expect(JSON.parse(put.body as string)).toEqual({ templateId: 't1', values: { a: 'x' }, autofilled: {} });
    expect(await r.getFills('student-1')).toMatchObject([{ periodKey: 'w:2026-09-14', values: { a: 'x' } }]);
  });

  it('putFill leaves status changes to addAction', async () => {
    const r = await loadedIntern();

    await r.putFill(fill({ status: 'submitted' }));
    await r.putFill(fill({ status: 'approved' }));

    expect(calls.filter(c => c.method !== 'GET')).toEqual([]);
  });

  it('putFill surfaces a stale-version 412 as a readable error', async () => {
    const r = await loadedIntern();
    routes['PUT me/journal/weeks/1/values'] = () => json(412, { error: { code: 'STALE_VERSION', message: 'This item changed elsewhere. Compare and retry.', correlation_id: 'c', details: null } });

    await expect(r.putFill(fill())).rejects.toThrow('This was changed in another tab or by someone else.');
    expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1); // never retried
  });

  it('submit sends the week version with an idempotency key', async () => {
    const r = await loadedIntern();
    routes['POST me/journal/weeks/1/submit'] = () => json(200, week(1, { fillStatus: 'submitted', version: 'v1-2' }));

    await r.addAction({ id: 'a1', studentId: 'student-1', periodKey: 'w:2026-09-14', action: 'submit', by: 'Aisha', at: '' });

    const post = calls.find(c => c.method === 'POST')!;
    expect(JSON.parse(post.body as string)).toEqual({ version: 'v1-1' });
    expect(post.headers['Idempotency-Key']).toMatch(/^idem_/);
  });

  it('a supervisor approves without sending a signature', async () => {
    const r = await loadedSupervisor();
    routes['POST supervisor/interns/student-1/weeks/1/review'] = () => json(200, week(1, { fillStatus: 'approved' }));

    await r.addAction({ id: 'a2', studentId: 'student-1', periodKey: 'w:2026-09-14', action: 'approve', by: 'Supervisor', signature: 'Forged', at: '' });

    const post = calls.find(c => c.method === 'POST')!;
    expect(JSON.parse(post.body as string)).toEqual({ decision: 'approve' });
    expect(post.headers['If-Match']).toBe('"v1-1"');
  });

  it('request_changes sends the comment as feedback', async () => {
    const r = await loadedSupervisor();
    routes['POST supervisor/interns/student-1/weeks/2/review'] = () => json(200, week(2, { fillStatus: 'changes_requested' }));

    await r.addAction({ id: 'a3', studentId: 'student-1', periodKey: 'w:2026-09-21', action: 'request_changes', by: 'Supervisor', comment: 'More detail', at: '' });

    expect(JSON.parse(calls.find(c => c.method === 'POST')!.body as string)).toEqual({ decision: 'request_changes', feedback: 'More detail' });
  });

  it('putStudent creates the placement without If-Match, then updates with it', async () => {
    routes['GET me/logbook'] = () => json(200, book({ templateId: null, startDate: null, endDate: null, version: null }, []));
    routes['PUT me/internship'] = () => json(200, book({ version: 'p-2' }));
    const r = intern();
    await r.listStudents();
    const s = { id: 'student-1', name: 'Aisha Rahman', templateId: 't1', startDate: '2026-09-14', endDate: '2026-09-27', coverValues: { name: 'Aisha' } };

    await r.putStudent(s);
    await r.putStudent({ ...s, coverValues: { name: 'Aisha R.' } });

    const puts = calls.filter(c => c.method === 'PUT');
    expect(puts.map(c => c.headers['If-Match'])).toEqual([undefined, '"p-2"']);
    expect(JSON.parse(puts[1].body as string)).toEqual({ templateId: 't1', startDate: '2026-09-14', endDate: '2026-09-27', coverValues: { name: 'Aisha R.' }, position: '', programmeName: '' });
  });

  it('putTemplate uploads a new template as multipart and edits a known one as JSON', async () => {
    const r = supervisor();
    const t: Template = { id: 'tpl_local', university: 'UTM', format: 'docx', fileName: 'utm.docx', fileBytes: new Uint8Array([1]).buffer, period: 'weekly', unitStartBlock: 0, placeholders: [], updatedAt: '' };
    routes['POST templates'] = () => json(201, { id: 'srv-1' });

    await r.putTemplate(t);

    const form = calls[0].body as FormData;
    expect(form.get('universityName')).toBe('UTM');
    expect(form.get('unitStartBlock')).toBe('0');
    expect(form.get('placeholders')).toBe('[]');
    expect((form.get('file') as File).name).toBe('utm.docx');

    routes['GET templates'] = () => json(200, { data: [{ id: 'srv-1', universityName: 'UTM' }] });
    routes['GET templates/srv-1'] = () => json(200, { id: 'srv-1', universityName: 'UTM', format: 'docx', fileName: 'utm.docx', placeholders: [], pageRoles: null, unitStartBlock: 0, version: 'v-1' });
    routes['GET templates/srv-1/file'] = () => new Response(new Uint8Array([1]));
    routes['PUT templates/srv-1'] = () => json(200, { id: 'srv-1', version: 'v-2' });
    routes['DELETE templates/srv-1'] = () => new Response(null, { status: 204 });
    const [known] = await r.listTemplates();

    await r.putTemplate({ ...known, university: 'UTM Johor' });
    await r.deleteTemplate('srv-1');

    const put = calls.find(c => c.method === 'PUT')!;
    expect(put.headers['If-Match']).toBe('"v-1"');
    expect(JSON.parse(put.body as string)).toEqual({ universityName: 'UTM Johor', placeholders: [], pageRoles: null, unitStartBlock: 0 });
    expect(calls.find(c => c.method === 'DELETE')!.headers['If-Match']).toBe('"v-2"');
  });

  it('a supervisor never writes answers, even when requesting changes', async () => {
    const r = await loadedSupervisor();

    await r.putFill(fill({ status: 'changes_requested' }));

    expect(calls.filter(c => c.method !== 'GET')).toEqual([]);
  });

  it('saving the cover keeps the newer week versions already cached', async () => {
    const r = await loadedIntern();
    let v = 1;
    routes['PUT me/journal/weeks/1/values'] = () => json(200, week(1, { templateId: 't1', version: `v1-${++v}` }));
    // A snapshot read before the week save committed still says v1-1.
    routes['PUT me/internship'] = () => json(200, book({ version: 'p-2' }));

    await r.putFill(fill());
    await r.putStudent({ id: 'student-1', name: 'Aisha Rahman', templateId: 't1', startDate: '2026-09-14', endDate: '2026-09-27', coverValues: { name: 'A' } });
    await r.putFill(fill());

    expect(calls.filter(c => c.path === 'me/journal/weeks/1/values').map(c => c.headers['If-Match'])).toEqual(['"v1-1"', '"v1-2"']);
  });

  it('reset is only for the browser version', async () => {
    await expect(intern().reset()).rejects.toThrow('Demo data only exists in the browser version.');
  });
});

describe('HttpRepository journal', () => {
  it('reads, saves a day and sets the start, always as the signed-in person', async () => {
    routes['GET journal'] = () => json(200, { startDate: null, entries: [{ date: '2026-09-21', text: 'Hi' }] });
    routes['PUT journal/2026-09-21'] = () => new Response(null, { status: 204 });
    routes['PUT journal'] = () => new Response(null, { status: 204 });
    const r = intern();
    expect(await r.getJournal('ignored')).toEqual({ startDate: null, entries: [{ date: '2026-09-21', text: 'Hi' }] });
    await r.putJournalEntry('ignored', '2026-09-21', 'Hello');
    await r.setJournalStart('ignored', '2026-08-03');
    expect(calls.map(c => [c.method, c.path, c.body])).toEqual([
      ['GET', 'journal', undefined],
      ['PUT', 'journal/2026-09-21', JSON.stringify({ text: 'Hello' })],
      ['PUT', 'journal', JSON.stringify({ startDate: '2026-08-03' })],
    ]);
  });
});

describe('HttpRepository profile and mode', () => {
  it('maps the profile onto the student and switches mode', async () => {
    routes['GET me/logbook'] = () => json(200, {
      ...book(),
      profile: { email: 'a@x', mode: 'journal', companyName: 'Nusantara', timeZone: 'Asia/Kuala_Lumpur', position: 'Intern', programme: 'BSc', supervisors: [{ name: 'Sarah', email: 's@x' }] },
    }, '"p-1"');
    routes['PUT me/mode'] = () => new Response(null, { status: 204 });
    const r = intern();
    expect((await r.listStudents())[0]).toMatchObject({
      email: 'a@x', mode: 'journal', company: 'Nusantara', timeZone: 'Asia/Kuala_Lumpur', position: 'Intern', programme: 'BSc', supervisors: [{ name: 'Sarah', email: 's@x' }],
    });
    await r.setMode('student-1', 'logbook');
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', path: 'me/mode', body: JSON.stringify({ mode: 'logbook' }) });
  });
  it('sends position and programme with the internship', async () => {
    routes['GET me/logbook'] = () => json(200, book(), '"p-1"');
    routes['PUT me/internship'] = () => json(200, book({ version: 'p-2' }));
    const r = intern();
    const [s] = await r.listStudents();
    await r.putStudent({ ...s, position: 'Data Intern', programme: 'BSc DS' });
    expect(JSON.parse(String(calls.at(-1)!.body))).toMatchObject({ position: 'Data Intern', programmeName: 'BSc DS' });
  });
});
