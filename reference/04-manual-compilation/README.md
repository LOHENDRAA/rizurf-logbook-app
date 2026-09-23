# 04-manual-compilation — manual (intern-compiled) logbook track

## Purpose

The **manual track**: the intern enters daily logs, then manually compiles
Mon–Fri entries into one weekly logbook; the supervisor reviews (bulk or
single), records an approval outcome, and the intern downloads the PDF.
The track overview below shows all five features; subfolders hold the
per-feature Input→Process→Output zooms by actor.

- `intern/` — daily log entry + weekly manual compilation.
- `company-supervisor/` — supervisor review + approval outcome.
- `export/` — intern PDF download after approval.

## What belongs

Only manual-track diagrams (originally `Component1/`; original overview
filename had a "Compoenent" typo, fixed in the new name and recorded
below).

## What does NOT belong

The dynamic track (auto-linked entries) → see `../03-dynamic-logbook/`.
The two tracks are distinct designs, not duplicates. Document sources for
this track's paper form → see `../06-document-sources/`.

## Files (track root — cross-role diagrams stay here)

| New name | Original path | Depicted intent | Related v3 concept |
| --- | --- | --- | --- |
| `track-overview-manual-5-features.png` | `Component1/CompoenentRelationship.png` (note original "Compoenent" typo) | Five-feature overview: daily log → manual compilation → review → outcome → PDF; cross-role, so kept at track root. | End-to-end v3 flow (daily → weekly → review → export). |
