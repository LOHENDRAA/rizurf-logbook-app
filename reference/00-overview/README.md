# 00-overview — vision, problem, and method

## Purpose

Why the logbook system exists and the design method behind it. Start here
before diving into any workflow or data folder.

## What belongs

High-level framing: problem statement, purpose statement, the universal
information-flow sequence, and the methodology guide they derive from.

## What does NOT belong

Step-by-step workflows (see `../01-baseline-workflows/`), data schemas
(see `../02-system-design/`), or feature-level diagrams (see
`../03-dynamic-logbook/`, `../04-manual-compilation/`).

## Files

| New name | Original path | Depicted intent | Related v3 concept |
| --- | --- | --- | --- |
| `universal-information-flow-sequence.png` | `0.Universal.png` | Master visual method: Person/System → Capture → Data → Process → Decision → State Change → Output → API/Event → Next Component. | General design method; not a v3 route. Underlies the flow in `appv3/frontend/README.md` (Intern → Supervisor → Mentor). |
| `internship-manual-logbook-problem.png` | `1.Problem.png` | Problem with the manual logbook: fragmented records, inconsistent formats, delayed supervisor feedback. | Motivation for v3 journal + review workflow (`appv3/frontend/README.md`). |
| `logbook-system-purpose.png` | `1.Purpose.png` | System purpose: efficient daily recording, weekly compilation, timely approval, professional PDF output. | v3 goal: daily entries → weekly review → export. |
| `methodology-quick-guide-idea-to-software.pdf` | `Quick Guide_ From Idea to Software - Google Docs.pdf` | Text methodology guide (purpose → information flow → data → components); source of the universal sequence above. | Design input only; not v3 behavior. |
