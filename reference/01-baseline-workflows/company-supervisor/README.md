# 01-baseline-workflows / company-supervisor — supervisor-side baseline flow

## Purpose

The company supervisor's baseline process: weekly review and approval of
intern logbooks.

## What belongs

Supervisor-actor flow diagrams.

## What does NOT belong

Intern-side flows → see `../intern/`. Approval detail zooms → see
`../../03-dynamic-logbook/company-supervisor/` and
`../../04-manual-compilation/company-supervisor/`.

## Files

| New name | Original path | Depicted intent | Related v3 concept |
| --- | --- | --- | --- |
| `supervisor-weekly-approve-flow.png` | `2.5Supervisor Weekly Approve Flow.png` | Supervisor weekly approve flow: review submitted week → approve or request revision. | v3 supervisor review (`/supervisor/...`, per `appv3/frontend/README.md` and `App.tsx` route guards). |
