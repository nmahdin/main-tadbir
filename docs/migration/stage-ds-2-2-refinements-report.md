# DS-2.2 Additional Refinements Report

**Status: IMPLEMENTED — CI SUCCESS, pending product-owner acceptance. PR #14 OPEN/unmerged; `main` and production untouched. Frontend presentation only; no business logic or security boundaries altered.**

## Heads

- Start HEAD: `b62b75f` (DS-2.2 + button-contract amendment complete).
- Implementation head: `5bc2238` — CI push run `39129032644` **SUCCESS**, PR run `39129028783` **SUCCESS** (frontend gates + full backend CI; backend untouched).

## 1. Modal exit animations

`Modal` (and `Drawer`/`ConfirmDialog` through it) keeps the dialog mounted for ~160ms on close: `ui-modal-exiting` drives overlay fade (`ui-overlay-out`) and panel `ui-dialog-out` (opacity + 6px translate + scale .99), then unmounts. Under `prefers-reduced-motion` the timeout is 0 and the animations are disabled. Escape dismissal, backdrop click, focus trapping and focus restoration are the untouched `[open]`-effect behavior (focus restore happens as closing begins). Gate: tests pin the 160/0 timing, the exiting class, and the absence of the old immediate `if (!open) return null`.

## 2. Toast position and borderless notifications

Viewport is now `position: fixed; top: max(1rem, env(safe-area-inset-top)); left: max(1rem, env(safe-area-inset-left))` — physical top-left on RTL and LTR. `border: 0` on Toast and Alert; semantic meaning is carried by tinted token surfaces + icons + labels (contrast pairs unchanged from DS-2.1 tones). Shared provider/API unchanged (`ToastProvider`, `toast.*`, `useToast`, `Alert`); errors remain persistent (never auto-dismiss); dedupe/cap rules unchanged.

## 3. Custom radio buttons

New `Radio` + `RadioGroup` in `Primitives`: group label, help text, required marker, error state (`role="radiogroup"`, `aria-labelledby/describedby/invalid/required`, error text `role="alert"`), controlled/uncontrolled value, `options` or child `Radio`s, per-option descriptions and disabled states. Keyboard behavior is the native same-name radio contract (arrows move + select, Space selects, single tab stop), and form integration is native (group `name` submits the chosen value — demonstrated in the showcase via `FormData`). Styling uses the existing global radio control CSS (primary token, focus ring) — no new tokens.

## 4. Search input icon placement

New shared `SearchInput`: icon absolutely positioned at the **physical left** (`left-3`) with `pl-10` on the input; Persian text remains right-aligned by document RTL; clear action (X) appears when there is a value, using `onClear` or a synthetic empty change event. **Adopted by the DataTable toolbar search** (with clear). Inspected app-wide search fields (chat in-conversation search, global search modal, DAM/attachment pickers, content lists): they keep specialized layouts (counters, keyboard navigation) and are documented as opportunistic migrations rather than forced rewrites — the shared component is the standard for new/migrated fields.

## 5. DataTable hover state

`.ui-data-table tbody tr:hover` = 3.5% primary tint; persistent selection = 7% (9% when also hovered). Background-color only (no layout/reflow animation); focus-visible styles of in-row controls untouched; RTL-independent (full-row tint).

## 6. Tabs

Active tab is now a brand surface: `--color-primary` background, white text, primary border (hover darkens to `--color-primary-hover`); the segmented strip, disabled/icon/badge/overflow behavior and ARIA/keyboard semantics are unchanged from DS-2.2.

## 7. Full-page loading

New `FullPageLoader`: 88px soft brand surface (`color-mix` 9% primary, 28px radius) with a large spinner and a slow transform-only soft-pulse; calm label + optional description; centered responsive composition; `role="status"`. Reduced motion disables pulse and spin. It is distinct from section (`LoadingState`), card (`CardSkeleton`), table (`TableSkeleton`/DataTable `loading`), and button (`loading`) patterns — all still demonstrated separately.

## 8. Colored icon buttons

The canonical `Button` gains `tone?: 'primary' | 'success' | 'danger' | 'warning' | 'neutral'`: colored label/icon with tinted hover background + border (ghost/secondary family), no motion-based hover. Icon gap remains exactly the 8px `--button-gap` token; `pill`/`rounded` shapes, the final `0 1px 3px rgb(15 23 42 / .035)` shadow, 36px height and the 120ms `scale(.97)` press feedback are preserved; disabled/loading controls neither act nor animate.

## 9. Showcase

`/_dev/ui-showcase` now interactively demonstrates: modal open/close animation note on the live dialog, borderless top-left toasts + alerts, radio groups (controlled, error state, real form submit), SearchInput with clear, DataTable hover/selection, brand-active Tabs, FullPageLoader (framed sample) alongside section/card/table loading, colored-icon tone buttons in both shapes. Fictional data only; zero network calls; still DEV-gated and absent from the production bundle (grep-verified).

## 10. Verification

- New `frontend/tests/ds22Refinements.test.mjs` (9 gates): modal exit timing/focus contract, toast physical top-left + safe-area + borderless + persistent errors, radio group semantics/form names, SearchInput physical-left positioning + DataTable adoption, hover-vs-selection tint values, brand tab surface, FullPageLoader + reduced motion, button tone themes + 8px gap + press rule, showcase coverage.
- Local: typecheck PASS; **188/188 tests PASS** (179 prior + 9 new, nothing weakened); production build PASS; dev-server smoke test: showcase, Primitives, DataTable modules all HTTP 200.
- Browser-level interaction (actual arrow-key radio traversal, modal focus return) remains pinned at contract level per the DS manual-baseline convention; no browser tooling installed (DS-4 plan unchanged).
- CI at `5bc2238`: push `39129032644` SUCCESS, PR `39129028783` SUCCESS — full frontend + backend CI preserved.

## Bundle / performance

JS 2,579,814 → 2,580,178 B (**+364 B**); CSS 165,263 → 169,251 B (**+3,988 B**). No new dependencies. New animations are opacity/transform-only (compositor-friendly); hover states change background-color only, so no layout/reflow cost. Tracked `dist` rebuilt and committed per repo convention.

## Readiness

Code Complete **YES** (pending acceptance) · Security Verified **YES** for this frontend scope · Dev/CI Ready **YES** · Production Operationally Ready **NO** (unchanged; no deployment).

**PR #14 remains OPEN and UNMERGED. Production untouched. Stopping after this refinement scope.**

## Final HEAD

Final HEAD (implementation): `5bc2238` + this docs commit (see branch tip); CI results above; PR #14 open/unmerged.
