# SPEC-UX-02-4 — Shared Application Experience and Notification Center

- **Status:** SPECIFICATION — approved for documentation by the product owner (2026-10-19). **Implementation is NOT authorized by this document**; it requires a separate explicit authorization.
- **Baseline:** `bc6cf891` + doc commits on `arena/582a70e5-main-tadbir`; UX-02-3-FINAL human-accepted (2026-10-19). PR #14 OPEN/UNMERGED. Independent security scan and ARCH-02 acceptance remain OPEN and are untouched by this specification.
- **Authority chain:** ADR-0019 (execution priority) · core-v1-specification §H (Notifications, PROPOSED Core service) · ADR-0016 (PROPOSED shared Core services) · catalog v1.4. Where this spec and the PROPOSED Core design differ in sequencing, this spec governs UX-02-4 scope only; it does not silently promote ADR-0016 to ACCEPTED.
- **Format note:** §1 separates CONFIRMED current-code facts from the contracts in §2+. "Implemented" below always means verified in the current code, never inferred from test results alone.

---

## 1. Current-code audit (CONFIRMED) and dependency map

### 1.1 What already exists and must be reused

| Area | Current implementation (verified) | Disposition for UX-02-4 |
|---|---|---|
| Inbox storage | Notifications are rows in `domain_records` (`domain='notification'`, `payload` JSON: `read`, `type`, `notificationCategory`, `linkTaskId/linkProjectId/linkContentId/linkMeetingId/linkIdeaId`, `notification_key` unique per delivery). Migration `2026_09_27_000002` (+`2026_09_28_110000`) | **Reuse.** No new notifications table in this package (see §3.1 decision) |
| Inbox read API | `NotificationInbox::listing()` — per-user, SQL subject/recipient visibility before counting, filters `read/type/category`, `meta.unread_count/types/categories`, 20/page. Categories: `tasks, content, meetings, secretariat, collaboration, system` | Reuse + extend (grouping, mute-aware counts) |
| Mark read | `POST /notifications/read-all` (transactional, single SQL update on `payload->read`, throttled 10/min) and per-record write via the generic domain-record endpoint; frontend `useNotificationRead` | Reuse; bulk ordinary mark-read already exists (item 3 largely implemented) |
| Producers | `CommentNotifications`, `ContentWatchNotifier`, `MeetingNotifications`, `OverdueNotifications` (console command pattern in `routes/console.php`), Bale delivery (`NotificationDelivery`, outbox-style attempts) | Reuse; add `group_key`/context fields at production time (§3.3) |
| Top bell | `TopNavbar` dropdown: unread page via `useWorkspacePage('notifications', {read:'unread'})` (60 s refetch), click → mark-read → `notificationDestination()` navigate, else detail modal (`focusedNotif`); unread badge from `meta.unread_count` | Reuse + extend (grouping display, mute-aware badge, §5.2) |
| Center page | `/notifications` → `NotificationsView` (status/category filters, mark-read, mark-all, delete, open-related with existence checks) — legacy indigo styling; reads the AppContext boot collection (`useNotifications`), not the server inbox query | **Migrate** to the server inbox query + Ocean/PageSurface (§5.1); remove the dual data path |
| Toasts | `shared/ui/Notifications.tsx` (`toast.*` imperative API, queued pre-mount) — viewport is `position:fixed; top/left` (physical top-left), RTL stack, calm-text safety rule | **Already satisfies** the placement contract; add optional action slot (undo) |
| Page states | `Primitives`: `LoadingState`, `EmptyState` (variants first-use/no-results/no-permission/error), `ErrorState` (retry), `Skeleton`, `CardSkeleton`, `TableSkeleton` | Reuse; define adoption + per-page skeletons (§6) |
| Query cache | React Query: `staleTime 30s`, `gcTime 5min`, `refetchOnWindowFocus:false`; `keepPreviousData` on workspace pages; `skipToken`/`removeQueries` cache contract (UX-02-1) | Reuse; document per-query policy (§7) |
| Connectivity | `useOnlineStatus` (navigator.onLine + events) from UX-02-1 | Reuse; add shell-level indication + retry policy (§8) |
| Preferences | C7 user-scope keys exist: `user.experience.locale`, `user.experience.timezone`, `user.experience.list_columns` (all presentation-only, version-checked writes via `/core/preferences`) | **Reuse the same mechanism** for new keys (§9). No new preference storage |
| Dates/numerals | `formatPersianDate` (Intl `fa-IR`, browser timezone), `formatToJalaliNumber`, `toLocaleString('fa-IR')` widely used | Consolidate behind one formatter honoring the timezone preference (§10) |
| Modal/focus | `Modal` has focus trap, Escape, focus restore, scroll lock | Reuse; extend baseline to menus/dropdowns (§11) |
| Forms protection | `formDraft` autosave + `DirtyGuardDialog` (UX-02-3-FINAL) — per-form, not registered globally | Reuse; add shell switch-guard registry (§12) |
| Environments | `EnvironmentContext.switchEnvironment`, three shells, selector without recents (binding) | Preserve; deep-link context resolution builds on it (§5.3) |

### 1.2 Gaps this package closes (PROPOSED work)

Retention/archival (none exists) · notification grouping (none) · category muting (none) · center-page server unification + Ocean restyle · mute/group-aware unread counts · notification context resolution for deep links across environments · long-operation progress pattern · undo pattern for reversible actions · table density preference · context-switch unsaved-changes guard · offline shell banner + controlled retry policy · per-page skeleton adoption matrix · timezone-consistent date rendering.

### 1.3 Dependency map

```
Producers (tasks/content/meetings/comments/overdue jobs)
  → domain_records (domain=notification) ── NotificationInbox (read API) ── TopNavbar dropdown
                                          └─ NotificationsView (/notifications)
  → Bale NotificationDelivery (external channel, unchanged)
C7 preferences (/core/preferences, user.experience.*) ──► muting · density · timezone · list_columns
EnvironmentContext (selection/switch) ◄── deep-link resolver (§5.3) ◄── notification click
formDraft/DirtyGuardDialog ──► shell switch-guard registry (§12)
React Query policies (§7) · useOnlineStatus (§8) · toast viewport (§5.4)
SYS-MSG-01 (future): mandatory-message acknowledgment — OUT OF SCOPE, boundary in §2.3
CORE-REQ-01 (future): pending-actions center — OUT OF SCOPE (approvals inbox exists separately)
```

---

## 2. Scope decisions (binding for the implementation package)

### 2.1 The 17 approved scope items → contract sections
1. Single permission-aware center across contexts → §5.1–5.2. 2. 90-day retention + archival → §4. 3. Bulk mark-as-read → implemented (§1.1), hardening in §3.4. 4. Grouping → §3.5/§5.2. 5. Muting with mandatory/security exclusion → §9.2. 6. Click behavior (detail modal / navigate action / direct navigate / safe context resolution) → §5.3. 7. Toasts top-left → implemented; §5.4 confirms. 8. Page skeletons/empty/error/responsive → §6. 9. Short-lived caching + safe background revalidation → §7. 10. Connectivity indication + controlled retries → §8. 11. Progress for genuinely long operations → §13. 12. Undo for domain-supported reversible actions → §14. 13. Unsaved-change protection on context switch → §12. 14. Jalali + user timezone + Persian numerals (technical exceptions) → §10. 15. Table density preference → §9.3. 16. Cross-device preference sync via existing infrastructure → §9.1. 17. Basic keyboard/focus; WCAG AA audit deferred → §11.

### 2.2 Preserved invariants (from ADR-0019 / prior approvals)
Three shells and role-aware sidebars unchanged; canonical Ocean `/theme-previews` (`#39677C/#2B5266/#F5F9FA`, white rounded shadowed PageSurface); UX-02-3 list/detail/form/sort/permission behavior untouched; selector without recents; no secrets in URLs; backend authorization authoritative (notification visibility never grants record access — every deep link re-authorizes at follow time); K2 (workspace selection is navigation context, not hard isolation).

### 2.3 Explicit non-goals
- **SYS-MSG-01 is not implemented**: reading a notification (`read_at`) is **not** legal acknowledgment of a mandatory official message. UX-02-4 only (a) keeps the semantics distinct in API/UI copy, and (b) reserves the `mandatory` payload flag + `system`/`security` categories as non-mutable and retention-exempt, so SYS-MSG-01 can build on them later without migration gymnastics. No acknowledgment workflow, receipt, or legal record is created here.
- **CORE-REQ-01 is not implemented**: the existing approvals inbox (عمل‌های در انتظار بررسی) stays as-is; no pending-actions center is built.
- No new notification table, no WebSocket/push infrastructure, no email channel work (Bale delivery unchanged), no WCAG AA audit, no public-website/CMS surface.

### 2.4 Storage decision (resolves spec §H sequencing for this package)
ADR-0016/core-spec §H propose a dedicated Core `notifications` table. **UX-02-4 does not perform that extraction.** Rationale: the `domain_records` inbox is production-shaped, producer-integrated (incl. Bale `notification_key` idempotency), and covered by existing tests; extracting it now would be an unrelated architectural migration against standing instructions. UX-02-4 instead adds three additive, nullable columns to `domain_records` (§3.2). A future Core stage may still extract; the columns map 1:1 to the proposed Core fields, so nothing here blocks it.

---

## 3. Backend contract

### 3.1 Tables and indexes (MariaDB 10.4.32-safe, non-destructive)
Existing: `domain_records(id, domain, user_id, parent_id, title, status, payload JSON, notification_key unique nullable, timestamps)` with indexes `(domain, created_at)`, `(domain, user_id)`, `(domain, parent_id)`.

Additive migration (new file, `Schema::table`, nullable columns, no data rewrite, reversible `down` drops only the new columns):
```sql
read_at      TIMESTAMP NULL            -- mirrors payload.read for indexed filtering
category_key VARCHAR(40) NULL          -- denormalized payload.notificationCategory (fallback: type inference)
group_key    VARCHAR(120) NULL         -- e.g. 'tasks:status_change:1042' (type + subject)
KEY ix_notif_inbox (domain, user_id, read_at, id)
KEY ix_notif_group (domain, user_id, group_key, id)
KEY ix_notif_retention (domain, created_at)
```
- Writers (producers + read endpoints) populate `read_at`/`category_key`/`group_key`; readers use `COALESCE(column, payload fallback)` during a transition period — **no backfill command is required for correctness**; an idempotent artisan backfill (`notifications:backfill-columns`, chunked by id) is provided for index efficiency and may run anytime.
- JSON payload stays the source of record content; columns are query accelerators only. MariaDB 10.4 JSON (= LONGTEXT alias) semantics unchanged; no `CHECK` constraints added; no strict-mode changes.

### 3.2 Retention and archival (§scope item 2)
- Policy: inbox rows older than **90 days** leave the active inbox. Read rows are deleted; **unread ordinary rows are archived first** (copied to `notification_archives(id, user_id, payload, notification_key, created_at, archived_at)` — created by the same additive migration), then deleted. Rows with `payload.mandatory = true` or category `system` with type prefix `security` are **exempt** (retained until SYS-MSG-01 defines their lifecycle).
- Runner: artisan command `notifications:prune-retention` (chunked 1,000 by id, transactional per chunk, `--dry-run` supported, logs counts), registered in `routes/console.php` following the `OverdueNotifications` precedent; on shared hosting it runs via the existing scheduler/tick mechanism (ADR-0011) — no new daemon. Failure of one chunk never blocks others; the command is idempotent and safe to re-run.
- User-visible effect: the center shows at most 90 days; an unobtrusive caption states the retention («اعلان‌ها تا ۹۰ روز نگه داشته می‌شوند»). Archived rows are not user-visible in UX-02-4 (support/OPS tooling is a later package decision).

### 3.3 Producer contract (additive payload fields)
Producers add, when known: `category` (one of the six `NotificationInbox::CATEGORIES`, final server-side authority stays the existing explicit-then-inferred rule), `group_key` (stable per type+subject: `{category}:{type}:{subjectId}`, or `{category}:{type}` for subject-less), `context` (`{kind: platform|organization|workspace, id}` of the record's owning context when determinable), `body` (optional longer detail text enabling the §5.3 detail modal), `mandatory: true` only for future SYS/security producers (none in this package). Payload remains display data only — never authorization data; no secrets; no record content beyond title/summary already shown today.

### 3.4 API contracts (all under existing auth; backend authorization authoritative)
| Endpoint | Change |
|---|---|
| `GET /notifications` (inbox listing) | New optional params: `grouped=1`, `include_muted=1`. Response rows gain `read_at`, `category`, `group_key`, `body?`, `context?`; `meta` gains `unread_count` **excluding muted categories** (default), `unread_count_all`, `muted_categories`. All existing params/responses stay valid (additive only) |
| `GET /notifications` with `grouped=1` | Returns group rows `{group_key, category, type, latest, count, unread_count, sample}` paginated by latest activity; opening a group = same endpoint filtered by `group_key` (new accepted param) |
| `PUT /notifications/{id}` `{read:true}` | Unchanged semantics; also writes `read_at` column |
| `POST /notifications/read-all` | Unchanged; gains optional `{category}` / `{group_key}` scoping (ordinary notifications only — mandatory/security rows are excluded from bulk-read when flagged); response `{updated}` unchanged |
| `GET/PUT /core/preferences/{key}` | New keys per §9 via the existing C7 definitions registry (version-checked writes, 409 on stale version — no new endpoints) |
| `DELETE /notifications/{id}` (existing per-record clear) | Unchanged |
Failure behavior: listing failures return the standard API error envelope (client shows `ErrorState` with retry); preference conflicts return 409 with the current version (client keeps local state and offers reload — same contract as list_columns); pruning never affects request paths.

### 3.5 Grouping semantics
Server-side `group_key` is authoritative; grouping is a **display aggregation**, never a merge: every row keeps its own read state. A group is "unread" if any member is unread. Mark-read on a group = the scoped read-all of §3.4. Groups older than the retention window prune by member age (a group disappears when its last member prunes).

---

## 4. Retention job summary
`notifications:prune-retention` (daily via scheduler/tick) → archives unread ordinary >90d → deletes read >90d + archived originals → exemptions per §3.2 → structured log line (counts only). Acceptance: seeded fixtures at 89/90/91 days verify each branch incl. exemption (backend feature test).

---

## 5. Frontend: notification experience

### 5.1 Center page `/notifications` (migrate + restyle)
- Data: replace the AppContext boot-collection read with the server inbox query (`useWorkspacePage('notifications', …)` with `read/category/grouped` params), server pagination 20/page using the shared `Pagination` (per-page 10/20/50/100), URL-driven filter state like UX-02-3 lists (`parseListQuery`-style validated params).
- Layout: `PageSurface`; Ocean header (مرکز اعلان‌ها + unread caption + retention caption); status segmented control + category chips (existing labels/icons, Ocean tones replacing indigo/violet); rows per §5.2; skeleton/empty/error per §6; bulk actions: «خواندن همه» (existing) + per-category/group mark-read.
- Delete per-record stays (existing behavior, confirmed). The AppContext `useNotifications` boot entry is retired only after parity is proven (producer count check) — one inbox, no duplicated mechanism.

### 5.2 Bell dropdown and rows (extend existing)
Dropdown keeps its contract (unread-first, 60 s background refetch) and gains: grouped display (group rows with «۳ مورد مشابه» expander), muted categories excluded from badge/count (visible under «بی‌صداشده‌ها» section in the center only), per-row relative Jalali timestamp. Row anatomy (dropdown + center): category icon, title, one-line summary, time, unread dot, hover actions (mark-read, open). Rows are `<button>`/link semantics with `aria-label`s; list is a `listbox`-free semantic list (simpler and robust) with arrow-key navigation (§11).

### 5.3 Click resolution algorithm (item 6 — exact)
```
onNotificationActivate(n):
  1. If n unread → mark read (existing mutation; failure leaves the row unread and shows the error inline — never navigates on a failed read-write unless the user activates again).
  2. destination = notificationDestination(n)  (existing allowlisted mapping; extended with meeting/idea links already present in payloads)
  3. If n has meaningful detail (n.body non-empty OR n is a group sample with >1 member):
       open NotificationDetailModal (title, body, category, Jalali time, group members if any)
       with primary action «مشاهدهٔ مورد مرتبط» (step 4) and secondary «بستن». Reading happened in step 1; the modal states content, never implies legal acknowledgment.
     Else → step 4 directly.
  4. If destination requires a different environment context (n.context ≠ current selection):
       resolveEnvironment(payload, n.context):
         - resolvable + user has that context → EnvironmentContext.switchEnvironment (subject to §12 guard), then navigate
         - not resolvable/inaccessible → stay; toast error «این مورد در محیط فعلی در دسترس نیست» (existing honest pattern from NotificationsView)
     Else navigate(destination with returnTo = current path, existing contract).
  5. If the destination record no longer exists (detail 404 on arrival), the destination page's existing NotFound/error state renders — never a fabricated record.
```

### 5.4 Toasts
Placement already physical top-left (`ui-toast-viewport`) — verified, unchanged. Extensions: optional `action` ({label, onClick}) slot rendered as a small button (used by §14 undo and offline-retry), `duration` already supported by the record model; toasts never carry raw API payloads (existing safety rule). Mandatory/security categories do **not** raise toasts in UX-02-4 beyond existing producer behavior — no change.

### 5.5 Shell integration (preserved shells)
Bell + center exist in the main shell across platform/organization/personal-workspace/org-workspace contexts identically (the inbox is per-user, context-independent; only deep-link resolution is context-aware). `/select-environment` and future public/CMS surfaces do not embed the center. Sidebar nav destination «اعلان‌ها» → `/notifications` unchanged; badge counts follow §5.2 rules everywhere (single source: the inbox query meta).

---

## 6. Page states (item 8)
Adoption contract: every data page renders exactly one of loading (page-specific skeleton: `TableSkeleton` for lists, header+card skeleton for details, `CardSkeleton` for dashboards), ready, empty (`EmptyState` variant: first-use vs no-results vs no-permission — distinct copy), error (`ErrorState` + retry). Background refetch shows the existing non-blocking «در حال تازه‌سازی» indicator instead of skeletons. Responsive: table→cards ≤768px (existing WorkspaceList pattern), dropdown becomes full-width sheet on ≤480px, tap targets ≥40px. Per-page matrix (implementation deliverable): notifications center, WorkspaceList modules, project/content detail, dashboards, scoped settings — each lists its skeleton component + empty variants; pages not yet adopting are listed as residual work, never claimed.

## 7. Caching and background revalidation (item 9)
Keep global defaults (stale 30 s, gc 5 min, no focus refetch). Per-query policy: inbox bell query `staleTime 60s + refetchInterval 60s` (existing); center page `staleTime 30s`, `keepPreviousData`; mutations invalidate `['pages', userId, 'notifications']` + workspaceKeys of affected modules (existing invalidation helpers); preference writes are optimistic-local with version-checked server write and 409 rollback. No query persists across users: the UX-02-1 `removeQueries`/skipToken session contract is preserved (session switch clears cache — verified by existing ux021 gates; new queries must key by `currentUser.id` as existing ones do).

## 8. Connectivity (item 10)
Shell-level offline banner (appears when `useOnlineStatus()` is false; Ocean-neutral styling, role="status") «اتصال اینترنت قطع شده است؛ تغییرات شما ممکن است ذخیره نشود». Policies: queries pause their refetch intervals while offline; **mutations are never auto-retried** (user confirms via the existing error state/toast action «تلاش مجدد»); on `online`, invalidated inbox + current page queries revalidate once. No offline write queue is built (out of scope; forms rely on §12 drafts).

## 9. Preferences (items 5, 15, 16 — all via C7 user infrastructure)
### 9.1 Mechanism
New definitions in `CoreSettingDefinitions` (SCOPE_USER, TYPE_STRING JSON, presentation-only, version-checked — the `list_columns` precedent): `user.experience.notification_mutes`, `user.experience.table_density`. Client access via the existing `shared/api/preferences.ts` pattern (read all from `/core/preferences`, write with `expected_version`); syncs across devices by construction (server-stored per user), last-writer-wins guarded by version 409s.
### 9.2 Muting
Value: array of category keys from the mutable set `tasks, content, meetings, secretariat, collaboration`. `system` and any `security*` type are **not mutable** (UI shows them locked with an explanation; API-side, a mute list containing them is accepted but ignored for those keys — server re-derives the effective set). Effect (§3.4/§5.2): muted categories don't count in badge/dropdown unread, render greyed in a collapsed center section, and still exist + remain searchable by category filter. UI home: `/notifications` «تنظیمات اعلان‌ها» section + profile settings link (one control, no duplicates).
### 9.3 Density
Value: `normal | compact` (default `normal`). Applied to `WorkspaceList` tables and shared `DataTable` (row/cell padding scale via a `data-density` attribute + CSS), persisted per user; not applied to dashboards/cards. Control lives beside the columns menu («تراکم جدول») and in settings; one shared hook `useTableDensity()`.

## 10. Dates, timezone, numerals (item 14)
Single formatter module (`shared/lib/date.ts` consolidation): all user-facing dates Jalali via `Intl.DateTimeFormat('fa-IR', { timeZone })` where `timeZone` = effective `user.experience.timezone` preference (default `Asia/Tehran`, already a C7 key), falling back to the organization/workspace `display.timezone` when the user has none (existing inheritance). Relative times («۳ ساعت پیش») computed in the same zone. Numerals: Persian digits for counts/times/amounts via `toLocaleString('fa-IR')` (already dominant). **Technical exceptions keep Latin digits**: record codes (KM101), IDs, ISO date inputs/URLs, version strings, file names, code/technical readouts. Stored data remains UTC (definition text already guarantees this); only presentation converts.

## 11. Keyboard and focus baseline (item 17)
`Modal` trap/Escape/restore already implemented — reused for the detail modal and guard. Additions: dropdown + menus close on Escape and return focus to the bell (pattern exists for dropdowns; verify + gate); notification rows reachable by Tab with visible focus ring (existing 70%-primary focus mix — never fork colors); arrow-key movement inside the center list; skip-to-content link in the main shell; all icon buttons keep `aria-label`s. **Full WCAG AA audit remains deferred** (explicitly out of scope) — this section is a usable baseline, not an accessibility certification.

## 12. Unsaved-change protection on context switch (item 13)
A shell-level dirty registry: `registerDirtySource(id, isDirty)` in a small shared store; UX-02-3 form drafts expose their dirty state (CreateProjectModal/EditProjectModal first adopters; other forms opt in without refactoring). `EnvironmentContext.switchEnvironment` consults the registry through an injected guard callback (context stays decoupled — the shell registers the handler): if any source is dirty, the switch is intercepted by `DirtyGuardDialog` (ذخیره و ادامه → persist drafts then switch · حذف پیش‌نویس و خروج → discard then switch · ادامهٔ ویرایش → abort switch). Non-form navigation (in-app links) intentionally stays unguarded except where UX-02-3 already guards.

## 13. Progress for long operations (item 11)
Pattern contract: operations with server-known totals (file uploads via DAM progress events, exports when they exceed the synchronous bound in a future async stage) show determinate progress in-place (button→progress bar with ٪ Persian numerals + cancel where the domain supports it); operations without totals show the existing indeterminate busy states. **No fabricated percentages.** UX-02-4 delivers the shared `ProgressBar` Ocean component + applies it to the two existing genuinely-long flows: DAM multi-file upload (if its transport exposes progress) and large list export download waiting (indeterminate + cancel via AbortController where safe). Anything requiring backend job infrastructure is deferred and labeled.

## 14. Undo (item 12)
Toast-with-action pattern (§5.4) for **domain-supported reversible actions only**, each with its real inverse endpoint: mark-as-read (single + bulk: inverse = mark-unread via the same per-record write), tasks bulk status (inverse = re-run bulk with the captured previous status per record, only where each record's transition is itself allowed — failures reported like the forward action), archive↔restore where the domain already exposes it. Window: 10 s, client-side only; after expiry the normal UI paths remain. Destructive/irreversible actions (permanent deletes, publication) are **never** given undo. Undo never bypasses per-record authorization — the inverse call is a normal authorized request.

---

## 15. Exact change inventory (implementation package — proposed)

**Backend:** migration (3 columns + `notification_archives` + indexes) · `NotificationInbox` (column-aware reads, grouped mode, mute-aware meta, scoped read-all) · producers add §3.3 fields · `NotificationInboxController` (param pass-through) · `notifications:prune-retention` + `notifications:backfill-columns` commands + console registration · `CoreSettingDefinitions` (2 keys) · tests: inbox grouping/muting, retention branches incl. exemption, preference registry, scoped read-all, backfill idempotency.
**Frontend:** `NotificationsView` server-unification + Ocean restyle · `TopNavbar` grouped/muted dropdown · `NotificationDetailModal` + resolver in `TopNavbar`/`listQuery.ts` extension · `shared/api/preferences.ts` (mutes/density accessors) + `useTableDensity` · `WorkspaceList`/`DataTable` density application · offline banner in shell · switch-guard registry + modal wiring in `EnvironmentContext`/shell · skeleton adoption per §6 matrix · date formatter consolidation · toast action slot + undo recipes · tests (source + behavior gates like ux023 pattern).
**Untouched:** Bale delivery, approvals inbox, SYS-MSG/CORE-REQ surfaces, shells/sidebars, UX-02-3 list internals beyond the density hook.

## 16. Phased implementation plan (each phase independently shippable + authorized as one package)
- **P1 Backend foundations:** migration, producer fields, inbox extensions, retention command, preference keys + backend tests. No UI change.
- **P2 Center unification:** server-paged Ocean center + dropdown grouping/muting + click resolver + detail modal; retire dual data path after parity check.
- **P3 Experience preferences & shell:** mutes UI, density, timezone formatter consolidation, offline banner, switch guard.
- **P4 Polish contracts:** undo recipes, progress pattern adoption, keyboard pass, skeleton matrix completion.

## 17. Acceptance checklist (for the future implementation authorization)
Backend: migration up/down on sqlite + MariaDB 10.4 CI gates; retention fixtures 89/90/91d + mandatory exemption; grouping/mute/scoped-read-all feature tests; preference 409 behavior. Frontend: typecheck, full test suite + new gates (resolver branches, mute filtering, density hook, guard interception); production build. Visual (mocked API, 1440/834/390): center (grouped, muted section, empty/error/skeleton), dropdown, detail modal, offline banner, compact density, context-switch guard. Laragon: real login → produce comment/task notifications → group/mute/read flows → switch environment with an unsaved project form → guard appears → 90-day caption; `tadbir` DB untouched except the additive migration (verify `m artisan migrate:status`). Security: deep links re-authorize (foreign-context notification → honest denial), no payload secrets, independent scan still gates PR merge.

## 18. Traceability matrix (approved decision → contract → status today)

| # | Approved behavior (source) | Contract § | Status today | In this package |
|---|---|---|---|---|
| 1 | Single permission-aware center, all contexts (UX-02-4 scope 1; spec §H) | §5.1–5.2 | 🟡 two data paths (bell=server, center=collection) | Unify on server inbox |
| 2 | 90-day retention + archival (scope 2) | §3.2/§4 | ❌ none | Command + archive table |
| 3 | Bulk mark-as-read ordinary (scope 3) | §3.4 | ✅ `read-all` exists | Scope by category/group; exclude flagged |
| 4 | Grouping similar (scope 4) | §3.5/§5.2 | ❌ | `group_key` + grouped mode |
| 5 | Muting, mandatory/security excluded (scope 5) | §9.2 | ❌ | `notification_mutes` pref |
| 6 | Click: modal / navigate action / direct / context-safe (scope 6) | §5.3 | 🟡 navigate-or-modal exists; no context resolution | Resolver + context field |
| 7 | Toasts physical top-left (scope 7) | §5.4 | ✅ verified CSS | Action slot only |
| 8 | Page skeletons/empty/error/responsive (scope 8) | §6 | 🟡 components exist, adoption uneven | Adoption matrix |
| 9 | Short-lived cache + safe revalidation (scope 9) | §7 | ✅ defaults + patterns | Document + enforce keys |
| 10 | Connectivity indication + controlled retries (scope 10) | §8 | 🟡 hook exists, no shell banner/policy | Banner + retry policy |
| 11 | Progress for genuinely long ops (scope 11) | §13 | 🟡 busy states only | Shared pattern, honest totals |
| 12 | Undo where domain supports (scope 12) | §14 | ❌ | Toast-action recipes |
| 13 | Unsaved-change protection on context switch (scope 13) | §12 | 🟡 per-form guards only | Shell switch-guard registry |
| 14 | Jalali + user timezone + Persian numerals, technical exceptions (scope 14) | §10 | 🟡 Jalali yes; browser-tz; exceptions ad hoc | Formatter consolidation |
| 15 | Normal/compact table density (scope 15) | §9.3 | ❌ | `table_density` pref + hook |
| 16 | Cross-device pref sync via C7 (scope 16) | §9.1 | ✅ mechanism (`list_columns`) | Two new keys |
| 17 | Keyboard/focus baseline; AA deferred (scope 17) | §11 | 🟡 Modal trap exists | Baseline additions |
| B1 | Read ≠ legal acknowledgment; SYS-MSG-01 not prebuilt (instruction) | §2.3 | ✅ no acknowledgment exists | Reserve flags only |
| B2 | CORE-REQ-01 not prebuilt (instruction) | §2.3 | ✅ approvals inbox separate | Untouched |

## 19. Risks and open questions (for the authorization decision)
1. **Grouping key stability** across old rows (no `group_key`) — mitigated by read-time fallback derivation from type+subject, identical rule to the writer.
2. **Center unification parity** — the AppContext collection also feeds badges elsewhere; P2 must inventory every consumer before retiring it.
3. **`domain_records` growth** — retention bounds notifications, but other domains share the table; indexes are domain-prefixed so pruning stays scoped.
4. Open for product owner (non-blocking): archive visibility for users (currently: none), default group expansion, whether muted categories also suppress Bale delivery (spec default: **no**, in-app only).

## 20. Deliverable state
This spec is implementation-ready: contracts, schemas, APIs, routes/components, failure behavior, phasing, and acceptance tests are defined against verified current code. **Nothing here is implemented yet.** Next step requires explicit UX-02-4 implementation authorization.
