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

---

## Amendment C — Rounded primary content surfaces

**Status: ACCEPTED (Product Owner Approved, 2026-11-01).**
This amendment is appended; the original decision (above) and Amendment B are
preserved verbatim and remain in force on the surfaces each governs. Frontend
implementation requires a separate authorization directed to the Frontend
Agent; this amendment records the architectural contract only. No historical
decision is silently rewritten.

### C.1 Canonical radius and shadow contract

Amendment C introduces a radius hierarchy for classified content surfaces.
The approved canonical values are:

```css
--radius-content-primary: 24px;
--radius-card-standalone: 20px;
--radius-panel-nested: 16px;
--radius-control: 12px;

--shadow-surface: 0 1px 3px rgb(15 23 42 / 0.035);
```

### C.2 Token-name reconciliation

The existing design-token layer defines three abstract radius variables:
`--radius-sm: .625rem` (10px), `--radius-md: .75rem` (12px) and
`--radius-lg: 1rem` (16px). Amendment C's `--radius-control` (12px) and
`--radius-panel-nested` (16px) align exactly with `--radius-md` and
`--radius-lg` respectively; those aliases may bind to the existing
abstract values without duplicating tokens.

Two tokens extend the existing set with **new** values and therefore
require explicit additive definitions at the Frontend-Agent
implementation step:

- `--radius-content-primary: 24px;` (1.5rem) — no existing token
  provides 24px at any layer; a literal new CSS custom property is
  required.
- `--radius-card-standalone: 20px;` (1.25rem) — sits between the
  current `--radius-lg` (16px) and any future larger radius; no
  existing token may be silently reused because the existing
  `--radius-lg` remains 16px for nested panels per this amendment.

The existing `--shadow-surface: 0 1px 3px rgb(15 23 42 / 0.035)` set by
Amendment B is reused unchanged by Amendment C. No new shadow value is
introduced.

To avoid duplicating or conflicting tokens, the Frontend Agent must
bind the aliases exactly as above and must not introduce parallel
"content-radius" / "card-radius" synonyms.

### C.3 Classification

Amendment C governs a **new** surface category: the *Primary Content
Container*. The classification rules are additive to, not replacements
for, the rules of the original ADR and Amendment B.

- `PageSurface` remains a flat structural wrapper (`--shadow-surface:
  none`), exactly as decided in the original ADR. Rounding of
  PageSurface itself is outside this amendment; the 24px radius
  applies only to the explicitly classified Primary Content Container
  rendered inside PageSurface, not to PageSurface itself.
- A **Primary Content Container** is a deliberately classified,
  top-level content region whose boundary frames the page's primary
  content (for example, the main content card of a settings page, an
  authenticated onboarding content panel, or an equivalently scoped
  semantic primary-content wrapper). When so classified, it may render
  with `--radius-content-primary` (24px) and the canonical
  `--shadow-surface` shadow.
- Independently rendered standalone dashboard KPI/widgets remain
  governed by **Amendment B**: they retain
  `--shadow-surface: 0 1px 3px rgb(15 23 42 / 0.035)` but now round to
  `--radius-card-standalone` (20px) instead of any prior value.
  Amendment B's standalone-card semantic opt-in (`data-elevation`
  / `elevation="standalone"`) continues to be the only authorized
  adoption point; the shared layer must bind the radius in addition
  to the shadow when rendering a standalone card.
- Nested panels (panels inside an elevated standalone card or inside
  a primary content container) remain flat in shadow and, where
  rounding is appropriate, use `--radius-panel-nested` (16px =
  `--radius-lg`). Nested panels must never cast `--shadow-surface`.
- Inputs, selects, buttons, and comparable interactive controls
  adopt `--radius-control` (12px = `--radius-md`). Existing button
  geometry tokens (`--button-height`, focus outlines, and the DS-2.1
  smaller-button geometry) are unchanged in interaction semantics,
  padding, or hit targets; only the target radius is normalized.
- Floating overlays (dialogs, drawers, popovers, menus, selects'
  popup layer, toasts, tooltips) remain independently governed by
  their existing overlay-shadow contracts and are **not** altered by
  this amendment.
- Environment-selection cards at `/select-environment` remain flat
  (no shadow, no primary-container rounding) unless separately
  authorized — consistent with Amendment B §B.6.
- Hover must never increase, replace, or intensify `--shadow-surface`,
  for both Primary Content Containers and Amendment B standalone
  cards. Rest and hover resolve to the identical canonical value.

### C.4 Composition rules

A Primary Content Container must not automatically wrap an already
elevated dashboard card grid. The Frontend Agent must ensure:

- No stacked elevation: a Primary Content Container and an
  Amendment-B standalone card may not both render with
  `--shadow-surface` along an ancestor–descendant chain. Exactly one
  shadow in a containment chain is authorized; descendant surfaces
  inside an elevated container stay flat.
- No duplicate nested shadows, no unnecessary wrapper nesting, and
  no excessive mobile padding. The 24px rounding may only be applied
  to surfaces explicitly marked with the primary-content semantic
  classification; classification is selective and semantic, not an
  automatic sweep across every PageSurface consumer.
- Existing flat surfaces that do not meet the explicit classification
  criteria remain unchanged: tables and table wrappers, form sections
  and field groups, inline notices/banners/alerts, navigation and
  filter containers, toolbar rows, and environment-selection cards
  continue to render with the radius they carry today and no shadow.
- A primary content container may contain Amendment-B standalone
  cards only when those cards are themselves the page's primary
  composition (e.g., the dashboard KPI grid itself forms the primary
  content); in that case the outer wrapper is flat and the individual
  cards carry the standalone elevation, never the reverse.

### C.5 Precedence

The three recorded decisions coexist with narrow, non-overlapping
scope:

1. **Original ADR-0020 (historical flat-surface baseline):** page
   wrappers and standard content surfaces (`PageSurface` and
   equivalent) are flat (`--shadow-surface: none`). This remains the
   default for everything not classified by a later amendment.
2. **Amendment B (standalone-card elevation):** independently
   identifiable standalone cards (dashboard widgets/KPIs, the
   Personal Free subscription container) may receive
   `--shadow-surface` through the shared semantic opt-in; PageSurface,
   nested panels, tables, forms, notices and environment-selection
   cards remain flat.
3. **Amendment C (rounded primary content surfaces):** introduces the
   Primary Content Container category (24px radius + canonical
   `--shadow-surface`) and the radius hierarchy (24 / 20 / 16 / 12 px).
   It governs only the newly classified Primary Content Container and
   the radius tokens for the surfaces listed in §C.3; the shadow
   value is reused from Amendment B, not replaced. Amendment B
   continues to govern standalone-card elevation and its opt-in
   contract; the original ADR continues to govern PageSurface
   flatness.

No historical decision has been silently rewritten. Any conflict
between an existing component-level radius and the new hierarchy must
be reconciled by the Frontend Agent during implementation, binding
each component to the single appropriate alias rather than inventing
local values.

### C.6 Design Lab boundary

Amendment C is a production architectural decision. Ocean Design Lab
remains a separately controlled package governed by B.9: values shown
in Design Lab are comparison candidates unless and until promoted by
an ADR or an approved design specification. Promotion of candidate
values shown in the lab requires a recorded decision equivalent to
this amendment; the Design Lab does not implicitly authorize any
change. No Ocean Design Lab implementation is authorized by this
amendment.

### C.7 UX-REVIEW-013 — separate frontend defect

The independent UX review identified one defect that is **not** part
of the surface-classification decision and is not addressed by this
amendment:

> **UX-REVIEW-013 — Custom-selector search-icon framing and text overlap.**
> The search affordance inside custom selectors exhibits a framing /
> text-overlap defect between the icon and adjacent text at the
> reviewed viewport widths.

This defect is recorded for independent frontend triage. It must
receive its own verification evidence (computed spacing, 1440 / 834 /
390 screenshot capture, accessible tap target, unchanged C5 M1 / UX
gate tests). It is not authorized for correction in this
documentation commit; any correction belongs to the Frontend Agent
under a separate change.

### C.8 Verification required at implementation

Static source gates (PageSurface flat by default; primary-content
classification used only at the explicit semantic opt-in; standalone
cards adopt the 20px radius via the shared mechanism; nested panels
flat; controls at 12px; environment cards flat; hover shadow
identical to rest), computed-style verification at viewport widths
1440, 834 and 390 for each classified surface category, screenshot
comparison, no shadow stacking, unchanged C5 M1 and existing
frontend gate tests (typecheck, test suite, production build), and
all repository CI gates. ADR-0020 Amendment B tests must continue to
pass with the standalone-card radius now bound to 20px and the
shadow value unchanged.
