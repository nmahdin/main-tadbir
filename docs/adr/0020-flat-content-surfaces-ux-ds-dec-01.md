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

---

## Amendment B — Explicit standalone-card elevation

**Status: ACCEPTED (Chief Software Architect directive, recorded 2026-10-22).**
This amendment is appended; the original decision above is preserved verbatim
and remains in force except for the narrow exception defined here. Frontend
implementation requires a separate authorization directed to the Frontend
Agent; this amendment records the decision and contract only.

### B.1 Canonical value

The canonical standalone-card elevation is:

```css
--shadow-surface: 0 1px 3px rgb(15 23 42 / 0.035);
```

Despite the historical token name, this token is not permission to elevate
every white surface. It denotes the approved standalone-card elevation only
when applied through the shared semantic opt-in (§B.4). No stronger hover
shadow is allowed: an elevated standalone card uses exactly this value at
rest and on hover.

### B.2 Surfaces that remain flat

- `PageSurface` and every page-level wrapper equivalent to it.
- The generic `Card` component when its elevation opt-in is not explicitly
  selected (flat by default).
- The `AuthPages` shell.
- Environment-selection cards, until a separate decision approves otherwise.
- Tables, table wrappers and toolbars; form sections and field groups;
  nested panels and sections; inline notices, alerts, banners, empty
  states and explanatory panels; navigation and filter containers.

Floating layers keep functional elevation: dialogs, popovers, dropdown
menus, menus, drawers and toasts are unaffected, exactly as in the original
decision. Buttons and form controls keep their own component contracts;
`--button-shadow` is not a card-elevation token.

### B.3 Classification rule (corrected)

DOM ancestry inside `PageSurface` is **not** automatic disqualification:

> A standalone card may be rendered within a flat PageSurface when it is an
> independently identifiable unit in the page's primary content composition,
> such as a dashboard grid item. PageSurface itself must remain flat. Nested
> panels and cards within an already elevated standalone card must remain
> flat unless separately authorized.

A surface qualifies only when it is a direct peer in the page's primary
content composition (grid, list, or comparable layout), represents one
self-contained semantic unit (one widget, record, metric, or independently
understandable item), and is not merely a grouping container for a table,
form, page section, notice, filter, or navigation region. Visual resemblance,
a rounded border, or the word "card" in a class/component name is not
sufficient evidence.

### B.4 Semantic opt-in contract

Elevation is a semantic classification, not a visual shortcut.

- The shared UI layer owns the mechanism. The generic `Card` remains flat by
  default; a caller must explicitly select the standalone-card elevation
  through a shared API equivalent to `elevation="standalone"`, rendered with
  a stable marker equivalent to `data-elevation="standalone"`.
- Only the marked standalone state may resolve to `--shadow-surface`.
- Feature components must not reproduce the shadow value, invent local
  elevation utilities, or scatter the Tailwind `shadow-surface` utility as
  an informal elevation mechanism.
- Expanding the inventory requires the classification test in §B.3 plus
  architectural approval; environment-selection cards additionally require
  a separate decision (§B.6).

### B.5 Initial approved standalone-card inventory

Eligible from this amendment's effective date:

1. Independently rendered `WidgetCard` (dashboard widgets), when rendered
   as an independent unit of the dashboard's primary grid composition.
2. Independently rendered `KpiCard`, under the same condition.
3. The organization subscription KPI, when it qualifies as a standalone
   card under §B.3.
4. The Personal Free subscription presentation **through its eligible
   standalone `WidgetCard` container**. `PersonalSubscriptionCard` must not
   receive an additional nested shadow when its parent `WidgetCard` is
   already elevated.

Everything else remains flat until separately classified and authorized,
including feature-local hand-rolled card patterns (no global sweep is
authorized by this amendment).

### B.6 Environment selection

Environment-selection cards remain flat at rest, on hover, and in the
current-selection state. Any future elevation proposal for
`/select-environment` requires a separate decision and separate
visual/accessibility verification.

### B.7 Hover, focus, overlays

- Hover must never increase, replace, or intensify the standalone-card
  shadow; rest and hover resolve to the identical canonical value.
- Elevation never replaces or obscures the accessible focus indicator;
  existing `:focus-visible` outlines and offsets remain mandatory.
- Overlay elevation (dialogs, drawers, menus, popovers, selects, toasts)
  is preserved unchanged.

### B.8 C5 preservation

This amendment is presentation-only. It does not change any C5 or
C5-EXT-01 API, dashboard-summary payload, entitlement or usage calculation,
owner scoping, permission, subscription/plan state, pending-activation
state, or Persian state copy. If the shared dashboard widget containing the
Personal Free card is elevated under §B.5(4), only its container
presentation changes.

### B.9 Design Lab boundary

The Design Lab and `/theme-previews` may demonstrate proposed values or
candidate surface treatments only as clearly identified comparison material.
A value appearing in the Design Lab is not a production-approved token
merely because it is visible there. The production token source remains the
application design-token layer (`frontend/src/styles/index.css`) as governed
by this ADR. Promotion from a Design Lab candidate to production requires an
explicit decision recorded in the relevant ADR or approved design
specification. No Ocean Design Lab phase is authorized by this amendment.

### B.10 SPEC-ODL-01 v1.1 — pending controlled source

`SPEC-ODL-01 v1.1` is **not present in this repository** at the time of this
recording (verified against the branch tree and history at `1d6f8f3e`). It is
recorded here as a **pending controlled source**: no path, content, or clause
is fabricated for it. When its controlled source (repository path, or branch
+ commit, or document version/hash) is supplied, it must be reconciled
against this amendment before any implementation relies on it, and it must
carry a precedence clause equivalent to:

> Production elevation is governed by ADR-0020 as amended by Amendment B.
> PageSurface, page wrappers, nested panels, tables, form sections, inline
> notices, and environment-selection cards remain flat. Only surfaces
> recorded in the approved standalone-card inventory may use
> `--shadow-surface: 0 1px 3px rgb(15 23 42 / 0.035)` through the shared
> semantic opt-in. Design Lab and theme-preview values are comparison
> candidates unless and until promoted by the governing ADR or an approved
> production design specification.

### B.11 Verification required at implementation

Static source gates (PageSurface/default Card/environment cards flat;
standalone opt-in only through the shared mechanism), computed-style
verification at viewport widths 1440, 834 and 390 (canonical value at rest
and hover, `none` for flat surfaces, focus outlines visible, overlay
elevation unchanged), screenshot comparison, unchanged C5 M1 frontend
tests, TypeScript, production build, and all repository CI gates.
