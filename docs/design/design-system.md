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
