# MariaDB Local Migration Compatibility — Fix Record

**Problem.** On a Windows local install backed by MariaDB,
`php artisan migrate` failed inside
`2026_10_15_000006_create_platform_administration_tables`:

```
SQLSTATE[42000] 1064 — ALTER TABLE core_permissions DROP CHECK core_permissions_scope_check
```

`DROP CHECK` is MySQL grammar; MariaDB removes CHECK constraints
with `DROP CONSTRAINT`. Migration 000006 already had a
mysql/mariadb branch — but it branched on Laravel's PDO **driver
name**, which is `mysql` for MariaDB servers too under the default
`mysql` connection, so the MySQL branch always ran.

**Fix (commit `60a70da`, branch `arena/582a70e5-main-tadbir`).**
The three migrations that remove a CHECK (the only
MySQL-vs-MariaDB grammar difference in the migration set) now:

1. Read the actual server engine from `SELECT VERSION()`
   (`…-MariaDB` ⇒ MariaDB) instead of the PDO driver name.
2. Issue `DROP CHECK` on MySQL (the syntax every existing MySQL
   CI gate has proven) and `DROP CONSTRAINT` on MariaDB — an
   explicit engine-aware strategy; no permissive mode
   (`FOREIGN_KEY_CHECKS`/`SQL_MODE`) is ever touched.
3. Guard every drop/add with `information_schema.TABLE_CONSTRAINTS`
   existence checks, so a partially applied state (MySQL/MariaDB
   DDL auto-commits per statement) resumes deterministically.

Files: `2026_10_15_000006` (up widen + down restore),
`2026_10_15_000008` (down), `2026_10_15_000012` (up + down).
Migration filenames/identities and the intended CHECK clauses are
unchanged; everything else in those migrations is untouched.
Other MySQL-family syntax in the set (`ADD CONSTRAINT … CHECK`,
generated columns, `MODIFY … ENUM`) is valid on both engines and
was verified by the new MariaDB CI gate.

**Evidence.** New CI job **Backend migration gate on MariaDB**
(mariadb:10.11): `migrate:fresh` + the engine schema suites
(Platform/Module/Plan/Invitation/Settings) — green on first run.
`PlatformSchemaMysqlTest` additionally asserts the intended
CHECK clauses survive on the running engine, round-trips 000012
down/up, and resumes from an already-widened partial state; a
source-level guard (`MigrationEngineCompatibilityTest`) runs in
the default suite. All pre-existing MySQL CI gates unchanged and
green; backend contracts suite green.

**Local recovery (non-destructive).** The failing statement is
the first statement of 000006's `up()`; on MariaDB it changed
nothing, so no rollback or manual cleanup is needed:

```powershell
cd backend
git pull            # get commit 60a70da (or the branch tip)
php artisan migrate:status   # 000006 shows Pending, earlier ones Ran
php artisan migrate          # resumes and completes
```

Optional verification in the MariaDB client before/after:

```sql
SELECT VERSION();
SELECT CONSTRAINT_NAME, CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = 'tadbir' AND TABLE_NAME = 'core_permissions';
SHOW TABLES LIKE 'platform_%';
```

If the CHECK was previously widened by hand, the existence
guards make `php artisan migrate` safe anyway. If `platform_*`
tables exist in a partial shape (not producible by this failure —
only by manual edits), stop and inspect them before migrating;
the migration intentionally fails loudly on incompatible partial
state rather than repairing silently. Never run
`migrate:fresh`/`migrate:rollback` on a database whose data you
want to keep.
