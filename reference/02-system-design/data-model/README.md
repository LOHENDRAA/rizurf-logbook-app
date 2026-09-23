# 02-system-design / data-model — data overview, ERD, and schema iterations

## Purpose

What data the logbook system captures, stores, and passes onward: the
visual data-flow overview, the ERD, and six iterations of the internship
data workbook showing the schema converging.

## What belongs

Internship-specific data design: overview/process diagrams and the
`Logbook_Data_Discussion*.xlsx` iteration series.

## What does NOT belong

Generic (non-internship) logbook explorations → see
`../../07-exploratory-data/` (different lineage: Student/Employee/
Freelancer × Daily/Weekly/Monthly/Growth — do not treat as earlier
versions of these files). Component diagrams → see `../components/`.

## Files

| New name | Original path | Depicted intent | Related v3 concept |
| --- | --- | --- | --- |
| `data-overview-capture-to-output.png` | `3DataOverview.png` | Data pipeline: capture → store → calculate/process → retrieve → pass onward, plus identifiers, relationships, ownership, validation, history/audit. | v3 API contract models (`appv3/frontend/openapi/portal.yaml`). |
| `erd-database-schema.png` | `3.ERD.png` | Entity-relationship diagram: users, companies, internships, mentor assignments, weekly/daily logs, submission/review history. | v3 journal/review entities; compare with `portal.yaml`, not identical. |
| `logbook-data-discussion-full-13-sheets.xlsx` | `ExcelDataFormat/Logbook_Data_Discussion.xlsx` | Most mature iteration (13 sheets: Overview, Workflow, Students, Company Supervisors, University Mentors, Companies, Internships, Mentor Assignments, Weekly Logs, Daily Entries, Submission/Review History, Decision Summary). | Closest to v3 domain model. |
| `logbook-data-discussion-v2-normalized-entities.xlsx` | `ExcelDataFormat/Logbook_Data_Discussion_v2.xlsx` | Normalized per-entity sheets (Users, Companies, Internships, Mentor Assignments, Weekly/Daily Logbooks, Submission/Review History). | Entity normalization study. |
| `logbook-data-discussion-v3-flat-field-catalog.xlsx` | `ExcelDataFormat/Logbook_Data_Discussion_v3.xlsx` | Flat single-sheet field catalog (all data fields). | Field inventory. |
| `logbook-data-discussion-v4-denormalized-combined.xlsx` | `ExcelDataFormat/Logbook_Data_Discussion_v4.xlsx` | Denormalized combined view. | Denormalization study. |
| `logbook-data-discussion-v5-grouped-headers.xlsx` | `ExcelDataFormat/Logbook_Data_Discussion_v5.xlsx` | Combined view with grouping headers. | Presentation iteration. |
| `logbook-data-discussion-v6-weekday-columns.xlsx` | `ExcelDataFormat/Logbook_Data_Discussion_v6.xlsx` | Combined view with Mon–Fri columns. | Weekday-layout iteration. |
