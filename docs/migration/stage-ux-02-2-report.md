# UX-02-2 — Full Dashboard UI Redesign (delivery report)

**Date:** 2026-10-19 · **Branch:** `arena/582a70e5-main-tadbir` · **PR:** #14 (open, unmerged)
**Status:** Implemented; pending human acceptance. Final visual acceptance of the
application shells (deferred UX-02-1 item 8) is expected after this stage.

## Route-to-dashboard replacement plan (audit result)

Before this stage, `/dashboard` (activeView `dashboard`) rendered exactly two
things regardless of the UX-02-1 environment: the legacy indigo-toned
`ActionDashboard` (real mode) or the legacy `DashboardView` (demo mode, driven
by in-memory fixture state). Platform and organization contexts therefore had
no management dashboard at all, and the personal dashboard used pre-Ocean
accent palettes (indigo/rose/violet tones, indigo hero gradient).

Replacement (implemented): `App.tsx` now renders `ContextDashboard` for the
`dashboard` view **and** for the fallback view. Resolution follows the
UX-02-1 environment context:

| Environment selection | Dashboard |
|---|---|
| `platform` | `PlatformDashboard` |
| `organization` | `OrganizationDashboard` |
| `workspace` (personal, organizational, or legacy unpinned) | `WorkspaceDashboard` (shared layout; org-workspace adds permitted management extras) |

`DashboardView.tsx` remains on disk unrendered only because the
`backendStatus` test suite pins its source contract; nothing routes to it.
`ActionDashboard.tsx` is likewise unrouted (legacy chunks disappeared from
the production bundle).

### Widget data mapping (live / API addition / deferred)

| Widget | Source | Status |
|---|---|---|
| Platform KPIs (organizations, users, subscriptions, suspended) | **new** `GET /core/platform/dashboard-summary`, each section gated by its exact platform permission | live |
| Platform attention (suspended orgs, orgs without subscription, subs expiring ≤30d, grace) | same endpoint, computed from real state | live |
| Platform recent activity | same endpoint (`platform.audit.view` section, `AuditLog`) | live |
| Infrastructure health | existing `GET /health` + `/health/db` (`BackendStatusPanel`) | live |
| Error/ops monitoring | OPS-01 not implemented | **deferred — honest unavailable card, no fabricated health** |
| Org members/workspaces counts | **new** `GET /core/organizations/{id}/dashboard-summary` (membership + `organization.*` gates) | live |
| Org subscription + quotas | same endpoint: C5 lifecycle state, plan/version, plan limits **with measured usage** (`CoreResourceUsageReader`; `storage_bytes` usage stays `null`/unknown — never fabricated) | live; honest `missing` state when unassigned |
| Org pending invitations + recent | same endpoint (`organization.members.manage` section) | live |
| Org recent management activity | same endpoint (`AuditLog` scope `organization`; management actions only, not project activity) | live |
| Personal/org-workspace lists (today, overdue, my projects, unread, approvals) | existing workspace page queries (`useWorkspacePage`) | live |
| Org-workspace team extras (members, invitations) | organization summary, only when sections are returned | live |
| UX-01 dashboard customization | — | out of scope, not implemented |

Known blockers found during audit: no organization-members list/count
endpoint existed (solved by the additive summary endpoint), subscription
administration has no list endpoint and is platform-gated (solved inside
the platform summary under `platform.subscriptions.manage`), and there is
no OPS-01 monitoring API (deferred honestly). UX-02-1 K2 is preserved:
workspace-dashboard lists still follow the existing legacy access rules —
the UI says so explicitly and no data is re-scoped by environment.

## What was built

**Backend (additive, read-only):** `DashboardSummaryController` with two
endpoints. Every section is gated by the exact permission of its
management surface; a forbidden section is `null`, never a fabricated
zero. Platform endpoint 403s without any active platform assignment;
organization endpoint 403s for non-members and suspended organizations
(`organization_unavailable`). Subscription usage reuses the C5
`CoreResourceUsageReader`; lifecycle states reuse `SubscriptionLifecycle`.
6 contract tests in `tests/Feature/Core/DashboardSummaryTest.php`
(permission matrix, counts, invitation pending, quota usage, audit order).

**Frontend:** `features/dashboard/` gains `dashboardApi.ts`, `widgets.tsx`
(shared Ocean header/KPI/widget/skeleton/honest-unavailable blocks), and
the four dashboards. All consume `var(--color-*)` tokens only — no indigo
or competing palettes, no hardcoded primary hex. Skeleton loading,
error-with-retry, empty states, Persian numerals/Jalali dates, RTL-first
layout, and links only to real authorized destinations
(`/tasks`, `/projects`, `/contents`, `/notifications`, `/approvals`,
`/invitations/manage`, `/scoped-settings`, `/select-environment`,
`/analytics`). Demo mode renders the same workspace layout from the
fixture context. 6 new gates in `frontend/tests/ux022.test.mjs`.

**Verification (browser, this sandbox):** demo + mocked-API Chromium runs
covering all four dashboards at 1440px and the workspace dashboard at
390px — zero page-level horizontal overflow, zero runtime errors,
screenshots inspected (ocean hero/KPIs/quota bars/attention/audit rows
all correct). A TEMP CI diagnostic (same pattern as UX-02-1, fully
removed; workflow byte-identical to before) identified two test-setup
mistakes during development — memberships cannot be created inside a
suspended organization (suspend-after-join), and subscription assignment
is itself the newest organization audit event — both fixed in tests;
no product behavior changed.

## Commits

| Commit | What |
|---|---|
| `85f585a9` | Backend summary APIs + contract tests |
| `5c7dcb4d` | Missing-vs-forbidden subscription distinction |
| `51afa20f` | Four context dashboards + App routing |
| `bdda5209` | UX-02-2 frontend regression gates |
| `b2f9274f` | Test-setup fixes; TEMP diagnostics removed |
| `39a552e6` | Rebuilt `frontend/dist` |
| (docs) | This report + status row |

## Gates

Local: `tsc --noEmit` clean, `npm test` **252/252**, `npm run build` OK.
CI at the code head: **Backend (Pint+PHPUnit) ✅, Frontend ✅, MySQL ✅,
MariaDB ✅, MariaDB 10.4-legacy ✅**. GitGuardian neutral (PR-size skip);
an independent secret scan is **still required before merge** — not
bypassed.

## Windows/Laragon smoke checklist

1. **Workspace:** sign in as demo-owner → «کارتابل من» shows the new ocean
   dashboard (today/overdue/projects/unread KPIs + lists), not the old
   indigo one. Open a task/project link and confirm the destination opens.
2. **Organization:** switch to an organization from «تغییر محیط» → open
   «کارتابل من» → organization dashboard: member/workspace counts, the
   subscription card (plan + end date; or «ثبت نشده» if none was
   assigned), quota bars with real usage, pending invitations count.
3. **Platform:** switch to «مدیریت پلتفرم» (platform admin) → platform
   dashboard: organization/user/subscription KPIs, attention items,
   recent platform activity, real API/DB health tiles, and the explicit
   «هنوز در دسترس نیست» OPS card.
4. **Permissions honesty:** sign in as demo-member (no platform role,
   plain org member) → management sections show permission explanations
   instead of numbers; no platform dashboard appears in the selector.
5. **Mobile/responsive:** shrink to phone width → KPIs stack 2-up,
   widgets stack 1-up, no horizontal scroll; drawer + dock still work.
6. **Org workspace:** enter a workspace that belongs to an organization
   (as an org manager) → the workspace dashboard gains the members /
   invitations extras at the bottom; as a plain member they stay absent.

## Explicitly unverified

- Real-backend (Laragon) rendering end-to-end (sandbox used demo mode +
  mocked APIs; ARCH-02 Laragon acceptance remains pending).
- Saved custom theme colors render through the dashboard hero by token
  (code-path only — the hero uses `--color-primary*` variables).
- Screen-reader pass (roles/labels inspected in DOM only).
