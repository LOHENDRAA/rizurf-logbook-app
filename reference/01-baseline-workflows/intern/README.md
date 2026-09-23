# 01-baseline-workflows / intern — intern-side baseline flows

## Purpose

The intern's baseline processes: registration, daily logging, weekly review,
and calendar use. These are the as-imagined user journeys before system
component design.

## What belongs

Intern-actor flow diagrams (numbered `2.x` series).

## What does NOT belong

Supervisor-side steps → see `../company-supervisor/`. Feature-level
Input→Process→Output zooms → see `../../03-dynamic-logbook/` (dynamic
track) and `../../04-manual-compilation/` (manual track).

## Files

| New name | Original path | Depicted intent | Related v3 concept |
| --- | --- | --- | --- |
| `intern-registration-task-flow.png` | `2.1RegistrationTaskFlow.png` | Intern onboarding: registration → setup → task preparation. | Workspace onboarding; cf. v3 `/dashboard`. |
| `why-daily-log-rationale.png` | `2.2.1WHYDAILYLOG.png` | Rationale for daily logging (why each scheduled day needs a record). | v3 daily entries (`/journal/days/:date`). |
| `intern-daily-log-flow.png` | `2.2Intern Daily Log Flow.png` | Intern daily-log entry flow. | v3 daily entry (`/journal/days/:date`). |
| `intern-weekly-review-flow.png` | `2.3Intern Weekly Review Flow.png` | Intern weekly review of own logs before submission. | v3 weekly view (`/journal/weeks/:weekNumber`). |
| `intern-calendar-flow.png` | `2.4Intern Calendar Flow.png` | Intern calendar navigation across scheduled days/weeks. | Date/week navigation in v3 journal. |
