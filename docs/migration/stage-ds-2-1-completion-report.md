# Stage DS-2.1 Completion Report — Design System Refinements

**Status: IMPLEMENTED — CI SUCCESS, pending product-owner acceptance. PR #14 OPEN/unmerged; `main` and production untouched.**

## 1. Heads

- Start HEAD: `914b9c0` (DS-1+DS-2 complete).
- Implementation head: `77208af` — CI push run `39123990239` **SUCCESS**, PR run `39123986842` **SUCCESS** (frontend typecheck/tests/build + full backend suite).
- Commits: `c1c6fdc` button geometry + Toast/Alert · `cb3bb06` branded Select + DataTable · `77208af` showcase + tests · docs commit follows this report.

## 2. Components modified and created

Created:
- `frontend/src/components/common/Notifications.tsx` — `ToastProvider`, imperative `toast`, `useToast`, inline `Alert`.
- `frontend/src/components/common/notificationLogic.ts` — pure queue rules (dedupe window, cap/eviction, lifetimes), unit-tested.
- `frontend/src/components/common/Select.tsx` — branded custom dropdown; re-exported from `Primitives`.
- `frontend/src/components/common/selectLogic.ts` — pure keyboard/search logic, unit-tested.
- `frontend/src/components/common/DataTable.tsx` — reusable DataTable (client + server modes).
- `frontend/src/components/common/dataTableLogic.ts` — pure sort/filter/paginate/selection logic, unit-tested.
- `frontend/tests/ds21.test.mjs` — 12 new contract/logic tests.

Modified:
- `frontend/src/index.css` — DS-2.1 tokens + toast/alert/select/data-table styles.
- `frontend/src/components/common/Primitives.tsx` — `Select` now re-exports the branded component (same props contract).
- `frontend/src/app/App.tsx` — `ToastProvider` mounted once at the root; legacy viewport mounts removed.
- `frontend/src/context/AppContext.tsx` — legacy `notify()` is a thin adapter over the toast service.
- `frontend/src/components/common/Feedback.tsx` — old AppContext-backed `ToastViewport` removed (exactly one notification renderer).
- `frontend/src/features/showcase/UiShowcasePage.tsx` — DS-2.1 sections.
- `frontend/tests/designSystem.test.mjs` — Select location assertion updated (re-export), no assertion weakened.
- `docs/design/design-system.md` — DS-2.1 sections 8–12.

## 3. Actual token values

| Token | Value |
|---|---|
| `--button-height` | 2.25rem = **36px** (standard) |
| `--button-height-sm` | 2rem = **32px** (compact) |
| `--button-height-lg` | 2.75rem = **44px** (large) |
| `--button-radius` | 1rem = **16px** |
| `--button-padding-inline` | 1rem (sm .75rem, lg 1.25rem) |
| `--button-gap` | .5rem = 8px icon gap |
| `--control-height` | 2.5rem = **40px** (Input/Textarea/Select unchanged) |
| `--radius-md` | .75rem = 12px (controls) |
| `--color-primary` | `#4F46E5` (unchanged) |

Variants: primary/secondary/ghost/danger (+success/warning retained). Focus-visible outline and disabled/loading states unchanged. Form rows align by label-above + `items-end` action rows; the pre-existing explicit `action=` compact form pattern (34px) remains a separate stable contract (guarded by `uiCorrectionRegression`). Audit: 34 files use shared `Button`; ~907 raw `<button>` elements exist in feature pages (102 with explicit Tailwind radius classes that outrank the global rule) — documented ratchet item, no mass rewrite.

## 4. Toast/Alert API

```ts
toast.success(title, { description?, durationMs?, dedupeKey? })
toast.error(title, opts?)    // persistent by default
toast.warning(title, opts?)  // 8s
toast.info(title, opts?)     // 5s (success also 5s)
toast.show({ kind, title, description, durationMs, dedupeKey })
useToast()                    // same helpers via context
<ToastProvider>               // mounted once at app root
<Alert tone="success|error|warning|info" title description? actions? onClose? />
```

Queue: max 5 visible, identical notifications collapse within 4s (dedupe key), oldest auto-dismissible evicted before persistent errors; hover/focus pauses timers; Escape closes a focused toast; error/warning `role="alert"`, success/info `role="status"`; RTL logical-inline-start positioning. `ConfirmDialog` unchanged for destructive actions. `AppContext.notify()` delegates here; raw HTTP/request-id detail is no longer rendered in toasts. Rule: calm user-safe summaries only — never raw API payloads or sensitive data.

## 5. DataTable capabilities

Column definitions with typed `rowKey`; sorting (none→asc→desc→none, `aria-sort`); global search; per-column filter dropdowns; pagination + page size; row selection with indeterminate page checkbox and `bulkActions`; column visibility menu; row actions; loading skeleton, empty and error (+retry) states; RTL; horizontal-scroll responsive behavior; controlled (`state`/`onStateChange`) or uncontrolled (`defaultState`) state. **Server mode**: renders only the given page and emits `DataTableServerState { page, pageSize, offset, sort, query, filters }` — the component never fetches, no backend endpoint was added, and no full tenant dataset enters the browser. Simple DS-1 `Table` primitives preserved. No table library adopted (small surface, full RTL/ARIA control, ~7KB total DS-2.1 bundle cost).

## 6. Custom Select accessibility approach

WAI-ARIA listbox pattern with `aria-activedescendant`: focus stays on the trigger (or the search field in the searchable variant) and is never lost into the popup. Arrows/Home/End navigate skipping disabled options; Enter/Space select; Escape closes and refocuses the trigger; Tab closes; click-outside dismisses; type-ahead by label; popup flips near the viewport edge; active option scrolls into view; `aria-haspopup/expanded/controls/selected/disabled/invalid/required/busy` wired; automatic `aria-describedby` to the FormField error. Pure navigation math (`selectLogic.ts`) is unit-tested. No external headless library: the interaction surface is small, and keeping it in-house preserves exact RTL/token behavior at zero dependency cost — the complete pattern is implemented, not a partial listbox. The external contract is unchanged (`value`, `onChange(e.target.value)`, `<option>` children, `id`, `name`), so **all ~83 call sites migrated with zero edits**; a hidden native `<select>` (aria-hidden, unfocusable) carries the form value for submission/progressive enhancement. States: disabled, loading, required, invalid; searchable variant included; multi-select deliberately out of scope (native fallback retained; no caller uses it).

## 7. UI Showcase verification route

`http://localhost:3000/_dev/ui-showcase` (Windows: `cd frontend; npm install; npm run dev`). Sections: new button dimensions + 40px form-alignment demo; toast triggers for all four kinds + dedupe demo; four inline Alerts; client DataTable and server-mode DataTable (locally simulated contract) over a fictional Projects dataset; Select demos (normal/searchable/disabled/loading/invalid/form-submit). Fictional data only, zero network calls. Verified locally: dev server serves the route (HTTP 200) and all new modules transform without errors. Production build contains **no** showcase chunk (grep-verified over `dist/assets`).

## 8. Bundle sizes (total JS in `dist/assets`)

- Before (DS-2 head `914b9c0`): **2,572,895 B**
- After DS-2.1: **2,579,759 B** → **+6,864 B (+0.27%)**, no new dependencies.

## 9. Test / CI results

- Local: `npm run typecheck` PASS; `npm test` **166/166 PASS** (154 prior + 12 DS-2.1); `npm run build` PASS; showcase absent from production bundle.
- CI at `77208af`: push `39123990239` SUCCESS, PR `39123986842` SUCCESS — frontend gates + complete backend CI (Pint/PHPUnit/MySQL) green; backend code untouched in this stage.
- Existing tests were not weakened: one DS-1 assertion now matches the Select re-export (component still exported from `Primitives`), and the pre-existing 34px form-action regression contract was preserved rather than edited.

## 10. Known UX limitations requiring product review

1. **Hit targets:** 36px standard / 32px compact meet WCAG 2.2 AA (24px) but not the 44px AAA/Apple guideline — confirm compact stays in dense toolbars only.
2. **Raw controls ratchet:** ~140 raw lowercase `<select>` elements and ~907 raw `<button>` elements in legacy pages keep global CSS styling but not the branded components; migrate opportunistically per page.
3. **Select scope:** text-only option labels (no icons/avatars); multi-select still native; very long lists rely on the searchable variant (no virtualization).
4. **DataTable scope:** single-column sort only; column reordering/resizing and saved views are UX-01-era features, intentionally absent.
5. **Legacy context fields:** `AppContext.toasts/dismissToast` remain as deprecated no-op shims for type compatibility; remove in a future cleanup once no consumer references them.
6. **No browser-level visual regression yet** — the DS-4 Playwright baseline plan from DS-2 still applies; keyboard/RTL behavior here is verified by logic tests + code contract, not screenshots.

## Readiness

- Code Complete: **YES** (pending acceptance) · Security Verified: **YES** for this frontend scope (no sensitive data in notifications; showcase dev-only and absent from prod) · Dev/CI Ready: **YES** · Production Operationally Ready: **NO** (unchanged; no deployment).

**PR #14 remains OPEN and UNMERGED. Production untouched. Stopping after DS-2.1.**
