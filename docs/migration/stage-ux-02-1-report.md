# UX-02-1 — Environment Shells, Selector & Illustrated States (Completion Report)

**Date:** 2026-10-19
**Branch:** `arena/582a70e5-main-tadbir` — **PR #14 remains OPEN and UNMERGED; no production changes.**
**Delivery code HEAD:** `cef643ff0d9732cc08bcf92dc602043c11a4e0d4`
**Decisions implemented:** K1 (additive `GET /core/environments`) and K2 (environment = navigation/authorization
context only — no workspace-level filtering of legacy operational data, no access broadening), as approved
from `docs/migration/ux-02-1-readiness-audit.md`.

## Commits (on top of readiness `2310a1ae`)

| Commit | Content |
|---|---|
| `4d963a97` | S1: `GET /core/environments` endpoint + 11 backend contract tests |
| `828aad4d` | S2–S6 frontend: environment context, `/select-environment`, shell variants, profile dock, illustrated states, scoped-settings preselection |
| `dbf6e94b` | `ux021` frontend regression suite (12 tests) + node-resolvable import fix |
| `2ff6bdb9` | S1 fix: actually register the route (see "Incidents") |
| `cef643ff` | rebuilt `frontend/dist` (source changed) |

(TEMP Pint diagnostic commits `bfaa4789`/`913687ef` were fully removed by `69bfdb3c`; `.github/workflows/quality.yml`
is byte-identical to the pre-UX-02-1 state — verified 0-line diff.)

## What was implemented

### S1 — Backend discovery endpoint (K1)
- `GET /core/environments` (route name `api.v1.core.environments.index`, in the Core registrar group behind
  `auth:sanctum` + `active-account`). Thin controller `App\Http\Controllers\Api\V1\Core\EnvironmentController`
  (E3: HTTP adapters stay in `app/Http`).
- Payload mirrors existing visibility exactly: platform via `PlatformAuthorizer`
  (`eligible`, `is_primary`, permission keys); organizations = active orgs with ACTIVE membership (same rule as
  `OrganizationController@index`); workspaces = `WorkspaceAccess`-filtered list (same as `WorkspaceController@index`).
  Per-scope role (`ScopedRole` key/name) and effective permissions come from the single existing resolver
  `MembershipPermissions`. Suspended/ended organizations and their workspaces never appear (C3);
  organization membership alone never exposes org workspaces (C1/ADR-0003). The endpoint grants nothing.
- Contract tests `EnvironmentDiscoveryTest` (11): 401; empty payload; org member role/permissions
  (member lacks `organization.manage`); suspended org + deactivated membership hidden; non-member exclusion;
  personal-workspace owner relation; org workspace requires BOTH memberships; suspended-org workspace hidden;
  platform eligibility, Primary flag, revoked assignment ineligible.

### S2 — Environment context
- `app/providers/EnvironmentContext.tsx`: React Query payload (`['environments', userId]`), selection +
  recents persisted per user in localStorage as **identifiers only** (names/roles always from the fresh payload).
- Secure switching: validates the target against the fresh payload (invalid → `invalid-context` problem state,
  no navigation), then `queryClient.removeQueries()` for every root except `session`/`environments`.
  `removeQueries` never fetches, so cache-only `skipToken` queries (CORE‑UX‑FIX‑01.1) cannot be turned into
  fetches; no `invalidateQueries` is used. No context header/token was invented — the server authorizes
  every request independently, exactly as before.
- A stored selection that a fresh payload no longer authorizes (org suspended, membership ended, platform
  revoked) surfaces as `currentInvalid` → the shell renders the invalid-context state with recovery actions.

### S3 — `/select-environment`
- Standalone protected full page (mirrors `/invitations/manage`): DS `SearchInput` (Arabic ي/ك-tolerant),
  grouped cards — Platform (when eligible), My Organizations, Personal Workspaces, per-organization
  workspace groups — with role/standing captions, default/owner badges, current-environment marker, and a
  "recently used" section (stale ids silently dropped against the fresh payload). Loading (skeletons),
  offline, error, invalid-context and honest empty states included.

### S4 — Three shells
- `Sidebar.tsx` renders context-specific variants: **Workspace** (existing full operational navigation,
  unchanged behavior and test-pinned guards), **Organization Management** (dashboard, organization scoped
  settings, invitation management), **Platform** (platform scoped settings, dashboard) — with honest
  explanatory copy that server-side checks remain authoritative.
- Environment chip (current environment + standing) opens the selector; desktop **collapse-to-icons**
  (persisted `tadbir:sidebar-collapsed`, labels/tooltips via title/aria-label, settings section included);
  mobile keeps the existing RTL drawer pattern; **ProfileDock** is fixed at the sidebar bottom (avatar,
  name, current environment) whose DS `DropdownMenu` opens upward (auto-flip): Profile, Switch environment,
  Sign out (via `AuthContext.logoutSession`, which keeps the session if the server call fails).

### S5 — Illustrated Ocean states
- `shared/ui/IllustratedState.tsx`: one wave motif in canonical theme variables only (`var(--color-primary)` /
  `--color-primary-hover)`; no literal hex, E6 intact), variants 403/404/409/500/offline/invalid-context
  with retry / select-environment / dashboard actions. Wired into: `RouteEntity` (unknown route → 404
  illustrated, route-permission denial → 403 illustrated, replacing plain text), settings-view denial
  (illustrated 403 with the same pinned copy), MainLayout offline banner (`useOnlineStatus` +
  online/offline events), selector-page error mapping (`errorStateKind` status/code/connectivity model).

### S6 — Integration
- `ScopedSettingsPage` preselects tab + organization/workspace from the active environment (once per
  environment, only when the id is in the caller's own server-returned lists; manual changes afterwards
  are never overridden). Platform environment lands on the platform tab. Demo mode uses a fixture payload
  (single demo workspace) without network calls.

## Verification

- **Local:** frontend `npm test` **245/245** (233 pre-existing + 12 new `ux021`), `tsc --noEmit` clean,
  `vite build` succeeds. PHP syntax-checked with a parser (no PHP runtime in the sandbox; PHPUnit/Pint are CI).
- **CI at `cef643ff` — all five product gates SUCCESS:** Backend contracts and tests (Pint clean, full
  PHPUnit incl. the 11 new tests), Frontend (245 tests + typecheck), MySQL, MariaDB 10.11, MariaDB 10.4-legacy.
  GitGuardian: **neutral** — the same PR-size-limit scan skip as before (0 annotations, not a finding).
- Compatibility: no migrations added/changed; no existing route modified (one additive route); `/scoped-settings`,
  `skipToken` behavior, RBAC, lifecycle, subscriptions and module boundaries untouched; ARCH‑02 guards green
  (no new feature→feature composition; token definitions still confined to the two E6 homes).

## Incidents (diagnosed, not bypassed)

- First S1 CI run failed at **Pint** (`no_unused_imports` in `Routes/api.php`): the route-registration line
  had not persisted locally, leaving an unused import. Diagnosed via a temporary annotation step (added,
  then removed; workflow byte-parity restored), fixed in `2ff6bdb9`. The missing route would also have
  failed the new PHPUnit tests — Pint caught it first because PHPUnit runs after Pint in the job.

## Limitations / not done (by design)

- No UX-02-2 dashboards: Platform/Organization environments navigate to existing surfaces (scoped settings,
  invitations, dashboard). Organization/platform landing = scoped settings until UX-02-2.
- Workspace selection does not filter legacy data (K2); it frames navigation and Core-scoped surfaces.
- Collapsed-rail tooltips use native `title` + `aria-label` (the DS `Tooltip` wraps inline-flex and would
  break full-width nav rows); compact surfaces use DS overlays as before.
- **ARCH-02 local Windows/Laragon acceptance is still pending** (checklist in the readiness audit §A6);
  nothing here claims it. Production Operationally Ready: NO (unchanged blockers).

## Local smoke checklist (Windows/Laragon, non-destructive — existing `tadbir` DB)

1. Back up `tadbir` (MariaDB 10.4.32); `git pull --ff-only`; `composer install` (PHP ^8.3);
   `php artisan migrate:status` → **zero pending** (UX-02-1 adds no migration). Do NOT run
   `migrate:fresh`/`db:wipe`.
2. `cd frontend && npm ci && npm run build`; serve as usual.
3. Login as demo-owner → sidebar shows environment chip; open **انتخاب محیط** (profile dock or chip):
   demo organization + workspace listed; switch to the organization → lands on Scoped Settings with the
   organization preselected; switch back to the workspace → dashboard.
4. Collapse the sidebar (desktop) → icon rail; refresh → state persisted. Profile dock menu opens upward;
   «پروفایل من» and «خروج از حساب» work.
5. Login as demo-member → Platform environment absent; organization administration stays denied with the
   illustrated 403 (never a blank page).
6. Visit a bogus URL (e.g. `/no-such-page`) → illustrated 404. Toggle network offline → offline banner;
   on `/select-environment` → offline state with retry.
7. Report results back; UX-02-2 must not start before human acceptance of UX-02-1.
