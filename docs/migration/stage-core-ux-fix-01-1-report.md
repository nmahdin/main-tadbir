# CORE-UX-FIX-01.1 — Missing queryFn noise & blank Scoped Settings

Branch `arena/582a70e5-main-tadbir` (PR #14, unmerged), on top of
CORE-UX-FIX-01 (`b64d781`). Two distinct defects; only one of them
caused the blank page.

## 1. Why Scoped Settings was blank (the actual cause)

The sidebar click ran `handleNavClick('scoped-settings')` →
`setActiveView('scoped-settings')` → `navigate(viewPaths[view] ||
'/dashboard')`. **`viewPaths` had no `scoped-settings` entry** (it
was the only non-detail `ActiveView` without one), so the router
silently fell back to `/dashboard`, `resolveRoute` never produced
the view, and `ScopedSettingsPage` **never mounted** — which is
exactly why the Network panel showed no new requests, why the
full-screen "loading page…" transition overlay (keyed to the
pending view name, which never matched the rendered view) lingered
until its 8 s fallback, and why no page content for the feature
ever appeared. Lazy loading, error boundaries, and the C7 page
component itself were not at fault; the component was unreachable.

Fix: `'scoped-settings': '/scoped-settings'` in `viewPaths`.
Now the route resolves (`resolveRoute('/scoped-settings') →
{ view: 'scoped-settings', known: true }`), the transition overlay
clears against the rendered view, and the page mounts and calls
its scope APIs. A regression test asserts **every** non-detail
`ActiveView` has a resolving path, so a future view cannot fall
back silently again.

## 2. The missing-queryFn errors (separate, systemic, now fixed)

Reproduced locally with real React 19 + React Query 5.104: in
development, `useBaseQuery` prints `No queryFn was passed as an
option…` for **every** `useQuery` call that lacks a `queryFn`,
regardless of `enabled: false` — it is render-time validation
noise, not a failed fetch (cache-error subscription in the
reproduction recorded zero query errors, and data kept flowing).
The two cache-only queries were the offenders:

- `useServerState` — the legacy state adapter. Its contract is
  cache-only: data enters via `fetchWorkspace` (which passes its
  own `queryFn` to `fetchQuery`) or `setQueryData`, never via this
  hook. ~30 consumers in `AppContext` therefore logged the error
  on every render (`["workspace","1","users"]`, `projects`,
  `tasks`, `generalSettings`, …).
- `RouteEntity`'s collection peek (`route-none` when no entity
  module matches) — same pattern.

Fix: both now pass **`queryFn: skipToken`**, React Query's
explicit "never fetch" marker. Nothing is fabricated — an
untouched cache still reads `pending`/`undefined` and the hooks
still return their documented initial values; invalidations can
no longer push these queries into a fetch path demanding a
function, and the console errors are gone (verified in the
reproduction: zero errors, cache writes still visible). Every
genuinely network-backed query already had — and keeps — its real
`queryFn` (`useResource`, `useWorkspacePage`, the `RouteEntity`
entity query, view-local queries); no default queryFn was
registered and no error was suppressed.

Isolation: cache keys remain `['workspace', userId, name]`
(server-verified per-user scope; `AuthContext` clears the whole
QueryClient on session change, and `fetchWorkspace` aborts on
session mismatch), so state cannot leak across users; Core scoped
settings always address explicit organization/workspace ids from
the caller's own memberships and the server re-verifies —
cross-organization reads/writes stay 403 (covered by the existing
backend suite: `DemoSeedingTest`, C7 scoped-settings tests).

## 3. Visible states on the page

The organization/workspace scope cards previously rendered the
"not found" empty state while the scope lists were still loading.
They now render, in order: `Skeleton` while loading → explicit
no-permission `EmptyState` when the scope list answers 403 →
genuine empty state → the selector. List failures keep their
error alert with retry; nothing renders blank in any state.

## 4. Verification

- Frontend: **228/228 tests** (6 new `uxfix011` gates: routability
  end-to-end, all-views-have-paths, skipToken contract + real
  queryFns preserved, skipToken behavior — never fetches / never
  errors / holds cache data, per-user key isolation + session
  clear, visible page states), typecheck and production build
  green.
- Backend: no backend code changed; the affected authorization
  surface (demo organization settings access, cross-organization
  denial) is exercised by the existing backend gates in CI.

## 5. Windows-local verification

```powershell
cd frontend
git pull
npm run dev
```

Log in as `demo-owner`, click «تنظیمات دامنه‌ای»: the URL becomes
`/scoped-settings`, DEMO Organization settings load, and the
browser console no longer prints `No queryFn was passed…` for
workspace/projects/tasks/generalSettings/route-none. Opening
`/scoped-settings` directly in a new tab works too.
