# TADBIR Comprehensive — Master Execution Roadmap

**Status:** APPROVED PLANNING BASELINE (product-owner instruction, 2026-10-19). This document authorizes **no implementation by itself**; each package starts only on explicit user authorization. Recorded in ADR-0019; module inventory authority is `docs/architecture/product-and-module-catalog.md` (v1.4).

## 1. Verified baseline (2026-10-19)

| Item | State |
|---|---|
| Stack | Laravel 13 · React 19 · Tailwind CSS 4 · Modular Monolith · Persian RTL |
| Canonical design | `/theme-previews` (Ocean): primary `#39677C`, secondary `#2B5266`, background `#F5F9FA`; white rounded `PageSurface` with soft shadow on all applicable internal pages |
| Branch / PR | `arena/582a70e5-main-tadbir`; PR #14 OPEN, MERGEABLE, **unmerged by instruction** |
| Latest delivery | UX-02-3-FINAL at `bc6cf891`; five product CI gates green at that head; **human-accepted by the user after Laragon review (2026-10-19)** |
| Catalog | 22 registered modules (16 reusable + 6 specialized); 15 future/deferred areas (v1.4) |
| Open gates | UX-02-3-FINAL human Laragon acceptance · independent security scan · ARCH-02 Laragon acceptance — all OPEN |

## 2. Approved execution sequence (binding)

| # | Package | Scope (summary) | Depends on | Spec readiness |
|---|---|---|---|---|
| 1 | **UX-02-3-FINAL acceptance** | Human Laragon acceptance of `bc6cf891` + any necessary fixes | — (current step) | Delivered; matrix: `docs/migration/ux-02-3-final-compliance-matrix.md` |
| 2 | **UX-02-4** | Shared notifications, page states, connectivity, UX preferences, responsive behavior | #1 ✅ accepted; Core notifications service (ADR-0016, PROPOSED) | ✅ **IMPLEMENTED** per SPEC-UX-02-4 + shadow/muting amendments (PR #14, unmerged) — awaiting human acceptance (`docs/migration/stage-ux-02-4-report.md`) |
| 3 | **AUTH-EXT-01** | Registration, authentication, verification, recovery, security settings | #1 (stable account/session UX); existing auth/RBAC | 📄 **SPEC-AUTH-EXT-01 delivered** (`docs/architecture/spec-auth-ext-01-registration-authentication-account-security.md`) — implementation NOT authorized |
| 4 | **C5-EXT-01 + subscription checkout** | Free plans, entitlements, billing, renewals, payments, financial history | #3 (account identity for payers); C5 foundation (ADR-0010 ACCEPTED*, ADR-0013 PROPOSED lifecycle) | 🟡 Foundation exists; checkout/payment spec missing |
| 5 | **UX-03** | Public marketing website, published feature/pricing presentation (Persian-only) | #4 (pricing/entitlement truth to present) | ❌ No spec document — specification stage required |
| 6 | **WEB-CMS-01** | Independent `/site-studio`, structured block editor, public content + publishing (Persian-only, no mandatory multi-person approval in MVP) | #5 (public site shell consumes CMS output) | ❌ No spec document — specification stage required |
| 7 | **CORE-REQ-01 + SYS-MSG-01** | Pending actions; mandatory official messages | #2 (shared notification/state patterns); ADR-0016 | ❌ No spec document — specification stage required |
| 8 | **SUP-01** | Centralized support ticketing | #3, #7; catalog reservation `helpdesk` (future area) | ❌ No spec document — specification stage required |
| 9 | **OPS-01** | Monitoring, service health, alerting, incident management (detail retention 6 months, aggregates 12 months) | Platform admin scope (ADR-0014 PROPOSED); UX-02-2 OPS honesty contract (unavailable until owned) | ❌ No spec document — specification stage required |
| 10 | **BACKUP-01 + MAINT-01** | Backup/recovery at platform/organization/workspace/personal scopes; global + scoped maintenance with backend enforcement | ADR-0011 (background processing); platform/organization administration | ❌ No spec document — specification stage required |
| 11 | **UX-04** | Contextual product onboarding after the application UI stabilizes | #2–#10 UI surface stability | ❌ No spec document — specification stage required |
| 12 | **Business modules** | Separately specified, in approved priority order (incl. expanded `notes` knowledge workspace; future `product-management`; future `commerce`) | Per-module specification stage + catalog disposition | ❌ Per-module specs required (Notes expansion explicitly requires its own specification) |

**UX-01 advanced layout customization remains deferred until module pages stabilize** — it is not in the active sequence.

## 3. Proposed order, dependencies, and rules

- The sequence above **is** the proposed and approved order. It may be refined only for genuine technical dependencies, and any proposed reordering must be explained **before** execution.
- Every package must deliver both halves: **technical architecture** (schemas, indexes, APIs, permissions, background jobs, algorithms, failure handling, migration safety) and the **real user interface** (Ocean layouts on actual application routes, context-correct sidebar menus, forms, detail pages, responsive behavior, loading/empty/error states, accessibility baseline). Showcase-only components never substitute for application pages.
- Functionality must not be claimed where backend ownership, authorization, or data isolation is incomplete; backend permission checks remain authoritative.
- Each package maintains a **traceability matrix**: Decision ID + approved behavior → exact UI pages/sidebars/navigation → DB and API changes → authorization/environment rules → implementation files → tests and visual evidence → status (implemented / partially implemented / deferred / blocked). Tests passing never, by themselves, mark approved functionality complete (the UX-02-3 lesson, binding).
- Preserved exceptions/refinements (binding): no recent environments in the selector; large concise environment cards; separate Ocean sidebars per context; Persian-only public website/CMS; independent `/site-studio`; no mandatory multi-person CMS publication approval in MVP; OPS retention 6-month detail / 12-month aggregates; four-level backup scopes; global + scoped maintenance with backend enforcement.
- Safety invariants: PR #14 unmerged; no force-push; no production deployment; preserve the Windows/Laragon MariaDB 10.4.32 `tadbir` database; no destructive migrations or resets.

## 4. Outstanding acceptance gates (decision traceability)

| Gate | State | Evidence / next action |
|---|---|---|
| UX-02-3-FINAL human Laragon acceptance | ✅ **GRANTED 2026-10-19** (user Laragon review) | Acceptance record in `stage-ux-02-3-report.md`; security scan + ARCH-02 gates below remain open and separate |
| UX-02-3-FINAL CI | Green at `bc6cf891` (5 gates; GitGuardian neutral) | Does **not** substitute for acceptance (ADR-0019 §7) |
| Independent security scan | **OPEN** — required before PR #14 merge | Neutral/skipped scanner ≠ pass; schedule a real scan |
| ARCH-02 local Laragon acceptance | **OPEN** | Not claimed by any delivery so far |
| UX-02-2 | User-visually-accepted in Laragon (prior) | Recorded; ARCH-02 acceptance above is separate |

## 5. Next authorized step

**Wait for explicit human acceptance of UX-02-4.** UX-02-4 is implemented, delivered, and corrected (settings-control discoverability + UX-DS-DEC-01 flat surfaces, ADR-0020); it is NOT yet human-accepted. SPEC-AUTH-EXT-01 is delivered for review; its implementation — and C5-EXT-01, UX-03, WEB-CMS-01, Notes, Product Management, E-commerce — starts only with explicit authorization.
