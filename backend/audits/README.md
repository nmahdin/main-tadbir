# Opt-in access-control acceptance audit

These tests assert the **required secure behavior**, not the existing vulnerable behavior. They are outside normal PHPUnit discovery intentionally: this is an open security backlog, not a passing regression suite or a production patch. Promote each test into `tests/Feature` with its corresponding fix; do not invert its assertion just to get a green run.

Run only against an isolated test database. The test explicitly refuses anything other than testing + in-memory SQLite. It creates/deletes fixture records and never exercises the deployed host or real Bale.

```sh
cd backend
php vendor/bin/phpunit audits/AccessControlAuditTest.php --colors=never
```

Sandbox alternative (PHP WASM, not a production dependency):

```sh
/home/user/.local/php-test/node_modules/.bin/php-wasm-cli vendor/bin/phpunit audits/AccessControlAuditTest.php --colors=never
```

Baseline 2026-09-28: **16 tests, 16 assertions, 14 failures, 2 passing controls**. No errors. The failures demonstrate open authorization defects/policy gaps, including the previously agreed department-membership content rule. See `docs/security/access-control-review.md` for individual results and distinction between current observations and proposed policy.

This audit changes no production authorization code and does not claim exhaustive penetration testing, browser testing, MySQL concurrency testing or verification of deployed behavior.

## First implementation tranche — 2026-09-28

Production fixes now exist for A01/A02/A03/A07/A08/A09/A10/A11/A14. A15/A16 still pass. Rerun: **16 tests, 17 assertions, 5 failures** (A04/A05/A06/A12/A13), no errors. Corresponding regressions plus positive/negative variants are in `tests/Feature/AccessControlHardeningTest.php`. The historical baseline above is unchanged; see `docs/security/access-control-phase1.md` for implemented scope and deployment caveats. Passing the normal suite does not mean the remaining opt-in security backlog is closed.
