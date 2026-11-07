# MariaDB Subscription TIMESTAMP Compatibility — Fix Record

**Problem.** On MariaDB **10.4.32** with
`explicit_defaults_for_timestamp=0` (OFF) and strict
`sql_mode` (`…NO_ZERO_IN_DATE,NO_ZERO_DATE…`), migration
`2026_10_15_000011_create_subscription_tables` failed:

```
SQLSTATE[42000] 1067 Invalid default value for 'expires_at'
```

**Root cause.** With legacy timestamp defaults OFF, MariaDB gives
the *first* bare `TIMESTAMP NOT NULL` column in a table an
implicit `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
and every *subsequent* bare one an implicit zero-date default
`'0000-00-00 00:00:00'` — which `NO_ZERO_DATE` rejects.
`core_subscriptions` had three bare TIMESTAMP business dates
(`starts_at`, `expires_at`, `grace_ends_at`), so the second one
always failed on this configuration. MariaDB 10.11 defaults the
setting ON, which is why the existing MariaDB CI gate never saw
it. (Separately, the first-column behavior is a silent hazard:
updates would bump the column.)

**Fix.** Business dates the application always populates
explicitly are now `DATETIME` (non-null, no server default) in
fresh installs:

- `000011`: `core_subscriptions.starts_at/expires_at/grace_ends_at`,
  `core_subscription_periods.effective_starts_at/expires_at/grace_ends_at`
- `000013`: `core_invitations.expires_at` (a bare TIMESTAMP would
  have silently extended invitation expiry on every update)
- `000014`: `core_email_verification_challenges.expires_at` (same
  hazard for verification challenges)

The models already cast all of these as `datetime`,
`SubscriptionService`/`InvitationService`/`EmailVerificationService`
always set them explicitly, and the app runs in UTC — so DATETIME
is type- and semantics-compatible. Migration filenames/identities
are unchanged. Databases where these migrations **already ran**
(MySQL CI/production-like installs) keep their TIMESTAMP columns;
both types store the same UTC instants the services write and
compare, and nothing rewrites an applied schema. No strict mode
is relaxed anywhere.

**Audit of the remaining set.** Other bare `timestamp('…')`
columns either carry `useCurrent()` (explicit default) or are
single-per-table legacy Bale columns the legacy code always
writes explicitly (no 1067, implicit-default behavior unchanged
from their original design; not part of this incident). All
Core/C7-era tables are covered by the fix or already safe.

**Supported engines/modes after the fix.** MySQL ≥ 8.0.16
(unchanged), MariaDB 10.4–10.11 with
`explicit_defaults_for_timestamp` ON **or** OFF under strict
modes. Proven by three CI gates: MySQL, MariaDB 10.11, and the
new **MariaDB 10.4 legacy-mode gate**, which reproduces the
reported configuration (`SET GLOBAL
explicit_defaults_for_timestamp=OFF` + the reported `sql_mode`),
runs `migrate:fresh`, and asserts via
`SubscriptionSchemaEngineTest` that the business dates are
NOT NULL DATETIME with no server default and that an insert
without an explicit date fails closed.

**Resume locally (non-destructive).** The failing `CREATE TABLE`
is atomic — no `core_subscriptions` table or migration row was
left behind. Pull the fix and simply continue:

```powershell
cd backend
git pull
php artisan migrate:status   # 000011 shows Pending
php artisan migrate
```

Optional inspection before retrying (MariaDB client):

```sql
SELECT @@VERSION, @@GLOBAL.explicit_defaults_for_timestamp, @@GLOBAL.sql_mode;
SHOW TABLES LIKE 'core_subscription%';
SELECT migration FROM migrations WHERE migration LIKE '%000011%';  -- expect no row
```

If a `core_subscriptions` table *does* exist in a partial shape
(not producible by this failure), stop and inspect it — do not
drop it and do not run `migrate:fresh` on the `tadbir` database.
