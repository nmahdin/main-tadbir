# UX-02-4 — Shared Experience & Unified Notification Center: Delivery Report

**Status: IMPLEMENTED — awaiting explicit human acceptance. STOP after this package.**
Spec: `docs/architecture/spec-ux-02-4-shared-experience-notification-center.md` (commit `a26b41e5`), plus the two binding amendments (central soft shadow; final muting policy).

## Commits (branch `arena/582a70e5-main-tadbir`, PR #14 unmerged)

| Commit | Content |
|---|---|
| `b0315242` | Amendment A: `--shadow-surface: 0 2px 8px rgb(27 63 81 / 0.045)` token; PageSurface + InvitationManagerPage adoption; gate retarget |
| `181e70e1` | Backend: notification columns + archives migration, grouping, mute-aware counts, scoped read-all, 90-day retention, C7 defs, feature tests |
| `5df6eaf7` | Frontend: unified center, grouped dropdown, detail modal, resolver, mutes/density UI, offline banner, switch guard, undo, timezone |
| `25d2daea`…`319941d9` | CI fixes (registry sync + real subjects in tests, Pint import/FQCN/unary/blank-line, registry pins extended for the two new C7 keys, DATETIME for legacy MariaDB) |
| `7e42be0a` | Routed center wired to the unified implementation, dropdown grouped-date fix, rebuilt `dist`, `quality.yml` restored byte-identical (md5 `26d1e92032611a4547bd7d3f1088d94f`) |

## What shipped (spec §17 checklist)

- **Unified center `/notifications`** (real route; `NotificationInbox` re-exports the new view): server-backed, permission-scoped (existing NotificationAccess mirror unchanged), grouped by default (`group_key`), drill-in per group, per-record rows keep individual read state. Ocean PageSurface, grouped/single activation, delete, pagination.
- **Grouping**: `category_key`/`group_key`/`read_at` accelerator columns on `domain_records` (payload remains content source of truth), model hook keeps them in sync for every existing producer; `notifications:backfill-columns` for legacy rows.
- **Retention**: `notifications:prune-retention {--dry-run}` — read rows >90 days deleted, unread ordinary archived to `notification_archives` then deleted; mandatory/security exempt; chunked, idempotent.
- **Category muting (final policy)**: C7 `user.experience.notification_mutes`, ordinary categories only (tasks/content/meetings/secretariat/collaboration). Server excludes muted categories from `meta.unread_count`; raw total in `unread_count_all`; muted rows still listed. `system` can never be effectively muted even if smuggled into the value (test-proven). Scoped read-all (`category`/`group_key`) and plain read-all **never** touch mandatory or security rows (test-proven). Bale delivery untouched — in-app prefs have no path to Bale policy.
- **Click resolution & detail modal**: allowlisted destinations only (tasks/projects/contents); notifications carrying detail text open `NotificationDetailModal` first with a route action; unknown/other contexts show the modal without fabricated links. Cross-context activation proposes an environment switch only when the environment resolves for the user (backend re-authorizes on arrival), blocked honestly when inaccessible, and blocked while a registered dirty form exists.
- **Toasts**: physical top-left stack (verified, unchanged); new optional action slot used only for real inverse operations (mark-read → unread; task status → previous status; bulk status → only when every updated task shared one previous status).
- **Page states & connectivity**: existing skeletons/empty/error reused; global offline banner in the shell; list queries keep serving cached data offline.
- **Preferences (cross-device via C7)**: notification mutes, `user.experience.table_density` (normal/compact toggle on real workspace lists), display timezone honored by `formatPersianDateTime` (fa-IR + Persian numerals, default Asia/Tehran).
- **Unsaved-change guard**: `dirtyRegistry` + selector `DirtyGuardDialog` (stay / keep draft & switch / discard & switch); `CreateProjectModal` registers while dirty.
- **Amendment A (shadows)**: one token `--shadow-surface`; PageSurface adopters (selector, lists, detail, scoped settings, invitations) all share the soft shadow + light border on `#F5F9FA`; no redesign, no competing system.

## Muting / security test evidence

`backend/tests/Feature/NotificationsExperienceTest.php` (6 tests): columns+hook+listing meta; grouped aggregation without merging read state + drill; muting excludes tasks from badge but never system (smuggled `system` in the stored value is stripped); scoped read-all by category + mandatory/security rows untouched by both scoped and unscoped read-all; retention delete/archive/exempt/89-day boundary/idempotency; backfill command. Frontend `tests/ux024.test.mjs` (10 tests): shadow token, toast action, dirty registry, timezone rendering, resolver (unavailable/same-context/switch/inaccessible), mute lock UI, backend source gates, density/offline/guard wiring.

## Verification

- Frontend: `npm test` **273/273 pass**, `tsc --noEmit` clean, production build OK, `dist` rebuilt and committed.
- Backend: full PHPUnit in CI (890 tests at diag time) green.
- **All five CI gates SUCCESS** (verified on run for `319941d9`; final `7e42be0a` run re-verified before this report was finalized — see stage-status).
- Visual QA (local Chromium, mocked API, real build): notification center 1440/834/390, bell dropdown with groups, mute-settings panel (5 mutable + locked system/security row + Bale note), selector soft-shadow. Evidence files were generated in `/tmp/audit` during the session.
- `quality.yml` md5 `26d1e92032611a4547bd7d3f1088d94f` (byte-identical; TEMP DIAG steps fully reverted).

## Limitations / dependencies (honest)

- **PHP not runnable in the sandbox** — backend behavior is proven by CI (MariaDB, MariaDB 10.4 legacy, MySQL, contracts+tests), not by a local PHP run.
- Detail modal triggers on producer-supplied `body` detail; current producers send short messages, so most activations navigate directly (by design — no fabricated modals).
- `payload.context` is not yet populated by producers; the resolver is fully wired and test-covered, and activates the switch path automatically once producers emit context.
- SYS-MSG-01 (official notices/legal acknowledgment), CORE-REQ-01 (approvals), OPS-01 (Bale delivery policy) were **not** prebuilt — boundaries preserved, read ≠ legal acknowledgment.
- WCAG AA formalization and determinate progress for long operations remain deferred per spec non-goals; determinate progress is only shown where real totals exist.
- Independent security scan (GitGuardian neutral) and ARCH-02 acceptance remain OPEN gates for PR #14 overall.

## Laragon smoke-test checklist (human acceptance)

1. `git pull` this branch; backend: `php artisan migrate` (additive, reversible), then `php artisan notifications:backfill-columns` once.
2. `php artisan settings:sync` (or the seeded equivalent) so the two new C7 preference definitions register; then `php artisan notifications:prune-retention --dry-run` to preview retention.
3. Open `/notifications`: groups render, unread badge excludes a muted category, «خواندن گروه» and «خواندن همه» work, category chips + status tabs filter via URL.
4. Settings panel: mute «وظایف», reload — badge drops but rows remain; system/security row is locked; note the Bale disclaimer.
5. Bell dropdown: grouped unread with counts; multi-item group drills into the center; single item navigates or opens detail.
6. Mark a notification read → toast offers «بازگردانی». Change a task status in a list → undo toast restores it.
7. Tasks/projects list: density toggle «فشرده» persists after reload and on another device/session.
8. Create-project modal with text typed → go to environment selector → switch is guarded (stay / keep draft / discard).
9. Go offline (devtools) → amber banner appears; pages keep showing cached data.
10. Check PageSurface shadow softness on selector/dashboard/lists vs. the previous build; dates show Persian digits with your timezone preference (`user.experience.timezone`).

**Next step: STOP.** Await explicit human acceptance of UX-02-4. Do not start AUTH-EXT-01, C5-EXT-01, UX-03, or WEB-CMS-01.
