# Stage C2-1 completion report — platform schema & permission registry

Status: implemented on PR #14 (branch `arena/582a70e5-main-tadbir`),
pending explicit human acceptance. Scope: database and
permission-registry infrastructure only. No Platform APIs, no
PlatformAuthorizer, no lifecycle integration, no bootstrap or
emergency-recovery execution, no role grant/revoke/replace
services — those are later C2 work packages.

## Schema changes (one additive migration)

`2026_10_15_000006_create_platform_administration_tables.php`:

1. **MySQL scope CHECK widened first:**
   `core_permissions_scope_check` rebuilt as
   `scope IN ('organization', 'workspace', 'platform')` (the name
   and original definition were verified in `2026_10_15_000002:114`
   before writing this; SQLite has no such constraint — same
   documented OD-5 non-equivalence class as 03A/03B).
2. **`platform_roles`** — `id`, `key` VARCHAR(80) UNIQUE, `name`
   VARCHAR(150), `description` nullable, `is_protected` default
   false, `version` unsigned int default 1 (carried for future
   role management; never changed by C2-1), timestamps.
3. **`platform_role_permissions`** — composite primary key
   `(platform_role_id, permission_id)`, both FKs `RESTRICT`
   (deliberate deviation from `core_role_permissions`' CASCADE:
   deleting a referenced role/permission fails instead of silently
   unlinking; explicit detach is a later service's job). The
   schema cannot enforce platform-only permission scope; that rule
   is enforced by provisioning/services via
   `PermissionCatalog::assertKnownKeysForScope()` and tested.
4. **`platform_role_assignments`** — user/role FKs `RESTRICT`,
   nullable grant/revoke actor FKs (`nullOnDelete`), `revoked_at`
   soft revocation, full history retained. One active assignment
   per user is enforced by the generated `active_user_id` column
   (`CASE WHEN revoked_at IS NULL THEN user_id ELSE NULL END`) +
   unique index — the Stage 03A/03B discriminator idiom, verified
   on both engines. Nullable actors never invent an identity; the
   operational-actor audit contract belongs to the recovery stage.
5. **`platform_administration_control`** — singleton row `id = 1`
   created by the migration; `bootstrap_completed_at`,
   `bootstrapped_user_id`, timestamps. The id is deliberately NOT
   auto-increment: MySQL forbids CHECK constraints on
   AUTO_INCREMENT columns (error 3818, found by the MySQL gate),
   and `CHECK (id = 1)` enforces the singleton on MySQL. No API
   surface exists for this table; the future bootstrap rule
   (marker NULL AND no `primary_administrator` assignment ever)
   is documented on the model, not implemented here.

`down()` is non-destructive: it refuses (with a clear exception,
changing nothing) when assignment history or completed bootstrap
state exists; otherwise it drops the new tables, deletes
platform-scope permission rows, and narrows the CHECK last.

## Permission registry

`PermissionCatalog` remains canonical: added `SCOPE_PLATFORM` and
exactly six keys — `platform.admins.view`, `platform.admins.manage`,
`platform.users.view`, `platform.users.manage_status`,
`platform.organizations.view`, `platform.audit.view`. `sync()`
materializes rows and grants nothing (proven by test). No
future-stage keys (plans/modules/settings/org-suspension) exist.

## Protected primary role provisioning

`PlatformRoleProvisioner::ensurePrimaryAdministrator()` (invoked
from the existing opt-in `CoreRbacSeeder` after `sync()`):
creates `primary_administrator` (`is_protected = true`) with
exactly the six approved permissions, or **verifies** an existing
definition and throws `PlatformProvisioningException` on any
difference (unprotected collision, missing/extra permissions,
unsynced catalog). It never syncs privileges silently and never
creates assignments — no legacy admin is promoted, ever, by this
code path.

## Verification

- `PlatformSchemaTest` (SQLite, 10 tests): tables + control row;
  registry scope exactness; cross-scope rejection; one-active
  constraint + revoked history; RESTRICT deletion blocks;
  provisioning idempotency, conflict reporting ×2; no legacy
  promotion; rollback refusal.
- `PlatformSchemaMysqlTest` (real MySQL, CI MySQL job): platform
  permissions synchronize (would catch a missed CHECK widening);
  scope CHECK rejects `bogus`; generated-column unique enforced on
  InnoDB; singleton `CHECK (id=1)` rejects `id=2`; C1→C2-1 upgrade
  path (pre-C2-1 schema → run migration) and loud failure on
  incompatible partial state with safe recovery.
- Existing suites (C1/C1-H1 identity, 03A/03B RBAC incl. MySQL
  concurrency, 04A/04B) green unmodified.

## MySQL compatibility findings

- Enforced CHECK constraints and the generated-column technique
  verified on the CI MySQL 8 service. Production is MySQL with an
  unconfirmed version: **deployment requires ≥ 8.0.16** (stated in
  the migration docblock). MariaDB `DROP CHECK` phrasing is
  branched (`DROP CONSTRAINT`) but MariaDB is not a confirmed
  target.
- MySQL DDL auto-commits: partial migration states are possible in
  principle; the migration docblock specifies detection
  (`migrate:status` + information_schema inventory) and manual
  recovery. No silent structural acceptance is performed.

## Limitations

- Schema/provisioning only — nobody can be granted a platform
  role yet (no services/APIs by design).
- SQLite cannot enforce the scope CHECK or singleton CHECK
  (model/catalog enforcement + MySQL proofs cover the gap).
- `core_permissions.key` remains VARCHAR(255); only platform
  *role* keys are capped at 80 (contract), permission keys are
  unaffected.
