# 03-dynamic-logbook — dynamic (auto-linked) logbook track

## Purpose

The **dynamic track**: daily entries link automatically into the weekly
logbook; supervisor approval flows straight through to PDF generation.
The track overview below shows all five features; the subfolders hold the
per-feature Input→Process→Output zooms by actor.

- `intern/` — intern setup + dynamic log entry.
- `company-supervisor/` — full supervisor approval process.
- `export/` — PDF generation for approved logbooks.

## What belongs

Only dynamic-track diagrams (originally `Component/`, whose
`ComponentRelationship.png` is a workflow overview despite its name).

## What does NOT belong

The manual track (intern manually compiles Mon–Fri into a weekly logbook)
→ see `../04-manual-compilation/`. The two tracks are distinct designs,
not duplicates; the same-basename `SupervisorApproval.png` files differ
(full process here vs step-4 outcome only there).

## Files (track root — cross-role diagrams stay here)

| New name | Original path | Depicted intent | Related v3 concept |
| --- | --- | --- | --- |
| `track-overview-dynamic-5-features.png` | `Component/ComponentRelationship.png` | Five-feature overview: dynamic entry → supervisor approval → PDF; cross-role, so kept at track root. | End-to-end v3 flow (daily → weekly → review → export). |
| `universal-guide-dynamic-track.png` | `Component/universal_guide.png` | Master visual guide rendering of the dynamic track. | Illustrative; not v3 behavior. |
