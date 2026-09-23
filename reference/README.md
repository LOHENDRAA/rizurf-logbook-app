# reference/ — logbook design files (organized)

Organized reorder of the source `LogbookFiles/` design drop (42 artifacts:
29 PNG + 9 XLSX + 3 DOCX + 1 PDF), arranged by logbook-app workflow so each
file can be found by depicted intent. Every artifact is preserved exactly
once, content-untouched (md5-verified pre/post move); only paths and
filenames changed. Original paths — including the `Compoenent` typo and the
`Pasted image` names — are fully traceable in the index below and in each
folder README.

Images are **design input**: they may differ from the current v3 app. Links
below point at related v3 concepts (docs/routes), never a claim that an
image equals current behavior.

## Tree

```text
reference/
  README.md                      # this file: guide + full old→new index
  00-overview/                   # vision, problem, method (4 files)
  01-baseline-workflows/
    intern/                      # intern baseline flows (5 files)
    company-supervisor/          # supervisor baseline flow (1 file)
  02-system-design/
    data-model/                  # data overview, ERD, 6 schema iterations (8 files)
    components/                  # 15-component map + 2 layer diagrams (3 files)
  03-dynamic-logbook/            # dynamic (auto-linked) track (6 files)
    intern/ company-supervisor/ export/
  04-manual-compilation/         # manual (intern-compiled) track (6 files)
    intern/ company-supervisor/ export/
  05-ui-mockups/                 # student workspace UI mockups (2 files)
  06-document-sources/
    templates/                   # blank + tokenized forms (2 files)
    examples/                    # filled sample + spreadsheet + field map (3 files)
  07-exploratory-data/           # generic non-internship explorations (2 files)
  08-v4-product-vision/          # logbook v4 product brief + summary (2 files, added later — not part of the 42-artifact drop below)
```

## Where do I find X?

- Vision / problem / method → `00-overview/`
- Intern registration, daily log, weekly review, calendar → `01-baseline-workflows/intern/`
- Supervisor weekly approval (baseline) → `01-baseline-workflows/company-supervisor/`
- Data overview, ERD, internship schema iterations → `02-system-design/data-model/`
- Component inventory, access/registration layer maps → `02-system-design/components/`
- Dynamic track (auto-linked entries → approval → PDF) → `03-dynamic-logbook/`
- Manual track (daily logs → intern-compiled week → review → PDF) → `04-manual-compilation/`
- Portal dashboard / daily-entry UI mockups → `05-ui-mockups/`
- Blank form, tokenized template, filled sample, spreadsheet → `06-document-sources/`
- Generic (non-internship) workbooks → `07-exploratory-data/`
- Logbook v4 product brief / growth-record direction → `08-v4-product-vision/`

## Full old → new index (42 rows)

Note: `08-v4-product-vision/` was added after this index was built and is
**not** one of the 42 md5-verified `LogbookFiles/` artifacts below — it has
its own README and isn't part of this original drop.

### Root files → 00 / 01 / 02

| Original path | New path |
| --- | --- |
| `0.Universal.png` | `00-overview/universal-information-flow-sequence.png` |
| `1.Problem.png` | `00-overview/internship-manual-logbook-problem.png` |
| `1.Purpose.png` | `00-overview/logbook-system-purpose.png` |
| `Quick Guide_ From Idea to Software - Google Docs.pdf` | `00-overview/methodology-quick-guide-idea-to-software.pdf` |
| `2.1RegistrationTaskFlow.png` | `01-baseline-workflows/intern/intern-registration-task-flow.png` |
| `2.2.1WHYDAILYLOG.png` | `01-baseline-workflows/intern/why-daily-log-rationale.png` |
| `2.2Intern Daily Log Flow.png` | `01-baseline-workflows/intern/intern-daily-log-flow.png` |
| `2.3Intern Weekly Review Flow.png` | `01-baseline-workflows/intern/intern-weekly-review-flow.png` |
| `2.4Intern Calendar Flow.png` | `01-baseline-workflows/intern/intern-calendar-flow.png` |
| `2.5Supervisor Weekly Approve Flow.png` | `01-baseline-workflows/company-supervisor/supervisor-weekly-approve-flow.png` |
| `3DataOverview.png` | `02-system-design/data-model/data-overview-capture-to-output.png` |
| `3.ERD.png` | `02-system-design/data-model/erd-database-schema.png` |
| `4.Components.png` | `02-system-design/components/system-components-15-overview.png` |
| `5.ComponentRelationship.png` | `02-system-design/components/component-relationship-access-layer-13.png` |
| `5ComponentRelationship.png` | `02-system-design/components/component-relationship-registration-layer-10.png` |

### Component/ → 03-dynamic-logbook + 06 templates

| Original path | New path |
| --- | --- |
| `Component/ComponentRelationship.png` | `03-dynamic-logbook/track-overview-dynamic-5-features.png` |
| `Component/InternSetup.png` | `03-dynamic-logbook/intern/intern-setup-dynamic-registration.png` |
| `Component/InternDynamicLogEntry.png` | `03-dynamic-logbook/intern/intern-dynamic-log-entry.png` |
| `Component/SupervisorApproval.png` | `03-dynamic-logbook/company-supervisor/supervisor-approval-dynamic-process.png` |
| `Component/PdfGeneration.png` | `03-dynamic-logbook/export/pdf-generation-dynamic-approved.png` |
| `Component/universal_guide.png` | `03-dynamic-logbook/universal-guide-dynamic-track.png` |
| `Component/2-04 Internship Logbook.docx` | `06-document-sources/templates/internship-logbook-blank-form.docx` |

### Component1/ → 04-manual-compilation + 06

| Original path | New path |
| --- | --- |
| `Component1/CompoenentRelationship.png` (original typo) | `04-manual-compilation/track-overview-manual-5-features.png` |
| `Component1/InternDailyLog.png` | `04-manual-compilation/intern/intern-daily-log-input-process-output.png` |
| `Component1/InternWeeklyLog.png` | `04-manual-compilation/intern/intern-weekly-manual-compilation.png` |
| `Component1/SupervisorReview.png` | `04-manual-compilation/company-supervisor/supervisor-review-bulk-single.png` |
| `Component1/SupervisorApproval.png` | `04-manual-compilation/company-supervisor/supervisor-approval-outcome.png` |
| `Component1/InternPdfDownload.png` | `04-manual-compilation/export/intern-pdf-download-approved.png` |
| `Component1/InternshipLogbookPlaceholder.docx` | `06-document-sources/templates/internship-logbook-tokenized-template.docx` |
| `Component1/InternshipLogbookFilled.docx` | `06-document-sources/examples/internship-logbook-filled-sample-week1.docx` |
| `Component1/InternshipLogbookExcel.xlsx` | `06-document-sources/examples/internship-logbook-spreadsheet-source.xlsx` |
| `Component1/InternLogBookConnectionToExcel.png` | `06-document-sources/examples/spreadsheet-to-form-field-mapping.png` |

### ExcelDataFormat/ → 02 data-model + 07

| Original path | New path |
| --- | --- |
| `ExcelDataFormat/Logbook_Data_Discussion.xlsx` | `02-system-design/data-model/logbook-data-discussion-full-13-sheets.xlsx` |
| `ExcelDataFormat/Logbook_Data_Discussion_v2.xlsx` | `02-system-design/data-model/logbook-data-discussion-v2-normalized-entities.xlsx` |
| `ExcelDataFormat/Logbook_Data_Discussion_v3.xlsx` | `02-system-design/data-model/logbook-data-discussion-v3-flat-field-catalog.xlsx` |
| `ExcelDataFormat/Logbook_Data_Discussion_v4.xlsx` | `02-system-design/data-model/logbook-data-discussion-v4-denormalized-combined.xlsx` |
| `ExcelDataFormat/Logbook_Data_Discussion_v5.xlsx` | `02-system-design/data-model/logbook-data-discussion-v5-grouped-headers.xlsx` |
| `ExcelDataFormat/Logbook_Data_Discussion_v6.xlsx` | `02-system-design/data-model/logbook-data-discussion-v6-weekday-columns.xlsx` |
| `ExcelDataFormat/Universal_Logbook_Data_v1.xlsx` | `07-exploratory-data/universal-logbook-data-v1-generic.xlsx` |
| `ExcelDataFormat/Universal_Logbook_Data_v2.xlsx` | `07-exploratory-data/universal-logbook-data-v2-generic.xlsx` |

### Flow/ → 05-ui-mockups

| Original path | New path |
| --- | --- |
| `Flow/Daily Log/Pasted image.png` | `05-ui-mockups/student-workspace-dashboard-overview.png` |
| `Flow/Daily Log/Pasted image (2).png` | `05-ui-mockups/daily-log-entry-screen-draft.png` |

## Naming convention

Lowercase-hyphen names, no spaces/parentheses, extensions preserved. The
`Compoenent` typo was fixed in the new name (original recorded above).
Same-basename files with different content were disambiguated:
`supervisor-approval-dynamic-process.png` vs
`supervisor-approval-outcome.png`;
`component-relationship-access-layer-13.png` vs
`component-relationship-registration-layer-10.png`.

## Corrections to misleading original names

- `Component/` vs `Component1/` are **not near-duplicates**: `Component/`
  is the dynamic track (entries auto-link into the weekly logbook);
  `Component1/` is the manual track (intern manually compiles Mon–Fri).
  Their same-basename `SupervisorApproval.png` files depict different
  content (full process vs step-4 outcome).
- `Component/ComponentRelationship.png` and
  `Component1/CompoenentRelationship.png` are five-feature workflow
  overviews, not component-relationship diagrams; they sit at their track
  roots.
- `Flow/Daily Log/` contains UI mockups (dashboard + entry screen), not
  flow diagrams.
- `Universal_Logbook_Data_*.xlsx` are a generic multi-role lineage, not
  earlier versions of the internship `Logbook_Data_Discussion` series.

## Method and verification

- Every PNG was visually inspected; every XLSX (sheet names), DOCX
  (text), and the PDF (text) was parsed to confirm intent before placing.
- Pre/post manifests (md5, `/tmp` only, not committed): 42 artifacts, all
  hashes identical, zero byte-identical duplicates in the source.
- Old dirs `Component/`, `Component1/`, `ExcelDataFormat/`, `Flow/`
  removed after moving; single canonical copy per file.
- A case-insensitive search for "logbookfiles"/"reference/" across
  `app/` + `archive/` sources found no references — no app code loads
  these files; they are design input only.

## Related v3 docs/routes (design input — may differ from v3)

- Workflow + journal statuses + role routes: `../appv3/frontend/README.md`
- API contract: `../appv3/frontend/openapi/portal.yaml`
- Route guards: `../appv3/frontend/src/App.tsx`
- Key routes: `/dashboard`, `/journal`, `/journal/days/:date`,
  `/journal/weeks/:weekNumber`, `/supervisor/...`, `/mentor/...`
