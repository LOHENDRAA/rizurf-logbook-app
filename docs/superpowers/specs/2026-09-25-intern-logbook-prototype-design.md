# Intern Logbook — Phase 1 Front-End Prototype: Design

Date: 2026-09-25
Status: Approved in brainstorming, awaiting written-spec review

## 1. Purpose

A front-end-only prototype used to test the intern logbook workflow end to end before building the real version inside Rizurf's ERP gateway (Laravel, run locally on XAMPP). There is no backend or database. All data lives in the browser. The prototype is a fresh rebuild. The existing v14 app (`Rizurf_Logbook/app/index.html`) is a reference only. Its detection and fill logic is ported, but none of its UI or data model is carried over.

**Success criteria:** in one browser, a tester can do all of the following:

1. As supervisor, upload a university's Word or PDF template, review the highlighted placeholders, correct them, add any that were missed, and save the template under the university's name.
2. As a student, pick that university, write daily notepad entries that autosave, build a period in the logbook builder (auto-filled from the notepad, with a live preview), and submit it.
3. As supervisor, approve a period or request changes on it.
4. As a student, export the approved periods as a filled file in the template's original format.

## 2. Decisions

| Topic | Decision |
|---|---|
| Stack | Vite + Vue 3 + TypeScript + Pinia + Vue Router |
| Hosting | `npm run dev` for development. `npm run build` outputs to `C:\xampp\htdocs\intern-logbook\` (Vite `base: '/intern-logbook/'`), served by Apache. |
| Persistence | IndexedDB, through a `Repository` interface. This is the seam that gets replaced with REST later. |
| Auth | None. A header role switcher lists "Supervisor" plus the seeded demo students. |
| Template formats | Both .docx and .pdf |
| Placeholder detection | Explicit markers first, then blanks beside labels (ported from v14), then manual additions |
| Notepad → builder | Auto-fill from the notepad according to each placeholder's binding. The student edits the result. |
| Review unit | The template's period: daily, weekly or monthly, set by the supervisor |
| Template assignment | The student picks their university and enters start/end dates |
| Export format | Same format as the uploaded template |
| Location | `Downloads/Rizurf_Logbook/intern-logbook/`, its own git repo |

Vue was chosen over React because Laravel pairs natively with Vue (Inertia), so the components can move into the gateway later.

## 3. Architecture

```
intern-logbook/
  src/
    core/            pure TypeScript, no Vue/DOM-framework imports
      model.ts       shared types (section 4)
      detect/
        markers.ts   explicit-marker detection over text runs
        docx.ts      docx XML → DetectedTemplate
        pdf.ts       pdf.js text items → DetectedTemplate
      fill/
        docx.ts      template + values → .docx Blob
        pdf.ts       template + values → .pdf Blob
      periods.ts     (start, end, period kind) → Period[]
      autofill.ts    (placeholders, period, notepad entries) → values
    data/
      repository.ts  Repository interface
      idb.ts         IndexedDB implementation (via the `idb` package)
      seed.ts        demo students; resets demo data
    stores/          Pinia: session, templates, student, review
    views/
      supervisor/    TemplatesList, TemplateEditor, ReviewQueue, ReviewDetail
      student/       Onboarding, Notepad, Builder, Export
    components/
      overlay/       TemplateOverlay, PdfPageLayer, DocxLayer, PlaceholderBox
      PlaceholderInspector, PeriodList, StatusBadge, Toast
  tests/
    unit/            Vitest
    e2e/             Playwright
    fixtures/        APU, Taylor's and PMU templates copied from v14 `templates/`
```

**Boundaries**
- `core/` has no dependency on Vue, Pinia or IndexedDB. It takes bytes and plain objects and returns plain objects and Blobs, so it can later run in Node or be rewritten for the server side without touching the UI.
- Views reach data only through Pinia stores, and stores reach data only through `Repository`. Swapping `idb.ts` for a REST implementation must not require changes outside `data/`.
- Browser libraries: `pdfjs-dist` (render + text extraction), `pdf-lib` (PDF fill), `jszip` (docx read/write), `docx-preview` (docx rendering in the editor/preview), `idb`.

## 4. Data model

```ts
type Format = 'docx' | 'pdf';
type PeriodKind = 'daily' | 'weekly' | 'monthly';
type Binding = 'cover' | 'daily' | 'period' | 'date' | 'free' | 'signature';
type Source = 'marker' | 'label' | 'manual';

type PdfAnchor  = { kind: 'pdf'; page: number; x: number; y: number; w: number; h: number }; // PDF points, origin bottom-left
type DocxAnchor =
  | { kind: 'docx-cell'; table: number[]; row: number; col: number }   // table = path of indices, e.g. [3] or [3, 0] for one nested level
  | { kind: 'docx-text'; paragraph: number; start: number; end: number }; // body paragraph index + char range of joined run text

interface Placeholder {
  id: string;             // stable across edits
  label: string;          // e.g. "Student Name", "Monday – Task"
  binding: Binding;
  dayIndex?: number;      // for 'daily' and per-day 'date': nth weekday within the period, 0-based
  source: Source;
  region: 'cover' | 'unit';
  anchor: PdfAnchor | DocxAnchor;
}

interface Template {
  id: string;
  university: string;     // unique, case-insensitive
  format: Format;
  file: Blob;             // original upload, kept for preview + export
  period: PeriodKind;
  pageRoles?: ('cover' | 'unit' | 'ignore')[];   // PDF: one per page
  unitStartBlock?: number;                        // DOCX: body block index where the repeating unit begins (ends at end of body)
  placeholders: Placeholder[];
  updatedAt: string;
}

interface Student {
  id: string; name: string;
  templateId?: string; startDate?: string; endDate?: string;  // ISO dates; set during onboarding
  coverValues: Record<string, string>;                         // placeholderId → text
}

interface NotepadEntry { studentId: string; date: string; text: string; updatedAt: string }

type PeriodStatus = 'draft' | 'submitted' | 'changes_requested' | 'approved';
interface PeriodFill {
  studentId: string;
  periodKey: string;      // 'd:2026-09-24' | 'w:2026-09-21' (Monday) | 'm:2026-09'
  values: Record<string, string>;        // placeholderId → text (unit placeholders only)
  autofilled: Record<string, string>;    // placeholderId → notepad text used at autofill time
  status: PeriodStatus;
  submittedAt?: string;
}

interface ReviewAction {
  id: string; studentId: string; periodKey: string;
  action: 'submit' | 'approve' | 'request_changes';
  by: string; signature?: string; comment?: string; at: string;
}
```

**Model notes**
- The `signature` binding marks the template's supervisor signature, name or date spot. It is filled from the approval, never by the student.
- A template is a **cover region** (filled once from `Student.coverValues`) plus a **unit region** (cloned and filled once per period from `PeriodFill.values`).

## 5. Supervisor: template editor

### 5.1 Upload
The supervisor picks a file (.docx or .pdf only) and enters the university name. Detection runs client-side and the editor opens.

### 5.2 Detection
1. **Markers.** Text matching `\{\{[^}]+\}\}`, `\[[^\]]+\]`, `<[^>]+>`, `_{3,}` or `\.{3,}` becomes a placeholder. The label is the marker's inner text, or for underscore and dot runs, the preceding text on the same line. In Word, the runs of each paragraph are joined before matching and mapped back to `docx-text` anchors. In a PDF, pdf.js text items give the boxes. `source: 'marker'`.
2. **Labels (ported from v14).** Cover `label | value` tables and 2-column PDF cover labels become `cover`. Day-grid rows (weekday names or `Day N`) become one `daily` placeholder per non-date column, with `dayIndex` set from the row's order. A day-grid column whose header contains "date" becomes `date` for each row instead. Numbered or long question rows followed by a blank area become `period`. Supervisor remarks and signature rows become `signature`. `source: 'label'`.
3. **Deduplication.** A label detection that overlaps a marker detection is dropped.
4. **Default bindings** for anything not assigned above: a label matching `/date/i` becomes `date`, and everything else becomes `free`.
5. **Regions.** PDF: the first page containing week, day or month rows is `unit`, earlier pages are `cover`, and later pages are `unit`. DOCX: `unitStartBlock` is the first table with a week, day or month row. Everything before it is cover.

### 5.3 Editor screen
- **Left: the document** with highlight boxes colored by binding. Boxes from `marker` detection are solid, `label` boxes are dashed, and `manual` boxes are solid with a pin icon. There's a legend for the colors.
  - **PDF:** pages are rendered with pdf.js onto canvas. Boxes are absolutely positioned. The selected box can be dragged and resized. In **Add** mode, dragging on the page draws a new box.
  - **DOCX:** rendered with `docx-preview`. Anchors are resolved to DOM nodes by walking rendered `<table>`/`<tr>`/`<td>` and `<p>` elements in document order, the same order as the XML. Boxes follow the bounding rect of the node or selected range. In **Add** mode, clicking a cell adds a `docx-cell` anchor, and selecting text inside one paragraph adds a `docx-text` anchor. Boxes snap to cells or text and can't be dragged freely. Anchors deeper than one level of table nesting are unsupported. Detection skips them, and the editor shows "Add this manually" for any it can't resolve.
- **Right:**
  - The placeholder list, grouped by region.
  - An inspector for the selected placeholder (label, binding, day index, region, delete).
  - The period selector.
  - Region controls: PDF page thumbnails that toggle between Cover, Repeats every period and Ignore. For DOCX, a "Repeating unit starts here" action on a selected table.
- Clicking a list item selects and scrolls to its box, and clicking a box selects its list item.

### 5.4 Save
- **Required:** a university name, at least one unit placeholder, and a unit region.
- If a template already exists under that university name (compared case-insensitively), the supervisor is asked before it is overwritten.
- Placeholder ids are preserved across edits. If placeholders that students have already filled are deleted, a confirmation shows the number of affected students first.
- The **Templates list** shows each university, its format, period, placeholder count and number of students, with Edit and Delete. Deleting a template that's in use requires confirmation.

## 6. Student: onboarding, notepad, builder

### 6.1 Onboarding
The first time a student with no `templateId` opens the app, they pick a university from the saved templates and enter start and end dates (the end must be on or after the start). Periods are computed by `core/periods.ts`:
- **daily:** every Monday–Friday in the range, key `d:YYYY-MM-DD`.
- **weekly:** Monday–Sunday blocks that intersect the range, key `w:<Monday>`. The first and last blocks are trimmed to the range for autofill.
- **monthly:** calendar months that intersect the range, key `m:YYYY-MM`, trimmed the same way.

A student can change university or dates only while every period is still `draft`.

### 6.2 Notepad
- A date list sidebar (it opens on today) and a textarea for the selected date.
- **Autosave:** saves 800 ms after typing stops, on blur, and on `visibilitychange`/`pagehide`. The status reads "Saving…" then "Saved HH:MM". If a write fails, a toast appears, the text stays in memory, and the save is retried on the next edit.
- Future dates and dates outside the internship are disabled. Weekends are shown dimmed but can still be edited.
- A date is read-only when its period is `submitted` or `approved`.

### 6.3 Builder
- **Period list** with status badges. Selecting one opens the builder for it.
- **Left: the form,** in four groups:
  - *Cover*, which edits `Student.coverValues` and is shared across all periods.
  - *Days*, the `daily` and `date` placeholders ordered by `dayIndex`.
  - *Period answers*, the `period` placeholders.
  - *Other*, the `free` placeholders.
  - `signature` placeholders are shown as "Filled by supervisor" and can't be edited.
- **Right: the preview,** using the same overlay component in filled mode. Each value is drawn into its box and updates as you type, without regenerating the export. For PDF boxes, the preview uses the same shrink-to-fit rule as the export (section 7.3). Text that still overflows at 5.5pt gets a red outline.
- **Autofill** (`core/autofill.ts`) runs when a `draft` period is opened, and only fills values that are empty or still equal to what was autofilled last time (`PeriodFill.autofilled`):
  - `daily` with `dayIndex n` gets the notepad text for the nth weekday in the period's trimmed range, or is left empty if there is none.
  - `date` with `dayIndex n` gets that weekday's date, and `date` without a dayIndex gets the period's range (e.g. "21/09/2026 – 25/09/2026"). The format is `DD/MM/YYYY`.
  - Autofilled fields show a "from notepad" tag. If the current notepad text differs from `autofilled[id]`, a **Pull again** button replaces the field's value after confirmation.
- `changes_requested` periods show the supervisor's latest comment in a banner at the top, and the form is editable.
- **Submit:** lists any empty placeholders (except `free` and `signature`) and asks for confirmation. On confirm the status becomes `submitted`, `submittedAt` is set, a `submit` ReviewAction is appended, and the form and notepad dates for that period lock.

## 7. Review and export

### 7.1 Role switcher and seed
- The header dropdown lists "Supervisor" and each seeded student ("Aina Rahman", "Daniel Lim").
- **Reset demo data** clears IndexedDB and reseeds the students, with no templates and no entries.
- The current role is kept in `sessionStorage`.

### 7.2 Supervisor review
- **Review queue:** every `submitted` period across all students, oldest first, showing the student, university, period label and submitted time. A second tab lists all periods with their statuses.
- **Review detail:** a read-only filled preview. Beside it is the student's notepad text for each day in the period, and below it the ReviewAction history.
  - **Approve:** requires a typed full name, which becomes the signature. The status becomes `approved`, which is final, and an `approve` action is appended with its timestamp. The period's `signature` placeholders are filled from that action: a label matching `/date/i` gets the approval date, and anything else gets the typed name.
  - **Request changes:** requires a comment. The status becomes `changes_requested` and a `request_changes` action is appended. When the student resubmits, the status goes back to `submitted`.

### 7.3 Export
- The student selects periods. Only `approved` ones can be selected, and a note says "N of M periods approved". The cover is always included.
- **DOCX:** the cover's placeholders are filled once. The body blocks from `unitStartBlock` to the end (excluding the final `sectPr`) are cloned once per selected period, in order, with a page break between them, and each clone is filled.
  - `docx-cell`: the cell's paragraphs are replaced with one paragraph that copies the first run's `rPr`, with line breaks as `<w:br/>`.
  - `docx-text`: the character range is replaced within its runs, keeping the formatting of the first run in the range.
  - All XML text is escaped.
- **PDF:** the cover pages are copied once, then each period gets one copy of the unit pages (pages marked `ignore` are skipped). Text is drawn into each box with Helvetica, word-wrapped, starting at 10pt and shrinking in 0.5pt steps to a minimum of 5.5pt. Text still left over goes to appended "Continued entries" pages, labeled by period and placeholder.
- The file name is `<University>_<Student>_logbook.<ext>`, with non-alphanumerics replaced by `_`. It is downloaded through an object URL and `<a download>`.

## 8. Error handling

| Case | Behavior |
|---|---|
| Wrong file type, unreadable zip, corrupt PDF | Rejected with a message naming the problem. The editor does not open. |
| Encrypted PDF | "This PDF is password-protected; upload an unlocked copy." |
| Image-only PDF (no text items) | The editor opens with 0 detections and a banner: "No text found — place placeholders manually." |
| DOCX anchor can't be resolved in rendered DOM | The placeholder is listed with a warning icon and "Can't show this one — re-add it manually". The export still uses the XML anchor. |
| IndexedDB write failure / quota | A toast appears, the in-memory state is kept, and the write is retried on the next change. |
| Student's template deleted | A banner says "Your university's template was removed — pick another" and links to onboarding. Existing fills are kept but not shown. |
| Export with no approved periods | The Export button is disabled with an explanation. |

## 9. Testing

**Vitest (`core/`)**
- `detect/markers`: each marker pattern, markers split across runs, and dot-leader lines.
- `detect/docx` and `detect/pdf` against the APU, Taylor's and PMU fixture files: placeholder counts per binding and region are asserted as snapshots. The APU and Taylor's day grids must match v14's detected fields.
- `periods`: daily, weekly and monthly generation, including start dates in the middle of a week, ranges that cross month and year boundaries, single-day ranges, and end before start (rejected).
- `autofill`: dayIndex mapping, trimmed first and last weeks, not overwriting edited values, and the "pull again" behavior.
- `fill/docx` and `fill/pdf`: fill a fixture, then re-read the output (unzip the XML, or extract PDF text with pdf.js) and assert that the values are present, that cloned units come in the right order, and that overflow pages are created.

**Playwright (`tests/e2e/`, against `vite preview`)**
1. The supervisor uploads the PMU PDF, sees the detections, moves a box, adds a manual box, sets the period to weekly and saves.
2. The supervisor uploads the Taylor's DOCX, changes a binding, adds a cell placeholder and saves.
3. The student onboards, types in the notepad, reloads the page and still sees the text. They open the builder, see the autofilled values and the live preview update, and submit.
4. The supervisor requests changes. The student sees the comment, edits and resubmits. The supervisor approves with a typed name.
5. The student exports, and the downloaded file is re-read to confirm the values and the signature are present.

## 10. Out of scope (Phase 1 prototype)

- Real authentication.
- A backend or MySQL.
- Multiple supervisors or companies, and the manager role.
- Notifications.
- Drawn or image signatures.
- Converting Word to PDF.
- OCR for scanned PDFs.
- Template versioning beyond overwriting with ID preservation.
- Porting to Laravel/Blade. That comes after the gateway MD files are shared.
