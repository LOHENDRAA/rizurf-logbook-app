# 02-system-design / components — system components and layer relationships

## Purpose

The building blocks of the system: the 15-component inventory and the two
layer-relationship diagrams (access layer vs registration layer).

## What belongs

System-wide component maps. (Despite the similar basenames, the two
relationship diagrams depict different layers — see table.)

## What does NOT belong

Five-feature track overviews (similar titles, different content) → see
`../../03-dynamic-logbook/track-overview-dynamic-5-features.png` (dynamic
track) and
`../../04-manual-compilation/track-overview-manual-5-features.png`
(manual track). Per-feature zooms live in those track folders.

## Files

| New name | Original path | Depicted intent | Related v3 concept |
| --- | --- | --- | --- |
| `system-components-15-overview.png` | `4.Components.png` | Inventory of 15 system components (registration, log entry, review, approval, export, supporting services). | High-level map; v3 implements a subset via API + SPA (`portal.yaml`, `App.tsx`). |
| `component-relationship-access-layer-13.png` | `5.ComponentRelationship.png` | Component relationships for the access layer (13 components: dashboard, log entry, history, approval, export paths). | Access-time composition; cf. v3 routes. |
| `component-relationship-registration-layer-10.png` | `5ComponentRelationship.png` | Component relationships for the registration layer (10 components: roles, setup, placement). | Onboarding composition; cf. v3 auth/setup. |
