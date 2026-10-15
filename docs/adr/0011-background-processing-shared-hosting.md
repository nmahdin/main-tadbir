# ADR-0011 — Background Processing on Shared Hosting
**Status:** PROPOSED · Stage 01

## Context (CONFIRMED)
Shared hosting documented as having no SSH and no Cron (`docs/deployment.md`, `docs/operations.md`, `docs/environment.md`); production profile sets `QUEUE_CONNECTION=sync`, file cache/session. There are **no queued jobs** in the codebase (no `app/Jobs`, no `ShouldQueue`); Laravel scheduler entries exist (`routes/console.php`: `bale:tick` every minute; overdue-notification and content-code commands) but **whether any scheduler runs on the host is UNKNOWN**. The proven operable pattern in-repo is Bale: secret-protected HTTP `tick` endpoint + idempotent commands + DB/file runtime lock + a Bale-specific outbox table (`bale_outbox`) with deduplication keys and retry state.

## Decision (PROPOSED)
1. **Default execution is synchronous** within the request. Nothing may silently assume a queue worker, Cron, or a long-running process.
2. Deferred work uses **idempotent, externally triggerable ticks**: artisan commands also exposed (where safe) through authenticated/secret-protected endpoints, exactly like `bale:tick`, so an external scheduler *if one is ever confirmed* is an optimization, not a prerequisite. Every such job must be safe to run twice, late, or never-until-manually-triggered.
3. **Transactional outbox is conditional, not assumed:** it is introduced (Stage 07) only for domain events whose loss has material consequences, and only with a drain mechanism demonstrated on the actual host. Consumers must be idempotent; retries observable; sensitive payloads minimized (Bale outbox encrypts payload — the pattern to follow).
4. The Bale-specific outbox remains Bale's until Stage 05/07 replaces it with the Core mechanism or explicitly adopts it — it is a precedent, not the general event bus.
5. Prohibited without new host evidence: Redis/DB queue workers, Horizon, WebSocket daemons, `schedule:run` dependence, long-polling processes. Broadcast today is `log`; realtime features must degrade accordingly.

## OPEN
Q-03: actual host capabilities (Cron/cPanel scheduler, external scheduler availability, outbound HTTPS quotas, execution-time limits) — must be evidenced before Stage 07 finalizes mechanisms and before Stage 08 writes the runbook.

## Consequences
Module contracts (ADR-0001) must mark event delivery as *at-least-once-if-drained* with idempotent consumers, or synchronous — never "queued and forgotten".
