# DS-2.2 Amendment Report — Final Button Design Contract

**Status: IMPLEMENTED — CI SUCCESS, pending product-owner acceptance. PR #14 OPEN/unmerged; `main` and production untouched. No business logic or security boundaries altered (frontend presentation only).**

## Heads

- Start HEAD: `f0da79f` (DS-2.2 complete).
- Implementation head: `f0e7cd5` — CI push run `39127438254` **SUCCESS**, PR run `39127435516` **SUCCESS** (frontend gates + full backend CI; backend code untouched).

## What changed

**Canonical API (one Button, backward compatible)** — `ButtonProps` gains
`shape?: 'pill' | 'rounded'` (default `'rounded'`), rendered as
`ui-button-{shape}` + `data-button-shape`. Every existing usage keeps
working unchanged; `IconButton` composes the same component and now
inherits the shape instead of pinning its own radius. No competing
button component exists (test asserts exactly one `Button` definition).

**Tokens (`frontend/src/index.css`)**

| Token | Value |
|---|---|
| `--button-radius-rounded` | `.75rem` (12px) |
| `--button-radius-pill` | `9999px` |
| `--button-radius` | alias → rounded (global rules keep resolving) |
| `--button-shadow` | `0 1px 3px rgb(15 23 42 / .035)` (final, significantly lighter) |
| `--button-shadow-active` | `inset 0 1px 2px rgb(15 23 42 / .14)` (unchanged) |
| `--button-height` | `2.25rem` = 36px (unchanged; sm 32px, lg 44px) |

This supersedes the DS-2.2 §13 values (18px radius, two-part shadow);
the decision is recorded in `docs/design/design-system.md`.

**Press animation** — `.ui-button` transitions `transform .12s ease`;
`:active:not(:disabled)` applies `transform: scale(.97) !important`
(scoped to beat the legacy global flat-button transform reset). The
same feedback applies to `Tabs` triggers as the other shared
interactive control. Smooth return on release via the transition; no
bounce; hover remains color/border/background only.

**Reduced motion** — under `prefers-reduced-motion: reduce` the press
transform is removed, while visible feedback remains (color change +
inset pressed shadow).

**Disabled/loading** — `disabled={disabled || loading}` was already the
contract; `:not(:disabled)` therefore excludes both from press
animation and from activation, with `aria-busy` on loading.

**Focus/keyboard** — the component remains a real
`<button type="button">`: Space/Enter activation, tab order and the
2px primary `:focus-visible` outline are native/unchanged.

**Showcase** (`/_dev/ui-showcase`, still dev-only, excluded from prod):
Buttons card now shows rounded and pill rows across
primary/secondary/ghost/danger with colored icons, a disabled pill
(no press animation), and written press/reduced-motion guidance.

## Tests

- New `frontend/tests/ds22ButtonAmendment.test.mjs` (7 tests): shape
  tokens + default, exact shadow token, press rule (0.97 / 120ms /
  `:not(:disabled)`), reduced-motion override keeping inset feedback,
  native focus/keyboard contract, single canonical Button, showcase
  coverage. The DS-2.1/DS-2.2 radius and shadow assertions were updated
  to the amended approved values (amendment supersedes them; nothing
  else weakened).
- Local: typecheck PASS; **179/179 tests PASS** (172 prior + 7 new);
  production build PASS; dev-server smoke test HTTP 200.
- Honest scope note (DS convention): mouse/keyboard/press behavior is
  pinned at the component/CSS contract level and manually exercisable
  in the showcase; no browser automation was installed, per the DS-2
  decision to defer that to DS-4 Playwright baselines.
- CI at `f0e7cd5`: push `39127438254` SUCCESS, PR `39127435516` SUCCESS.

## Bundle

JS 2,579,759 → 2,579,814 B (**+55 B**); CSS 164,569 → 165,263 B
(**+694 B**). No new dependencies; tracked `dist` rebuilt and committed
per repo convention; showcase still absent from the production bundle
(grep-verified). SPEC-PERF-01 respected.

## Readiness

Code Complete **YES** (pending acceptance) · Security Verified **YES**
for this frontend scope · Dev/CI Ready **YES** · Production
Operationally Ready **NO** (unchanged; no deployment).

**PR #14 remains OPEN and UNMERGED. Production untouched. Stopping after the DS-2.2 amendment.**
