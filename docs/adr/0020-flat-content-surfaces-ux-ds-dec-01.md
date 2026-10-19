# ADR-0020 — UX-DS-DEC-01: Standard content surfaces have no shadow

**Status: ACCEPTED (user decision, 2026-10-19; supersedes the UX-02-4 soft-shadow amendment)**

## Context

UX-02-4 amendment A softened content-surface elevation to a single token
(`--shadow-surface: 0 2px 8px rgb(27 63 81 / 0.045)`). On human review of the
actual Laragon interface the remaining shadow was still judged undesirable on
standard white content surfaces set against the pale Ocean background.

## Decision

1. The canonical standard content-surface shadow token is **`none`**:
   `--shadow-surface: none`.
2. `PageSurface` and equivalent standard white content containers render with
   **no box-shadow** — environment selector, dashboards, platform management,
   organization management, personal workspaces, and operational
   list/detail/form pages.
3. Surface separation is carried by subtle borders, consistent padding and the
   approved radii on the Ocean background `#F5F9FA` with white `#FFFFFF`
   surfaces.
4. Hard-coded elevation utilities (`shadow-xs/sm/…`, `hover:shadow-*`) are
   removed from standard content containers on verified pages; they must not
   be reintroduced there.
5. **Floating layers keep functional elevation**: dialogs, popovers, dropdown
   menus, menus, drawers and toasts are unaffected. Shadows are not globally
   disabled.

## Consequences

- Verified by computed style: real `PageSurface` instances report
  `box-shadow: none` (before: `rgba(27, 63, 81, 0.043) 0px 2px 8px 0px`).
- The `shadow-surface` utility remains the single adoption point; future
  elevation changes are token-only decisions.
- Regression gate: `frontend/tests/ux024.test.mjs` (UX-DS-DEC-01 case) scans
  verified pages for elevation utilities on non-floating white containers.

## Related

- SPEC-UX-02-4 amendment A (soft shadow) — superseded by this decision.
- `docs/migration/stage-ux-02-4-report.md` — acceptance-scope correction
  addendum.
