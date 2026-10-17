# ADR-0009 — MySQL/SQLite Compatibility and Ownership Constraints
**Status:** ACCEPTED* partly OPEN (target direction, 2026-10-15; prod MySQL UNKNOWN)

## Context (CONFIRMED)
Config default is SQLite; production profile (`.env.example`) is MySQL `utf8mb4` strict; CI tests only SQLite. The migration history already contains engine divergence: raw MySQL `ENUM` alterations (`DB::statement("ALTER TABLE … MODIFY COLUMN … ENUM…")`) versus a SQLite CHECK-constraint repair migration. Production MySQL **version, storage engine, and whether Laravel migrations or manual `.mysql.sql` patches produced the installed schema are UNKNOWN (Stage 00 R-04)**.

## Decision (PROPOSED)
1. **Domain validation is the portable enforcement layer:** XOR workspace ownership, one default personal workspace, one active role per membership, and last-manager invariants are enforced in transactional application logic on both engines, with tests.
2. **Database constraints are added wherever the *verified* engines support them**, via explicit engine-branched migrations (the existing pattern), each covered by a fresh-install test on SQLite in CI and, from Stage 03, a disposable **MySQL** migration test (local container/CI service — never the shared host):
   - XOR: `CHECK ((owner_user_id IS NOT NULL) + (organization_id IS NOT NULL) = 1)` is expressible on SQLite and on MySQL ≥ 8.0.16; on older MySQL the domain layer + trigger is the fallback — choice **OPEN until prod version is evidenced (Q-02)**, Stage 03 must not promise DB-level XOR before then.
   - One-default uniqueness: portable trick = a stored/generated discriminator column + unique index (MySQL lacks partial indexes; SQLite supports them) — generated-column syntax differs per engine and is specified in the Stage 03 PR against verified versions, not here.
   - Foreign keys: `restrictOnDelete` for ownership/membership spines; `nullOnDelete`/cascade only where the module documents why history survives (departing-member semantics, ADR-0003).
3. Enums: prefer `varchar` + application-level enum (PHP backed enums) for new Core statuses over native MySQL `ENUM`, because the repo's status history shows repeated ENUM surgery on MySQL vs CHECK repair on SQLite. Existing native enums are replaced when their module migrates; they are not extended.
4. JSON columns: allowed for schemaless content only (ADR-0008 rule); MySQL JSON vs SQLite text-JSON query behavior must be covered by the MySQL migration/behavior test once a module relies on JSON path queries (Content currently queries `payload->…` — CONFIRMED divergence risk).
5. No migration may be validated "on SQLite only" and described as production-ready after Stage 03; every schema stage reports MySQL result or NOT RUN.

## OPEN
Q-02 (production MySQL version/engine + schema provenance) — blocks DB-constraint promises, not documentation or disposable-dev work.
