# ADR-0024 — CORE-DEC-01/02: Core Completion Definition & Release Readiness

**Status: ACCEPTED (Product Owner, 2026-11-02, transmitted by Chief Software
Architect).**

## Context

The migration stages to date have delivered increasing Core coverage, but
the phrase "Core is complete" has been used informally to mean "code has
landed" rather than as a release-ready gate. This ADR fixes a normative
definition, a verification checklist, and the release-readiness boundary so
that later milestones (M3–M6 commercial, onboarding, support, operations,
payments, messaging) can plan against a shared contract.

## Decisions

### CORE-DEC-01 = A — Core-completion definition

> **The Core is complete only when all shared platform capabilities,
> commercial and operational infrastructure, security, frontend
> integration, and general-purpose services are ready, so that only
> specialized module design, development, and integration remain.**

In practice this means that after Core completion:

1. A new specialized business module (e.g. a vertical solution) can be
   added by writing only module-owned domain code, module-owned
   migrations, module-owned UI, and module-owned module-service-provider
   registration against stable Core contracts.
2. The module does NOT need to invent or modify: authentication,
   authorization/RBAC, workspace/tenancy scoping, audit, files,
   notifications, settings, plans/entitlements, billing primitives,
   onboarding shell, system-messaging channel, support-ticket hooks,
   incident/alert hooks, backup scheduling integration, or maintenance-mode
   handling. Those are supplied by Core.
3. Commercial infrastructure (plans, prices, quotes, order-review, payment
   adapters, receipts, invoices), operational infrastructure (incident
   logging, configurable external alerts, scheduled backups with restore
   evidence, controlled maintenance mode) and security (MFA for sensitive
   administrative roles, least-privilege defaults) are part of "Core
   complete", not post-Core afterthoughts.
4. Core completion is a product AND verification AND human-acceptance
   milestone — not merely a code-complete milestone (see CORE-DEC-02).

### CORE-DEC-02 = A — Core completion requires completed capabilities AND verification, not merely code completion

Code landing is necessary but not sufficient. Core-completion sign-off
requires every shared capability to have passed its automated verification,
security clearance, and human acceptance. Code without passing tests,
security review, or human acceptance does not count as "complete".

## Auditable core-completion checklist

The checklist below distinguishes five gate families. A capability is
"complete" only when all five columns are satisfied for that capability.
Aggregate Core completion = every in-scope capability is complete.

| Gate family | Meaning | Evidence artifact |
|---|---|---|
| **Implementation** | Code, migrations, contracts, module manifest entries, frontend shell integration landed on `main` (or the active epic branch prior to merge), scoped to approved modules, no cross-module table writes, no bypassed authorizations | Green GitHub Actions; stage-completion report in `docs/migration/`; architecture test coverage |
| **Automated verification** | Unit + feature tests cover the positive path, the invariant/security path, and the failure/idempotency path; PHPStan/Pint/TS-strict/ESLint gates pass; MySQL AND MariaDB migration gates pass; architecture dependency tests pass | CI status on the final commit of the stage; test names listed in the stage report |
| **Human acceptance** | Product-owner (or delegated reviewer) sign-off on behavior against the agreed specification; UX review for any user-facing surface; domain-language review by Chief Software Architect | Explicit approval recorded in the ADR / approval sheet; UX-REVIEW-### ticket references |
| **Security clearance** | Authorization boundary review (per-workspace scoping, role ceilings, sensitive-role MFA where required); audit-log coverage for sensitive mutations; secret/credential review; CSRF/rate-limit/input-validation spot-check; backup/encryption at-rest confirmation | Security review note appended to the stage report; security-audit-status doc updated |
| **Release readiness** | Runbook entries for the capability exist; rollback path is known; observability (logs, metrics where available) has identifiers; backwards-compatible migrations (no destructive drops without a prior deprecation release); no production-only branches or config hacks | `docs/operations/` runbook updated; `docs/deployment/` notes; production-readiness checklist cross-reference |

**Temporary deferral of human acceptance (status as of 2026-11-02):**
The product owner has deferred full human acceptance of Core stages until
a later integrated review pass. That deferral is *not* a waiver of the
human-acceptance or release-readiness columns in the checklist above — it
is a scheduling decision about *when* those columns are signed. No stage
is considered complete and no production deployment is authorized until
all five columns are satisfied, including the deferred human-acceptance
column. In particular, the deferred acceptance does not permit:

- Production deployment of Core before human acceptance closes;
- Promotion of "provisional" configuration defaults to permanent
  policy without explicit product-owner sign-off;
- Skipping security clearance or release-readiness items.

## Interactions with prior ADRs

- ADR-0019 (product-scope updates and execution priority) defines the
  catalog and priority ordering; it does NOT by itself define completion.
  This ADR fills that gap.
- ADR-0012 (code quality and project structure) is a subset of the
  "automated verification" column.
- ADR-0010 (subscriptions, entitlements, module activation) is in scope of
  Core completion when commercial foundations are implemented under
  C5-M2/M3.
- ADR-0020 Amendments B and C (UX-DS surface classification and radius
  hierarchy) remain binding on frontend surfaces and are unaffected by
  this ADR.
- ADR-0013 (subscription lifecycle v1) is a Core capability whose
  human-acceptance gate remains open per the deferred-acceptance note
  above until explicitly approved.

## Q4 / Q5 of C5-M2 remain pending

This ADR does not decide C5-M2 Q4 (quote for plan change / upgrade credit /
proration) or Q5 (catalog visibility of unpublished-period plans). Those
remain OPEN pending explicit product-owner approval. Their resolution is
not required for Core-decisions framing but is required before the
relevant M2 sub-stages (S3 plan-change quotes, S5 catalog surfaces) can be
marked complete.
