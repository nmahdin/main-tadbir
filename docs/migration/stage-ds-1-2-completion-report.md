# DS-1 + DS-2 — Design System Foundation & UI Showcase — Implementation Report

Status: COMPLETE at code + CI level (pending human acceptance).
Branch: `arena/582a70e5-main-tadbir` (PR #14, open, unmerged).
Starting HEAD: `d7ecc24` (C7-3). Final implementation HEAD:
`cfabec4` (CI SUCCESS on push run `39121629191` + PR run
`39121632520`; this report commit follows). Date: 2026-10-18.

1. **Starting/final HEAD**: `d7ecc24` → `cfabec4` (report follows).
2. **UI inconsistencies found**: no Button size scale; checkbox
   only as global CSS; no Card/Badge primitives (hand-rolled
   wrappers/pills per page); no table foundation; no control
   invalid state; legacy pages use arbitrary Tailwind geometry
   (kept under the per-page ratchet, not mass-rewritten). Full
   audit: `docs/design/design-system.md` §1.
3. **Token/component contract**: `:root` CSS variables are the
   source of truth — primary `#4F46E5`, 40px control height,
   12px control radius, Vazirmatn, 4px spacing scale, 8px
   icon-label gap, comfortable density, semantic
   success/warning/danger/info, complete hover/focus/disabled/
   loading/error states. New APIs (backward-compatible):
   `Button{size}`, `Input/Textarea/Select{invalid}`,
   `Checkbox`, `Card`, `Badge`, `Table/TableRow/TableCell`.
   No new dependency or UI library was introduced.
4. **Files & ownership**: `frontend/src/index.css` (token-driven
   component geometry), `frontend/src/components/common/Primitives.tsx`
   (shared system), `frontend/src/features/showcase/UiShowcasePage.tsx`
   (dev showcase feature), `frontend/src/app/App.tsx` (one gated
   route), `frontend/tests/designSystem.test.mjs`,
   `docs/design/design-system.md`. Backend untouched.
5. **Showcase route**: `/_dev/ui-showcase`, registered only when
   `import.meta.env.DEV` is true and lazy-loaded; the production
   bundle provably contains no showcase code (post-build search).
6. **Windows**: `cd frontend; npm install; npm run dev;` then
   open `http://localhost:3000/_dev/ui-showcase`.
7. **Visual evidence**: reproducible manual screenshot baseline
   (1440px/390px, modal + validation states) documented in the
   design doc §5 with the DS-4 Playwright-screenshot plan;
   no unstable browser toolchain was installed.
8. **Accessibility/RTL**: `lang="fa" dir="rtl"` app-wide;
   focus-visible rings on all controls; Modal focus trap +
   Escape + focus restore; `aria-invalid`/role="alert" error
   wiring; showcase includes a live keyboard/RTL review section.
9. **Bundle**: total JS 2,572,652 → 2,572,895 bytes (+0.01%);
   showcase = 0 bytes in production. No new dependencies.
10. **Tests/CI**: local — typecheck PASS, 154/154 node tests
    PASS (incl. 4 new DS gates), production build PASS; GitHub
    CI SUCCESS (push `39121629191`, PR `39121632520`) incl. the
    full backend suite (Pint/PHPUnit/MySQL) preserved.
11. **Before C7-4**: compose settings UI only from DS-1
    primitives; secret fields stay metadata-only per C7-3;
    adopt Card/Badge opportunistically per page (ratchet);
    pin Playwright browsers + DS-4 baselines before big pages.
12. **Confirmation**: PR #14 remains OPEN and UNMERGED;
    production unchanged; no force pushes.
