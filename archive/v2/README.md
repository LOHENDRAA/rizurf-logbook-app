# InternFlow

InternFlow is a browser-based React prototype for centralizing the APU internship logbook process. It guides interns through two ordered submission parts, gives company supervisors a focused review and approval workspace, and generates combined PDF submission packs.

The prototype is designed to answer three questions:

- Can interns understand what they need to complete and what comes next?
- Can supervisors review several interns without relying on scattered email threads?
- Can the required documents be assembled in the correct order with less manual work?

> [!WARNING]
> This is a frontend prototype, not a production submission system. Authentication is simulated, data is stored in the current browser, and external university submission is not tracked.

## Features

### Intern workspace

- Part 1 and Part 2 checklists in the required order
- Locked Part 2 until every Part 1 requirement is complete
- Section-level progress and submission readiness
- Autosaved covers, weekly logbooks, clearance forms, and attendance records
- PDF, Word, PNG, and JPG uploads
- Multiple-file ordering for uploaded checklist items
- Section, document, and whole-part submission actions
- Supervisor feedback and complete review history
- In-app notifications for reviews and milestones
- Student signature setup
- Combined PDF generation and download history
- Printable per-part summary and final overview

### Company supervisor workspace

- Dashboard for multiple assigned interns
- Pending-review, approval, and revision counts
- Section, document, and whole-part approval actions
- Optional section-level feedback when requesting changes
- Company assessment form
- Stored supervisor signature and company stamp
- Automatic signature and stamp application during approval
- Full approval and revision history

## Internship Workflow

### Part 1

| Order | Requirement | Input method | Supervisor review |
| --- | --- | --- | --- |
| 1 | Part 1 Cover | In-app form | No |
| 2 | Logbook Week 01-08 | Eight in-app weekly sections | Yes |
| 3 | Cover Letter | Upload | No |
| 4 | Curriculum Vitae | Upload | No |
| 5 | Project Log Sheet | Upload | No automated mentor-signature verification |
| 6 | Week 1 Email | Upload | No |

Part 2 becomes available when every Part 1 section is complete and all required supervisor reviews are approved.

### Part 2

| Order | Requirement | Input method | Supervisor review |
| --- | --- | --- | --- |
| 1 | Part 2 Cover | In-app form | No |
| 2 | Industrial Placement Report | Upload | No |
| 3 | Report Clearance Form | In-app form | Yes |
| 4 | Logbook Week 09-16 | Eight in-app weekly sections | Yes |
| 5 | Attendance Record, 16 Weeks | Sixteen in-app weekly sections | Yes |
| 6 | Company Supervisor Assessment Form | Supervisor form | Supervisor-owned |
| 7 | Mentor Visit / Feedback Report | Upload | No automated mentor-signature verification |

The app marks its internal workflow complete when all Part 2 requirements are approved. This does not mean the generated files were submitted to the university's external portal.

## Document Statuses

Each section follows this lifecycle:

```text
not_started -> draft -> submitted_for_review -> approved
                                      |
                                      -> changes_requested -> draft
```

Documents that do not require supervisor review move from `draft` directly to `approved` when the intern marks them complete.

Editing approved content resets only the changed section to `draft`. Previously generated PDFs remain downloadable but are marked outdated.

Bulk approval is disabled while a document or part contains requested changes.

## PDF Behavior

InternFlow generates PDFs entirely in the browser with `pdf-lib`.

- In-app form data is rendered as A4 pages.
- Uploaded PDF pages are copied into the combined document.
- PNG and JPG files are converted into fitted A4 pages.
- Uploaded Word files produce a clearly labeled prototype conversion page.
- Documents are merged in the checklist order.
- Stored student and supervisor signatures are placed on applicable pages.
- The supervisor's company stamp is placed on approved company records.
- The latest three generated versions are retained for each part.

The current renderer models the supplied forms and fields, but it does not yet reproduce every legacy Word template pixel-for-pixel. Production Word conversion and submission-grade signing require backend services.

## Technology Stack

| Area | Technology |
| --- | --- |
| Application | React 19, TypeScript |
| Development server and build | Vite 7 |
| Routing | React Router 7 |
| Persistence | IndexedDB through `idb-keyval` |
| PDF generation | `pdf-lib` |
| Icons | Lucide React |
| Testing | Vitest, Testing Library, Playwright CLI |
| Code quality | ESLint, TypeScript strict mode |

The visual system is based on the Rizurf apprenticeship website: dark navy surfaces, teal accents, ice-tinted light surfaces, compact productivity cards, and responsive navigation.

Reference: <https://apprenticeship.rizurf.com/software-engineering-internship>

## Getting Started

### Requirements

- Node.js 20 or newer
- npm 10 or newer
- Current Chrome or Edge browser

### Install and run

```bash
npm install
npm run dev
```

Vite prints the local URL, normally <http://localhost:5173>.

### Production build

```bash
npm run build
```

The generated static application is written to `dist/`.

## Demo Accounts

The login page provides quick-login buttons. The same users can be accessed with these credentials:

| Role | Email | Password |
| --- | --- | --- |
| Intern | `aisha.rahman@mail.apu.edu.my` | `intern123` |
| Company supervisor | `marcus@rizurf.com` | `supervisor123` |

The supervisor account manages three seeded interns in different states:

- Aisha Rahman: early Part 1 progress
- Daniel Lee: Part 1 with work waiting for review
- Maya Kumar: Part 1 complete and Part 2 in progress

## Suggested Demo Walkthrough

1. Use quick login to enter as Aisha Rahman.
2. Open Part 1 and select the Week 01-08 logbook.
3. Complete a new weekly section and submit it for review.
4. Upload a PDF under the CV requirement and mark it complete.
5. Sign out and enter as company supervisor Marcus Tan.
6. Open Aisha from the supervisor dashboard.
7. Select the submitted week and approve it or request changes.
8. Return to the intern account to see the updated progress and notification.
9. Use Maya Kumar's seeded record to explore unlocked Part 2 work.
10. Add a signature or company stamp from Profile and Settings.

## Available Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create the production bundle |
| `npm run lint` | Run ESLint across the project |
| `npm test` | Run the Vitest test suite once |

Run the full local verification set with:

```bash
npm run lint
npm test
npm run build
```

## Project Structure

```text
frontend/
|-- public/
|   `-- favicon.svg
|-- src/
|   |-- components/
|   |   |-- AppShell.tsx          # Responsive navigation and application frame
|   |   `-- StatusBadge.tsx       # Status and progress components
|   |-- lib/
|   |   |-- pdf.ts                # Browser PDF rendering and merging
|   |   |-- storage.ts            # IndexedDB persistence
|   |   |-- workflow.ts           # Status, validation, and progress rules
|   |   `-- workflow.test.ts      # Workflow unit tests
|   |-- pages/
|   |   |-- LoginPage.tsx
|   |   |-- InternDashboard.tsx
|   |   |-- PartPage.tsx
|   |   |-- DocumentPage.tsx
|   |   |-- SupervisorDashboard.tsx
|   |   |-- ReviewPage.tsx
|   |   |-- SummaryPage.tsx
|   |   `-- ProfilePage.tsx
|   |-- state/
|   |   `-- AppContext.tsx        # Application state and domain actions
|   |-- App.tsx                   # Route definitions and role guards
|   |-- data.ts                   # Document definitions and seeded records
|   |-- main.tsx                  # React entry point
|   |-- styles.css                # Design system and responsive layouts
|   `-- types.ts                  # Shared domain types
|-- package.json
`-- vite.config.ts
```

## Routes

| Route | Role | Purpose |
| --- | --- | --- |
| `/login` | Public | Demo authentication |
| `/dashboard` | Intern | Progress overview and next action |
| `/parts/:partId` | Intern | Part checklist and PDF versions |
| `/parts/:partId/documents/:documentId` | Intern | Form, upload, and section workflow |
| `/summary` | Intern | Printable completion overview |
| `/supervisor` | Supervisor | Assigned interns and review queue |
| `/supervisor/interns/:internId` | Supervisor | Detailed review and approval workspace |
| `/profile` | Both | Local settings and signature assets |

## Local Data and Resetting

Workflow records, uploaded files, signatures, stamps, notifications, and generated PDFs are stored in IndexedDB in the current browser profile. The active demo user uses browser session/local storage. The web UI is intentionally light-only.

To restore the original seeded records:

1. Open Profile and Settings.
2. Select **Reset demo data**.
3. Confirm the reset dialog.

Clearing browser site data has the same effect and permanently removes local uploads.

## Testing Status

The automated workflow tests cover:

- Granular progress calculation
- Document status precedence
- Weekly-log validation
- Upload requirements
- Part 1 completion and Part 2 unlocking

Playwright CLI smoke testing has exercised:

- Intern and supervisor quick login
- Desktop and mobile dashboards
- Mobile navigation drawer
- Weekly-log autosave and submission
- PDF file upload
- Supervisor review and approval
- Browser-console errors

## Prototype Limitations

- There is no backend, real API, or real authentication.
- Quick login allows anyone using the browser profile to access local records.
- Data is not encrypted, backed up, or synchronized between devices.
- Real email notifications are not sent.
- Submission to the university's external portal is not tracked.
- Word-to-PDF conversion is simulated.
- Exact legacy `.doc` and `.docx` template rendering is not implemented.
- Signatures and stamps are image assets, not cryptographic digital signatures.
- Mentor and university administrator interfaces are outside the prototype scope.
- Uploaded mentor signatures are not automatically verified.
- The company assessment score is recorded but does not enforce a pass threshold.
- No formal accessibility conformance target has been certified.

## Production Roadmap

Before using InternFlow with real internship records, the system needs:

1. Backend authentication with secure sessions and password management.
2. Role-based authorization enforced by the server.
3. Encrypted document storage, backups, retention rules, and deletion controls.
4. Server-side audit logs for submissions, reviews, and signature use.
5. Secure supervisor signature and company-stamp authorization.
6. Reliable Word-to-PDF conversion and exact official template rendering.
7. Malware scanning, upload limits, and file-content validation.
8. Email delivery and notification preferences.
9. University administrator tools for accounts, assignments, and deadlines.
10. Accessibility review and cross-browser end-to-end tests.
11. Backend PDF generation and deterministic document archival.
12. Privacy, consent, and institutional security review.

## Source Materials

The prototype workflow was derived from APU internship materials supplied separately, including Part 1 and Part 2 covers, weekly logbooks, report guidance, report clearance, attendance, company assessment, mentor records, and student briefing slides.

These source files are not bundled into the frontend repository. Keep official forms versioned and access-controlled when they are introduced into production.
