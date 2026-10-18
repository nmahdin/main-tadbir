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

---

# DS-2.2 Design Refinements

## 13. Buttons (refined)

Final values: height **36px** (`--button-height: 2.25rem`), radius **18px**
(`--button-radius: 1.125rem` — chosen over 16px for the calmer, rounder
reference look), soft shadow `--button-shadow: 0 1px 2px rgb(15 23 42 / .07),
0 2px 6px rgb(15 23 42 / .05)`; pressed state insets the shadow
(`--button-shadow-active: inset 0 1px 2px rgb(15 23 42 / .14)`); ghost stays
flat. Hover changes color/background/border only; the visible motion is the
pressed feedback after click and the spinner during submit (existing
`loading` behavior: spinner + disabled + `aria-busy`). Icons keep
`currentColor`, so colored icons are a call-site choice
(`<CheckCircle2 className="text-emerald-600" />` inside a secondary/ghost
button) — demonstrated in the showcase. Focus-visible outline unchanged.

## 14. Tabs

Shared `Tabs` in `Primitives.tsx` (no navigation framework):
`items: { id, label, icon?, badge?, disabled? }[]`, controlled
(`value`/`onChange`) or uncontrolled (`defaultValue`), optional
`panel(activeId)` renderer. WAI-ARIA tabs with automatic activation:
roving tabindex, Arrow keys (RTL-aware via `document.dir`), Home/End,
disabled tabs skipped, scrollable strip (`overflow-x: auto`) for overflow.

## 15. Badge sizes

`Badge` gains `size: 'xs' | 'sm' | 'md'` (default `sm`, the DS-1 geometry)
and `usage: 'status' | 'count'`; count renders the compact tabular-numeric
pill used in tabs/cards/tables. Tones unchanged
(neutral/primary/info/success/warning/danger).

## 16. Card & loading patterns (showcase compositions)

Card patterns are compositions of the existing `Card`/`Badge`/`Button`:
stat, content/action, list, project/task (progress), warning/action-needed,
empty, and skeleton cards. Loading patterns are shared primitives:
`PageLoadingState` (page), `LoadingState` (section), `CardSkeleton`,
`TableSkeleton`, DataTable `loading`, Button `loading` (form submit), and
`InlineLoading` (inline). Prefer skeletons wherever the final layout is
known in advance.

## 17. Motion rules

Only short entrance/state motion: `--motion-duration: .18s`,
`--motion-easing: ease-out`; `ui-fade-slide` (6px rise + fade) for card
entrance and toasts, `ui-dialog-in` for dialogs, `ui-collapse`
(grid-rows) for expand/collapse, and the button pressed shadow. No hover
layout animation, no bounce, nothing longer than 200ms.
`prefers-reduced-motion: reduce` disables all DS animations/transitions.
Bundle effect: JS 0 B (new components are showcase-only and tree-shaken
out of production), CSS +2,884 B.

---

# DS-2.2 Amendment — Final Button Design Contract

Supersedes the radius/shadow values in §13 (heights and all other DS-2.2
items unchanged).

- Exactly two named shapes on the single shared `Button`
  (`shape?: 'pill' | 'rounded'`, default `'rounded'` for backward
  compatibility): `--button-radius-rounded: .75rem` (12px),
  `--button-radius-pill: 9999px`; `--button-radius` remains as the rounded
  alias so global rules keep resolving.
- Height stays **36px** (sm 32px, lg 44px).
- Final shadow: `--button-shadow: 0 1px 3px rgb(15 23 42 / .035)` —
  a single, significantly lighter soft shadow (ghost stays flat).
- Press feedback on all interactive shared controls (Button incl.
  IconButton, and Tabs): `transform: scale(.97)` while `:active`,
  `transition: transform .12s ease`, smooth return, no bounce, no hover
  movement (hover remains color/border/background only).
- `@media (prefers-reduced-motion: reduce)`: press transform is disabled;
  visible feedback remains via color change and the inset pressed shadow
  (`--button-shadow-active`).
- Disabled and loading buttons are `disabled` (loading implies disabled +
  `aria-busy`), so they never execute actions or animate as active.
- Keyboard: the component stays a real `<button type="button">`, so
  Space/Enter activation and the 2px primary focus-visible outline are
  native/unchanged.
- Showcase: both shapes × semantic variants, colored icons, and written
  press/reduced-motion guidance in the Buttons card. Contract gates live
  in `frontend/tests/ds22ButtonAmendment.test.mjs` (source-level, per the
  DS manual-baseline convention — no browser tooling installed).

---

# DS-2.2 Additional Refinements

- **Modal exit animation:** closing keeps the dialog mounted ~160ms with
  `ui-dialog-out` (opacity + 6px/scale .99) and overlay fade; unmount
  happens after. Escape, backdrop, focus trap and focus restoration are
  unchanged (same `[open]` effect); under `prefers-reduced-motion` the
  wait and animation are skipped.
- **Toasts:** viewport anchored at the **physical top-left**
  (`top/left: max(1rem, env(safe-area-inset-*))`) on LTR and RTL alike.
  Toast and Alert are **borderless**; semantic tinted surfaces
  (color-mix of the tone color) carry meaning with icons and labels.
  Errors still never auto-dismiss.
- **Radio/RadioGroup** (`Primitives`): native radios inside a
  `role="radiogroup"` with label/help/error wiring (`aria-invalid`,
  `role="alert"` error). Arrow-key navigation and Space selection are
  native same-name group behavior; form submission carries the group
  name/value. Token styling matches other controls (global radio CSS).
- **SearchInput** (`Primitives`): search icon on the **physical left**
  (`left-3` + `pl-10`) while Persian text stays right-aligned; optional
  clear action (explicit `onClear` or a synthetic empty change). The
  DataTable toolbar uses it; hand-rolled page search fields migrate
  opportunistically (chat/global-search keep their specialized layouts).
- **DataTable rows:** hover tint 3.5% primary, persistent selection 7%
  (9% on hover) — background-only changes, no layout animation.
- **Tabs:** active tab is a brand surface (`--color-primary` background,
  white text) inside the segmented strip.
- **FullPageLoader** (`Primitives`): large spinner on a soft brand
  surface (`color-mix` 9% primary, soft pulse transform animation),
  calm label/description, `role="status"`; reduced motion stops both
  pulse and spin. Distinct from section/card/table/button loading.
- **Colored icon buttons:** the canonical `Button` gains
  `tone: 'primary'|'success'|'danger'|'warning'|'neutral'` — colored
  icon+label with tinted hover surface/border (no motion), the 8px
  `--button-gap` token, both shapes, the final soft shadow, 36px
  height, and the 120ms press feedback all preserved.

## 18. DatePicker (DS-2.3)

Shared `DatePicker` (`components/common/DatePicker.tsx`, logic in `datePickerLogic.ts`).
Values are **date-only ISO Gregorian strings `YYYY-MM-DD`** — never date-time, never
locale-formatted — so backend contracts stay stable and timezone-free (all arithmetic is
UTC-based). Display calendar is Jalali by default (`calendar="gregorian"` optional);
conversion delegates to the existing tested `utils/jalali.ts` (round-trip verified
2000–2099), so no calendar arithmetic was re-implemented and no date library was added.
Supports single and range selection (second earlier click auto-swaps; a click after a
complete range restarts), month/year navigation (selects + prev/next), `min`/`max` and
explicit `disabledDates` rendered as real disabled day buttons, clear action, and full
keyboard support: RTL-aware day/week arrows, PageUp/PageDown month jumps, Enter/Space to
pick, Escape closes and refocuses the trigger, focus follows the focused day cell.
`PersianDatePicker` remains for its current call sites; new screens use `DatePicker`.

## 19. Dropdown / Popover / Tooltip (DS-2.3)

`components/common/Overlays.tsx`. `DropdownMenu`: `menu`/`menuitem` roles, roving
focus, RTL-aware placement with viewport flip, Escape/outside-click dismissal returning
focus to the trigger, disabled and danger items. `Popover`: non-modal `dialog` panel,
Escape/outside dismissal, focus returns to trigger (no focus trap — it must not steal
context the way Modal does). `Tooltip`: plain-text only, shown on hover **and** focus,
announced via `aria-describedby`; never put sensitive or essential content in tooltips.

## 20. Drawer (DS-2.3)

`Drawer` is the Modal family in side-panel form (existing alias over `Modal drawer`),
so focus trapping, focus restoration, Escape dismissal, scroll locking and the ~160ms
exit animation are shared, not duplicated. It is full-width on small screens and a
right-side panel on larger ones (RTL start side). Use it for record detail view/edit;
use `Modal` for focused decisions and `ConfirmDialog` for destructive confirmation.

## 21. Empty states (DS-2.3)

`EmptyState` carries an explicit `variant`: `first-use` (nothing created yet),
`no-results` (filter/search matched nothing), `no-permission` (content exists but is
unavailable to the viewer), and `error` (the request failed; `role="alert"` and a
retry action). Do not render a failed request as an empty dataset, and do not render
a permission denial as "no data". At most one contextual primary `action` per state.

## 22. Form validation (DS-2.3)

`FormField` is the single form-row contract: label (+ required mark), `helpText`,
`error`, and automatic wiring — the child control receives `aria-describedby`
(error id wins over help id) and `invalid` when an error is present, unless the
caller set them explicitly. It composes Input, custom Select, RadioGroup,
Checkbox and DatePicker. Auth and invitation forms keep their existing fields;
new forms must use `FormField` rather than hand-rolled label/error markup.
