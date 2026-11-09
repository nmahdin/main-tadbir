# Stage C7-4 — Scoped Settings APIs & React UI — Completion Report

Status: **Implemented on PR #14 (`arena/582a70e5-main-tadbir`, unmerged; pending human acceptance).**
Baseline: `0aaa190` (DS-2.3 closeout). C7-4 commits: `df7b5dc` (API), `e360bc8` (API tests + demo seed), `bb590e7` (UI). Final head after CI-green closeout is recorded in the stage message. `main` and production untouched; PR #14 remains OPEN/unmerged.

## 1. What shipped

The first complete, usable settings experience over the existing C7-1/C7-2/C7-3
contracts — no service was duplicated and no settings behavior was re-implemented
in controllers or React:

- **Organization settings** — approved public metadata (`organization.public.*`)
  and inheritable display defaults via the canonical C7 write path.
- **Workspace settings** — effective values with winning-source metadata,
  inherited-vs-explicit distinction, "Inherited from Organization" labels,
  reset-to-inherited (remove explicit row), policy-gated editors.
- **Personal display preferences** — the actor's own `user.experience.*` only.
- **Secrets (Organization + Workspace)** — metadata-only, write-only
  configuration under the separately provisioned `*.settings.secrets.manage`
  permissions. There is **no reveal/download/export** anywhere.
- **History & restore** — paginated non-secret revisions per key; restore is a
  new versioned mutation revalidated against current rules (C7-3 service).
- **Platform settings** — deliberately not fabricated: no platform-scope
  definitions or platform-settings permission exist in the registry today, so
  the Platform tab is an honest empty state explaining where platform
  administration lives. Workspace access is never presented as platform access.

## 2. Registry change (justified, minimal)

`CoreSettingDefinitions` gained exactly two Core definitions:

- `display.locale` (locale, default `fa`, values `fa|en`), scopes
  organization+workspace, `organization_to_workspace` inheritance,
  `workspaceOverride: true` (default-deny policy).
- `display.timezone` (timezone, default `Asia/Tehran`), same shape.

These are the inheritable scope-level display defaults the screens edit; a
user's own preference remains `user.experience.*` and still outranks them.
**No secret definition was invented**: secrets exist only when a real consumer
module registers its key (the C7-1 rule). The secrets API/UI is fully
registry-driven — with zero registered secret keys it renders an honest empty
state and lights up with zero code changes when the first consumer lands. The
C7-1 catalog-pin test was extended (6 keys) with the reason recorded inline.

## 3. HTTP surface (domain-owned routes, ARCH-01)

`app/Core/Settings/Routes/api.php`, registered via
`DomainPaths::routeFiles()['authenticated']`. Controllers (thin adapters;
every read/mutation authorized inside the C7-2/C7-3 services):

- `ScopedSettingsController` — lists (effective + source + explicit
  presence/version + policy state), `PUT`/`DELETE` values, `PUT …/policy`.
- `ScopedSettingsHistoryController` — `GET …/history` (paginated, `meta`),
  `POST …/history/{revision}/restore`.
- `ScopedSettingsSecretsController` — `GET` metadata list, `PUT` (write-only),
  `DELETE` revoke. Responses contain `configured` / `version` / `updated_at`
  only — never plaintext or ciphertext.

Endpoints (all `auth:sanctum` + `active-account`; `{organization}` /
`{workspace}` are persisted route-bound models — no generic owner-type /
owner-id inputs exist):

```
GET    /core/organizations/{organization}/settings
PUT    /core/organizations/{organization}/settings/{key}
DELETE /core/organizations/{organization}/settings/{key}
PUT    /core/organizations/{organization}/settings/{key}/policy
GET    /core/organizations/{organization}/settings/{key}/history
POST   /core/organizations/{organization}/settings/{key}/history/{revision}/restore
GET    /core/organizations/{organization}/secrets
PUT    /core/organizations/{organization}/secrets/{key}
DELETE /core/organizations/{organization}/secrets/{key}
(same set under /core/workspaces/{workspace})
GET    /core/preferences
PUT    /core/preferences/{key}
DELETE /core/preferences/{key}
GET    /core/preferences/{key}/history
POST   /core/preferences/{key}/history/{revision}/restore
```

Error contract: flat `{message, code}` with stable domain codes —
`setting_forbidden`→403, `setting_not_found`/`setting_revision_not_found`/
`setting_history_unavailable`→404, `setting_version_conflict`/
`setting_override_denied`/`setting_organization_unavailable`/
module gates→409, validation→422. `value` must be present (explicit `null`
is a real write); `expected_version` optional (absent row = 0).

## 4. Permission map (enforced in-service from persisted memberships)

| Surface | Read | Write | Secret read/write |
|---|---|---|---|
| Organization settings | `organization.settings.view` | `organization.settings.manage` | `organization.settings.secrets.manage` |
| Workspace settings | `workspace.settings.view` | `workspace.settings.manage` | `workspace.settings.secrets.manage` |
| Preferences | actor's own | actor's own | — |

Organization authority never implies workspace authority; secrets permissions
remain separately provisioned (excluded from automatic Manager grants);
Platform/Legacy admin status confers nothing.

## 5. UX (SPEC-DS-01, DS primitives only)

New sidebar entry **«تنظیمات دامنه‌ای»** → lazy `scoped-settings` ActiveView
(frontend/src/features/settings/). Tabs: سازمان / فضای کاری / شخصی / پلتفرم.
Built only from DS primitives (Tabs with colored active state, branded Select
pickers, Card, FormField, RadioGroup for booleans, Checkbox policy toggle,
Badge source chips, Alert inline errors, Skeleton loading, EmptyState
variants, Drawer history, ConfirmDialog for revoke/restore, Toast-compatible
value-free notices). RTL/Persian-first; one primary action (ذخیره) per setting
row; history loads only when its drawer opens; secrets are a separate section
per tab with password-style write-only fields, never prefilled, local state
cleared on submit/close/unmount, and no browser storage anywhere in the
feature (test-guarded). The legacy workspace "تنظیمات سامانه" screen is
untouched.

## 6. C6 regression evidence

`test_canonical_write_is_what_invitation_preview_shows` (feature test): seeds
legacy `organizations.settings.public.description`, verifies preview shows it,
writes canonically through the new API, verifies the C6 invitation preview DTO
shows the canonical value (and contains no settings internals), then writes an
explicit canonical `null` and verifies the preview hides the description
entirely. Explicit-null vs absent is additionally pinned at the settings API
in `test_explicit_null_is_distinct_from_absent_and_hides_legacy_public_metadata`.

## 7. Demo & Windows-local walkthrough

`php artisan tadbir:seed-demo` (local/testing only, unchanged guard) now also
seeds fictional display defaults (`display.locale=fa`,
`display.timezone=Asia/Tehran`) and one override-policy example (timezone
override allowed; locale stays default-deny). No secret is ever seeded.

Windows-local review (repo root; PHP 8.3 + Composer + Node 20+):

```powershell
cd backend
copy .env.example .env        # point DB_* at your local MySQL (or sqlite)
php artisan key:generate
php artisan migrate:fresh
php artisan tadbir:seed-essential
set DEMO_USER_PASSWORD=<choose-a-local-password>
php artisan tadbir:seed-demo
php artisan serve --host=127.0.0.1 --port=8000

# second terminal
cd ..\frontend
npm ci
npm run dev                   # http://localhost:3000
```

Sign in as `demo-owner` with the password you set, open **تنظیمات دامنه‌ای**
from the sidebar: Organization tab shows the public profile + display defaults
with the timezone policy toggle on; pick the default workspace in the Workspace
tab and override the timezone (allowed); try overriding the locale (refused by
policy until you enable its toggle in the Organization tab); change a value
twice and open «تاریخچه» to restore the older value; Personal tab holds the
demo owner's `en` interface preference. Secrets sections state honestly that
no secret keys are registered yet.

## 8. Verification evidence

- Backend: full PHPUnit suite + Pint + MySQL migration gate green in CI
  (runs recorded in the stage message; final green head verified by `headSha`).
  New: `ScopedSettingsApiTest` (10 tests) + `ScopedSettingsSecretsApiTest`
  (4 tests) covering registry-driven lists/sources, version conflicts,
  immediate inheritance, policy deny/retain/re-allow, reset-to-inherited,
  explicit-null vs absent, preferences self-only, cross-scope 403/404,
  suspended-organization 409 with value preservation, paginated history +
  restore + stale-restore conflict, secret permission independence,
  metadata-only responses (plaintext & ciphertext absent from bodies),
  secret history refusal, and the C6 preview regression. Existing
  C7-2/C7-3 service/concurrency suites and the C6 suites pass unchanged;
  the only pre-existing test edited is the intentional registry catalog pin.
  MySQL concurrency behavior is inherited unchanged from C7-2/C7-3 services
  (no new locking code was written; CI's MySQL gates stay green).
- Frontend: 210/210 node tests (10 new C7-4 contract/logic gates),
  `tsc --noEmit` clean, production build green. Bundle: JS 2,582,014 →
  2,613,447 B (+31,433 B for the lazy settings feature incl. its chunk; the
  page is code-split so first load is unaffected for other screens), CSS
  unchanged at 171,913 B. No new dependencies.
- Sandbox limits (honest): no PHP runtime locally — backend tests run in CI;
  API latency not measured (no running MySQL/PHP here); judged against
  SPEC-PERF-01 by design (lazy lists per tab, history on open, zero secret
  fetches, no polling).

## 9. Known limitations / next steps

- No secret definitions are registered by any real consumer yet; the first
  module that needs a credential registers its key and the existing screens
  serve it unchanged.
- Editors are registry-type-driven (select/text/number/boolean/JSON); rich
  per-definition widgets arrive with the modules that own those definitions.
- Manage-vs-view is discovered from server responses (403 → locked,
  value-free message); a capabilities field can refine this later without
  contract breakage.
- Restore of values that current rules reject surfaces the service's stable
  validation error (by design, C7-3); nothing is silently coerced.

## 10. Readiness

- Code Complete: **YES** (within the C7-4 scope above)
- Security Verified: **YES** for the tested boundaries (in-service
  authorization, metadata-only secrets, no-reveal surface, value-free errors)
- Dev-CI Ready: **YES**
- Production Operationally Ready: **NO** (hosting/MySQL/backups/monitoring
  unverified; bootstrap/recovery remain NOT PRODUCTION-READY)

PR #14 remains OPEN and unmerged, pending human acceptance. Stopped after
C7-4 as instructed.
