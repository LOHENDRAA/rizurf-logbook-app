# 08-v4-product-vision — logbook v4 product brief

## Purpose

The conceptual rationale behind the "v4" growth-logbook direction sketched in
`logbook_v4_google_stitch_design.zip` (repo root). A ChatGPT-authored product
brief proposing a redesign of the logbook from pure university-compliance
paperwork into a three-purpose tool: compliance, work verification, and
personal/professional growth.

**Scope note:** per the author's own summary (`universal-logbook-v4-summary.md`),
v4 is explicitly **not internship-specific**. The primary user is "anyone who
wants to track and improve their growth" — student, intern, employee,
freelancer, entrepreneur, or learner — with managers/mentors/teachers as
optional feedback-givers, not required participants. This is a broader
product than the internship-placement-with-supervisor-approval tool `appv3/`
currently implements, matching the "Universal Logbook" branding seen in the
Stitch mockups.

## What belongs

Only the v4 product-vision source material (the brief, and any future
supporting docs for the same direction).

## What does NOT belong

The v4 UI mockups themselves → see `logbook_v4_google_stitch_design.zip` at
the repo root. Baseline/current (v3) design material → see the numbered
`0x-*` folders above, which predate and are unrelated to this direction.

## Files

| File | Depicted intent |
| --- | --- |
| `chatgpt-logbook-v4-product-brief.docx` | Two-part brief: (1) a 24-item data-capture scope plus a daily/weekly/monthly reflection cadence, a goals loop (Goal → Experience → Reflection → Improvement), a structured skills taxonomy, and an auto-generated "Internship Journey" growth summary; (2) a 3-layer system architecture (Database Truth → Logic/API → UI/UX) with example endpoints and per-role UI sketches. |
| `universal-logbook-v4-summary.md` | The author's own condensed one-pager: confirms the "Universal Logbook" name, the non-internship-specific user scope, and the four-tier Daily (Record) → Weekly (Reflect) → Monthly (Review Growth) → Long Term (Growth Record) workflow, distilled to the core cycle Do → Record → Learn → Reflect → Improve → Repeat. |

## Relationship to the Stitch design zip

This brief explains the Stitch mockups' nav items and content almost
directly: "Weekly Review" / "Monthly Growth" / "Skills & Evidence" map to
this doc's weekly reflection, monthly/milestone reflection, and skills
library; the Stitch weekly-review form's six sections map to this doc's
8-question weekly reflection plus the goals loop. Read together, they show
this is a deliberately spec'd future direction, not an untethered design
exploration — see the root `README.md`'s start-here map for its adoption
status (as of this writing: spec'd, not yet implemented in `appv3/`).
