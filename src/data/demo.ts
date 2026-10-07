import type { Item, Student, Template } from '../core/model';
import { newId } from '../core/ids';
import type { Repository } from './repository';
import { detectFromFile } from '../core/template';
import { buildPeriods } from '../core/periods';
import { autofill, isCoverField } from '../core/autofill';
import { approveFill, emptyFill, requestChangesFill, submitFill } from '../core/workflow';
import { addDays, eachDay, isWeekend, mondayOf, todayISO } from '../core/dates';
import { resetDemoData } from './seed';

const NOTES = [
  'Set up the ERP gateway dev environment and ran the test suite.',
  'Fixed a login redirect bug and wrote a unit test for it.',
  'Joined sprint planning; took the invoice export ticket.',
  'Built the invoice export endpoint and tested it with Postman.',
  'Pair-reviewed a teammate’s PR and updated the API docs.',
];

// The single-file preview can't fetch files from disk, so it carries the templates inside as data: URLs.
const INLINE = import.meta.glob<string>('../../public/demo/*.docx', { query: '?inline', import: 'default' });

async function loadTemplate(id: string, university: string, file: string): Promise<Template> {
  const url = import.meta.env.MODE === 'single' ? await INLINE[`../../public/demo/${file}`]() : `${import.meta.env.BASE_URL}demo/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load demo template ${file}`);
  const d = await detectFromFile({ name: file, arrayBuffer: () => res.arrayBuffer() });
  return {
    id, university, format: d.format, fileName: file, fileBytes: d.bytes, period: 'weekly',
    pageRoles: d.pageRoles, unitStartBlock: d.unitStartBlock, placeholders: d.placeholders, updatedAt: new Date().toISOString(),
  };
}

/** Reviewed suggestions for the matching NOTES line; null leaves that day for the intern to organize. */
const DEMO_ORG: ({ project: 0 | 1; activity: string; learning?: string; skill: string } | null)[] = [
  { project: 0, activity: 'Set up the ERP gateway dev environment', learning: 'How the gateway test suite is organised', skill: 'Environment setup' },
  { project: 0, activity: 'Fixed a login redirect bug', learning: 'Writing a failing test before the fix', skill: 'Unit testing' },
  { project: 1, activity: 'Joined sprint planning and took the invoice export ticket', skill: 'Agile planning' },
  { project: 1, activity: 'Built the invoice export endpoint', learning: 'Testing an API with Postman', skill: 'API development' },
  null,
];

/** Wipes the demo and fills it: two real templates, both students ~3 weeks in, periods in every review state. */
export async function loadDemoData(r: Repository): Promise<void> {
  await resetDemoData(r);
  const templates = [
    await loadTemplate('tpl-taylors', "Taylor's University", 'taylors.docx'),
    await loadTemplate('tpl-apu', 'Asia Pacific University', 'apu.docx'),
  ];
  for (const t of templates) await r.putTemplate(t);

  const start = addDays(mondayOf(todayISO()), -21);
  const end = addDays(start, 83);
  const setups: [string, string, Template][] = [['student-aina', 'Aina Rahman', templates[0]], ['student-daniel', 'Daniel Lim', templates[1]]];

  for (const [id, name, t] of setups) {
    const notes: Record<string, string> = {};
    const days = eachDay(start, addDays(todayISO(), -1)).filter(d => !isWeekend(d));
    days.forEach((d, i) => { notes[d] = NOTES[i % NOTES.length]; });
    for (const [date, text] of Object.entries(notes)) await r.putJournalEntry(id, date, text);

    const projects = [
      await r.createProject(id, { name: 'ERP gateway', description: 'Sign-in and shared services for the micro-apps.' }),
      await r.createProject(id, { name: 'Invoice export', description: null }),
    ];
    for (const [i, date] of days.entries()) {
      const o = DEMO_ORG[i % DEMO_ORG.length];
      if (!o) continue;
      const items: Item[] = [
        { kind: 'project' as const, text: projects[o.project].name },
        { kind: 'activity' as const, text: o.activity },
        ...(o.learning ? [{ kind: 'learning' as const, text: o.learning }] : []),
        { kind: 'skill' as const, text: o.skill },
      ].map(x => ({ ...x, id: newId('item'), status: 'accepted' as const }));
      await r.putOrganization(id, date, { projectId: projects[o.project].id, items });
    }
    await r.putReflection(id, addDays(mondayOf(todayISO()), -7), 'Testing the export endpoint early saved me a day of fixes. Next week: ask for a code review sooner.');

    const coverValues: Record<string, string> = {};
    const cover = (label: string) =>
      /company|organi[sz]ation|employer/i.test(label) ? 'Rizurf Sdn Bhd'
        : /\bid\b|matric/i.test(label) ? (id === 'student-aina' ? 'TP071234' : 'TP072345')
        : /university|institution/i.test(label) ? t.university
        : /programme|program|course/i.test(label) ? 'BSc (Hons) Software Engineering'
        : /period|duration/i.test(label) ? `${start} to ${end}`
        : /name/i.test(label) ? name : '';
    for (const ph of t.placeholders) if (isCoverField(ph) && ph.binding !== 'signature') coverValues[ph.id] = cover(ph.label);
    const student: Student = { id, name, templateId: t.id, startDate: start, endDate: end, coverValues };
    await r.putStudent(student);

    // Week 1 approved, week 2 sent back with a comment, week 3 waiting for review, week 4 (current) draft.
    const periods = buildPeriods(t.period, start, end).slice(0, 3);
    for (const [i, p] of periods.entries()) {
      let fill = emptyFill(id, p.key, t.id);
      const auto = autofill(t.placeholders, p, notes, {}, {});
      fill = { ...fill, values: auto.values, autofilled: auto.autofilled };
      const sub = submitFill(fill, name);
      await r.addAction(sub.action);
      fill = sub.fill;
      if (i === 0) { const a = approveFill(fill, 'Supervisor', 'Nur Aziz'); fill = a.fill; await r.addAction(a.action); }
      if (i === 1) { const c = requestChangesFill(fill, 'Supervisor', 'Please add which tools you used each day.'); fill = c.fill; await r.addAction(c.action); }
      await r.putFill(fill);
    }
  }
}
