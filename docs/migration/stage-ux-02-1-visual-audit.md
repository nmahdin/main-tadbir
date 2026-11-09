# UX-02-1 — Final Visual Acceptance Audit (item 8)

**Date:** 2026-10-19 · **Branch:** `arena/582a70e5-main-tadbir` · **PR:** #14 (open, unmerged)
**Scope:** bounded audit + targeted fixes only. No routing/permission/data-scoping changes, no new theme, no UX-02-2/02-3, UX-01, or OPS-01 work.

## Method

Real-browser inspection (headless Chromium via Playwright) against two local
dev servers: demo mode (fixture payload) and a mocked-API server (full
`/core/environments` payload incl. platform eligibility, long Persian names,
long user names). Viewports: 1440×900 desktop, 834×1112 tablet, 390×844 mobile.
Every measurement below (overflow, geometry, computed colors, key handling)
was read from the live DOM, and every surface was also screenshotted and
inspected visually. Reference: canonical Ocean (`--color-primary #39677C`,
hover `#2B5266`, background `#F5F9FA`) as rendered by the already-accepted
standalone pages (`/theme-previews`, `/select-environment`).

Accepted behaviors 1–7 (owner login/context nav, permitted environments,
dock switching, collapse/drawer, scoped-settings scope, platform hidden from
non-eligible member, illustrated 404) were re-exercised in the browser and
remain intact.

## Checklist results

| Surface | Result |
|---|---|
| `/select-environment` (groups, cards, search, recents, current banner) | PASS — ocean, RTL, truncation, Arabic ي/ك search, recents verified |
| Workspace shell (personal) | PASS after F1 |
| Organization shell (`/scoped-settings` سازمان tab preselected) | PASS after F1 |
| Platform shell (پلتفرم tab, platform nav) | PASS after F1 |
| Collapsed sidebar (72px rail) | PASS — labels/badges `display:none` at lg (measured) |
| ProfileDock + upward menu | PASS after F2 (was overflowing) |
| Mobile drawer (390px) | PASS after F3 (Escape); backdrop click unchanged |
| Context switch (`WorkspaceLoader`) | code-verified (unit tests); switch is locally instantaneous, not screenshot-captured |
| Illustrated 403 / 404 / 409 / 500 / offline / invalid-context | PASS — all render in canonical ocean with correct copy + retry |
| Horizontal overflow 1440 / 834 / 390 | PASS — none on any audited page |
| Keyboard focus visibility | PASS — global `button:focus-visible` 2px `color-mix(primary 70%, white)` (measured `rgb(116,149,163)`) |
| Contrast (computed WCAG) | primary on white 6.17:1, white on primary 6.17:1, primary-hover on bg 7.92:1 — AA |
| Dark mode | not a supported product theme — not invented, not audited |

## Confirmed defects and fixes

**F1 — Medium (theme).** Every shell rendered the legacy indigo instead of
canonical Ocean on any install without a saved custom theme color. Root
cause (pre-existing default, surfaced by UX-02-1's shells): the default
`themeColor: '#4f46e5'` in `AppContext.tsx` and the matching fallback in
`App.tsx` (MainLayout) overrode `--color-primary` at runtime; standalone
pages (select, error states) already rendered ocean. **Fix:** both defaults
→ `#39677c`. A saved user/org theme color still wins — customization is
preserved; only the out-of-box default changed. **Verified:** shell
`--color-primary` computes to `#39677c`, primary button `rgb(57,103,124)`
(v-01 screenshot).

**F2 — Medium (layout/overflow).** With a long user name + long environment
name, the ProfileDock trigger measured **388px wide inside the 256px
sidebar** (aside `scrollWidth 400 > clientWidth 255`) — the truncate chain
had no width constraint. **Fix (ProfileDock only):** dock and DS menu
wrapper/trigger constrained to the sidebar width, label `flex-1 min-w-0`.
**Verified:** `scrollWidth == clientWidth == 255`, trigger 231px, names
truncate with ellipsis inside the sidebar (v-02 screenshot).

**F3 — Low (accessibility).** The mobile sidebar drawer did not close on
Escape (measured: rect unchanged; backdrop click worked). **Fix (Sidebar):**
Escape closes the drawer while open. **Verified:** drawer rect moves
off-canvas (x 134 → 390 @390px RTL) + screenshot; no other close path
changed.

**F4 — Investigated, NOT a defect.** Environment-card focus outline measured
`rgb(116,149,163)`, not exact `#39677C`. Root cause: the inert inline
`--tw-outline-color` never applied (Tailwind v4); the cards actually inherit
the canonical product-wide focus from `styles/index.css:109`
(`2px solid color-mix(in srgb, var(--color-primary) 70%, white)` — which
computes to exactly `rgb(116,149,163)`), identical to every other button in
the product. Forcing `#39677C` on these cards only would fork the focus
treatment. **Disposition:** no visual change; only the dead inline style was
removed. Cards' focus remains token-derived and consistent.

## Observations (recorded, not fixed — outside UX-02-1 scope)

- `slate-400` micro-captions measure 2.56:1 on white — a pre-existing,
  app-wide caption pattern (legacy shells included), not introduced by
  UX-02-1.
- The ActionDashboard hero gradient is a pre-existing view style derived
  from the primary token (turns deep-ocean automatically after F1).
- Remaining `#4f46e5` literals in the codebase are unrelated per-entity
  color defaults (project references, content types/statuses) — untouched.
- The collapsed-rail unread badge is correctly hidden (`display:none`
  measured); an earlier screenshot reading suggesting otherwise did not
  reproduce.

## Changes

| Commit | What |
|---|---|
| `9901b685` | F1+F2+F3 source fixes (5 files, +14/−5) |
| `7b1b2449` | Regression gates in `frontend/tests/ux021.test.mjs` (source assertions for all four dispositions) |
| `fbe92d7d` | Rebuilt `frontend/dist` |

Local gates after fixes: `tsc --noEmit` clean, `npm test` **246/246**,
`npm run build` OK. CI on the final head: see PR #14 — all five product
gates (Backend Pint+PHPUnit, Frontend, MySQL, MariaDB, MariaDB 10.4-legacy)
must be green before merge; **GitGuardian reports neutral (PR-size scan
skip), so an independent secret scan is still required before merge** —
not bypassed here.

## What remains unverified (explicit)

- **Real-backend (Laragon) rendering** of the fixed shells — audit used
  demo-mode + mocked-API browsers in this sandbox; ARCH-02 Laragon
  acceptance is still pending and this audit does not close it.
- **Pixel-level comparison against `/theme-previews`** — surfaces were
  verified against the same tokens/computed values and visually inspected,
  but no screenshot-diff tooling was run; do not read this as pixel-perfect
  certification.
- **Context-switch loading indicator** — code paths and unit coverage only
  (locally instantaneous).
- **Screen-reader announcements** — ARIA labels/roles inspected in DOM;
  no assistive-technology pass was performed.
- Saved custom theme colors were verified by code path (fallback order),
  not by saving a color through the settings UI end-to-end.

## Short local visual acceptance checklist (for the owner)

1. Fresh login → dashboard: sidebar accents, «ایجاد جدید» button and active
   nav pill are deep ocean teal (#39677C family), **not indigo**.
2. `/scoped-settings` with an organization selected: سازمان tab pill is
   ocean; switching environments re-renders the shell in ocean throughout.
3. Open the profile dock with your real (long) name: name + environment
   caption truncate inside the sidebar — nothing sticks out past its edge.
4. Shrink the browser to phone width (or use a phone): open the drawer,
   press **Esc** (or tap the dimmed backdrop) — the drawer closes.
5. `/select-environment`: Tab through the cards — the focus outline is the
   same soft teal ring as every other button; enter an environment and
   return — it appears under «اخیراً استفاده‌شده».
6. If you previously saved a custom theme color in settings, confirm it
   still applies after this change (custom colors are preserved; only the
   never-customized default changed).
