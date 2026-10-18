# DS-1 Design System Foundation + DS-2 UI Showcase

Status: implemented on `arena/582a70e5-main-tadbir` (PR #14, open,
unmerged). Product character: calm, simple, welcoming; RTL-first,
Persian-first (Vazirmatn); comfortable for small teams (<10);
progressive disclosure over dense enterprise dashboards.

## 1. Audit findings (what existed, what was inconsistent)

- **Strong base already present**: `src/index.css` defines a
  `:root` token block (`--color-primary: #4f46e5`, semantic
  success/warning/danger/info, surface/border/text, radii,
  `--control-height: 2.5rem`, form-action geometry), global
  control styling (buttons, inputs, selects, checkboxes/radios,
  focus rings), and `src/components/common/Primitives.tsx`
  (Button with variants + form-action pattern, Input/Textarea/
  Select, FormField, Modal with focus trap + Escape, Drawer,
  ConfirmDialog, PageHeader, Loading/Empty/Error states, Skeleton).
- **Inconsistencies consolidated in DS-1**:
  - Buttons had variants but NO size scale → added `sm|md|lg`
    (default `md` = 40px token height; existing geometry unchanged).
  - Checkboxes existed only as global CSS → added a labeled
    `Checkbox` primitive (label, description, disabled).
  - No Card or Badge primitive (pages hand-rolled `rounded-*`
    wrappers and ad-hoc pills) → added token-driven `Card`
    (title/description/one action slot) and `Badge` (six fixed
    semantic tones). Priority/status pills remain as domain badges.
  - Tables had no shared foundation → added semantic
    `Table/TableRow/TableCell` wrappers with token styling.
  - Controls had no invalid state → `invalid` prop +
    `aria-invalid` + danger focus ring on Input/Textarea/Select;
    FormField already rendered role="alert" errors.
  - Pages still use arbitrary Tailwind color/radius utilities
    widely (legacy surface). DS-1 does NOT mass-rewrite pages;
    the contract below is binding for new work and the ratchet
    applies per touched page (CODING_STANDARDS convention).
- No third-party component framework was added (audit shows no
  concrete requirement; the existing primitives + Tailwind 4
  cover the contract).

## 2. Token contract (binding)

Source of truth: CSS variables in `src/index.css` (`:root`),
consumed by the `.ui-*` component classes and Tailwind utilities.

| Token | Value | Meaning |
|---|---|---|
| `--color-primary` | `#4F46E5` | brand / primary action |
| `--color-primary-hover` | `#4338CA` | primary hover |
| `--color-success/warning/danger/info` | `#16A34A/#D97706/#DC2626/#0284C7` | semantic states |
| `--color-background/surface/surface-muted` | `#F8FAFC/#FFFFFF/#F1F5F9` | surfaces |
| `--color-border` | `#E2E8F0` | separators |
| `--color-text/text-muted` | `#0F172A/#64748B` | text (AA on surface) |
| `--control-height` | `2.5rem` (40px) | standard control height |
| `--radius-md` | `.75rem` (12px) | standard control radius |
| `--radius-sm/lg` | `.625rem/1rem` | secondary radii |
| font | Vazirmatn Variable | all UI text (mono only for code) |
| spacing | 4px base (Tailwind scale) | icon-to-label gap = 8px (`gap-2`) |
| density | comfortable default | compact only via named variants (`size="sm"`, form-action pattern) |

States: hover (border/background shift), focus-visible (2px
primary outline + offset; inputs 3px soft ring), disabled
(opacity + not-allowed), loading (spinner + `aria-busy`), error
(danger border/ring + role="alert" message).

## 3. Component API (src/components/common/Primitives.tsx)

`Button{variant, size, action, loading}`, `IconButton{label,
purpose}`, `Input/Textarea/Select{invalid}`, `Checkbox{label,
description}`, `FormField{label, error, required}`, `Modal`,
`Drawer`, `ConfirmDialog`, `Card{title, description, actions}`,
`Badge{tone}`, `Table{columns, caption}/TableRow/TableCell`,
`PageHeader{title, description, actions}`, `LoadingState`,
`EmptyState`, `ErrorState{onRetry}`, `Skeleton`, `Avatar`,
`DateInput`, `PriorityBadge`, `StatusBadge`.

Calm UX patterns (binding for new pages): one clear primary
action per region (`PageHeader.actions` / `Card.actions`),
simple headers, empty states that say what happens next,
progressive disclosure for advanced filters (showcase demo),
navigation filtered by authorized + active modules (existing
shell behavior), and UX-01-ready composition: regions are
`Card` sections whose order/visibility a future layout engine
can govern without page rewrites (no UX-01 engine in this stage).

## 4. DS-2 showcase

Route: **`/_dev/ui-showcase`** (`src/features/showcase/UiShowcasePage.tsx`),
registered ONLY under `import.meta.env.DEV` with `React.lazy`.
Production builds statically eliminate the dynamic import —
verified: the showcase chunk is ABSENT from `dist/assets`
(searched for route + component markers after `npm run build`).
Content: button variants/sizes/loading/disabled, form controls
with validation + invalid states, checkbox states, badges,
table, Card regions, modal + confirm interactions (focus trap,
Escape), loading/empty/error states, progressive-disclosure
demo, RTL/responsive notes. Entirely fictional Persian data;
zero API calls; no auth context.

**Windows local instructions**:

```powershell
cd frontend
npm install
npm run dev
# open http://localhost:3000/_dev/ui-showcase
```

## 5. Visual/accessibility verification

- Automated: `tests/designSystem.test.mjs` (token contract,
  primitive APIs, dev-only gate, no-API showcase) + the full
  frontend suite (150 existing tests re-run), typecheck, build.
- Manual screenshot baseline (Playwright is present in the repo
  config but screenshot regression is NOT yet wired): open the
  showcase at 1440px and 390px widths, capture (a) full page,
  (b) modal open, (c) validation error state; store under
  `docs/design/baselines/` in DS-4. DS-4 plan: adopt
  `@playwright/test` screenshot assertions against these
  baselines once the browser toolchain is pinned in CI.
- RTL/keyboard: html is `lang="fa" dir="rtl"`; keyboard walk
  (Tab order, visible focus ring, Escape closes modal, focus
  returns) is demonstrated live in the showcase; Modal traps Tab.

## 6. Bundle (SPEC-PERF-01)

Measured with `npm run build` (Vite, all chunks):

| | before DS-1/2 | after DS-1/2 |
|---|---|---|
| total JS bytes (dist/assets) | 2,572,652 | 2,572,895 (+0.01%) |
| showcase in prod bundle | — | absent (0 bytes) |

No new dependencies. No Redis/backend caching added.

## 7. Recommended corrections before C7-4

1. C7-4 settings pages should compose ONLY from DS-1 primitives
   (FormField + controls; secret fields use Input type="password"
   with metadata-only read states, per C7-3 contract).
2. Ratchet: replace hand-rolled page cards/pills with Card/Badge
   opportunistically when pages are touched; do not mass-rewrite.
3. Pin the Playwright browser in CI and land DS-4 screenshot
   baselines before large page work.

---

# DS-2.1 Design System Refinements

## 8. Button geometry (DS-2.1)

| Token | Value | Meaning |
|---|---|---|
| `--button-height` | `2.25rem` (36px) | standard Button |
| `--button-height-sm` | `2rem` (32px) | compact (`size="sm"`) |
| `--button-height-lg` | `2.75rem` (44px) | large (`size="lg"`) |
| `--button-radius` | `1rem` (16px) | all buttons + icon buttons |
| `--button-padding-inline` | `1rem` (sm `.75rem`, lg `1.25rem`) | consistent padding |
| `--button-gap` | `.5rem` (8px) | icon-to-label gap |
| `--control-height` | `2.5rem` (40px) | Input/Textarea/Select — unchanged |

Variants unchanged: `primary | secondary | ghost | danger | success | warning`,
with visible `:focus-visible` outline and disabled/loading states. Form
alignment is intentional: labels sit above 40px controls and action rows use
end-alignment (`items-end`), so the 36px button reads as a deliberate action
next to a 40px field (demonstrated in the showcase). The pre-existing
explicit compact `action="save|cancel|delete|create"` form pattern (34px,
`--form-action-min-height: 2.125rem`) is a separate, stable contract guarded
by `uiCorrectionRegression` tests and was not silently changed.

Per-page override audit (grep, this change): 34 files use the shared
`Button`; ~907 raw `<button>` elements exist in feature pages, 102 of them
with explicit Tailwind `rounded-*` classes. Tailwind classes outrank the
global element rule, so those keep their local radius by cascade — the
DS-2.1 global default (16px) governs unclassed buttons, and raw buttons are
a documented incremental-migration (ratchet) item, not a mass rewrite.

Note on hit targets: 36px (and 32px compact) meet WCAG 2.2 AA target-size
minimum (24px) but not the 44px AAA/Apple guideline — flagged for product
review; compact size should stay limited to dense toolbars.

## 9. Toast / Alert notification system

One application-level service: `frontend/src/components/common/Notifications.tsx`.

- `ToastProvider` — mounted once at the app root (`src/app/App.tsx`); renders
  the stack at the logical inline-start in RTL, `z-index: 100`.
- Imperative API (usable from any module, queued until the provider mounts):
  `toast.success(title, opts?)`, `toast.error(...)`, `toast.warning(...)`,
  `toast.info(...)`, `toast.show({ kind, title, description, durationMs, dedupeKey })`.
- React API: `useToast()` with the same four helpers.
- Queue rules (pure logic in `notificationLogic.ts`, unit-tested): max 5
  visible; identical notifications (same kind+title+description or explicit
  `dedupeKey`) inside 4s collapse into one; when the cap is hit the oldest
  auto-dismissible toast is evicted before any persistent error.
- Timing: success/info 5s, warning 8s, **errors never auto-dismiss** (they
  remain accessible until closed); hovering/focusing a toast pauses its
  timer; Escape closes a focused toast; every toast has a labelled close
  button; error/warning use `role="alert"`, success/info `role="status"`.
- `Alert` (same module) is the persistent inline counterpart for page-level
  messages: tone, title, description, optional actions and close.
- `AppContext.notify()` (the legacy entry point used across pages) is now a
  thin adapter over this service, and the old AppContext-backed
  `ToastViewport` renderer was removed — exactly one renderer exists.
  The adapter no longer renders raw HTTP/request-id `detail` in toasts.
- Safety: pass calm, user-safe summaries only — never raw API payloads,
  credentials, or sensitive record data.

## 10. DataTable

`frontend/src/components/common/DataTable.tsx` (pure state logic in
`dataTableLogic.ts`, unit-tested). The DS-1 semantic `Table` primitives and
the simple `WorkspacePatterns.DataTable` wrapper remain for static layouts.

- Columns: `{ key, header, accessor?, render?, sortable?, filterOptions?, hideable?, align? }`;
  typed row identity via `rowKey` (keyof or extractor).
- Client mode (default): global search, per-column filter dropdowns,
  single-column sort cycle (none → asc → desc → none, `aria-sort`),
  pagination with page-size choices, clamping to valid pages.
- Server mode (`mode="server"` + `total`): renders exactly the given page
  and reports `DataTableServerState { page, pageSize, offset, sort, query,
  filters }` through `onStateChange`; the caller fetches that page. The
  table itself never fetches — no new backend endpoint, no full-tenant
  pulls into the browser.
- Row selection (page checkbox with indeterminate state, selection count,
  `bulkActions` slot), column-visibility menu, row actions slot, loading
  skeleton rows, empty state, error state with retry, RTL throughout,
  horizontal scroll on narrow screens.
- State is controlled (`state` + `onStateChange`) or uncontrolled
  (`defaultState`). Any search/filter/sort/size change returns to page 1.
- No table library was adopted: the sorting/filter/pagination surface is
  small, token styling and RTL/aria-sort behavior stay fully ours, and the
  bundle cost is ~7KB total for all of DS-2.1 (measured below).

## 11. Branded custom Select

`frontend/src/components/common/Select.tsx`, re-exported from `Primitives`
so all ~83 existing `<Select>` call sites migrated with zero changes.

- Same contract: `value`/`defaultValue`, `onChange` receiving an event
  whose `target.value` is the new value, `<option>` children (or an
  `options` prop), `id` for `FormField`, `name` for form submission,
  `disabled`, `required`, `invalid`, `className`.
- Fully branded trigger/popup on the tokens (40px control height, 12px
  radius, token borders/focus ring); chevron, selected check indicator,
  placeholder from the empty option or `placeholder` prop.
- Accessibility — WAI-ARIA listbox with `aria-activedescendant`: focus
  stays on the trigger (or the search input when `searchable`), so it is
  never lost into the popup; ArrowUp/Down/Home/End navigate (skipping
  disabled options), Enter/Space select, Escape closes and refocuses the
  trigger, Tab closes, click-outside dismisses, type-ahead jumps by label.
  `aria-haspopup/expanded/controls`, option `aria-selected`/`aria-disabled`,
  popup flips upward near the viewport bottom and the active option
  scrolls into view. Pure navigation math lives in `selectLogic.ts` and is
  unit-tested; no external headless library was needed at this scope,
  which keeps bundle and RTL behavior under our control.
- States: disabled, loading (spinner, opening blocked, `aria-busy`),
  invalid (`aria-invalid` + danger border + automatic
  `aria-describedby` to the FormField error), required (`aria-required`).
- Form integration: a hidden native `<select>` (aria-hidden, unfocusable)
  stays in the DOM carrying `name`/`value`, so form submission and
  progressive enhancement keep working unchanged.
- Scope limits (deliberate): `multiple` keeps the native control (no
  caller uses it); ~140 raw lowercase `<select>` elements in legacy pages
  were not force-migrated — they keep the global chevron styling and are a
  ratchet item. Rich option content (icons/avatars) is not supported;
  labels are text.

## 12. Showcase & bundle (DS-2.1)

`/_dev/ui-showcase` adds: new button dimensions + form-alignment demo,
four toast triggers + dedupe demo, four inline Alerts, client-mode
DataTable over a fictional Projects dataset, a server-mode DataTable fed
by a locally simulated page contract, and Select demos (normal,
searchable, disabled, loading, invalid, real form submission via the
hidden native fallback). Still fictional-data-only, still DEV-gated and
lazy: production `dist` contains no showcase chunk (grep-verified).

Bundle (total JS in `dist/assets`): 2,572,895 B (DS-2 head) →
2,579,759 B (**+6,864 B, +0.27%**) for Toast+Alert+DataTable+Select.
No new dependencies; backend untouched; no Redis/caching introduced.
