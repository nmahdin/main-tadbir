import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Permission-catalog parity gate (Stage 02, ADR-0004 §6).
// The backend PermissionSeeder is canonical; the frontend catalog mirrors it
// by hand today. This test fails when the two drift beyond the documented
// backend-only allowlist, instead of letting drift accumulate silently.

// At Stage 02 the catalogs are in exact parity (78 keys). Any future
// intentional backend-only key must be added here with a reason; the second
// test below keeps this list honest in both directions.
const BACKEND_ONLY = new Set([]);

const seeder = readFileSync(new URL("../../backend/database/seeders/PermissionSeeder.php", import.meta.url), "utf8");
const backendKeys = new Set([...seeder.matchAll(/\['key' => '([a-z_]+(?:\.[a-z_]+)+)'/g)].map((m) => m[1]));

const catalog = readFileSync(new URL("../src/shared/config/permissions.ts", import.meta.url), "utf8");
const frontendKeys = new Set([...catalog.matchAll(/\bid:\s*["']([a-z_]+(?:\.[a-z_]+)+)["']/g)].map((m) => m[1]));

test("frontend permission catalog matches the backend seeder (minus documented backend-only keys)", () => {
  assert.ok(backendKeys.size > 0, "backend permission keys could not be parsed");
  assert.ok(frontendKeys.size > 0, "frontend permission keys could not be parsed");

  const missingInFrontend = [...backendKeys].filter((k) => !frontendKeys.has(k) && !BACKEND_ONLY.has(k)).sort();
  const missingInBackend = [...frontendKeys].filter((k) => !backendKeys.has(k)).sort();

  assert.deepEqual(missingInFrontend, [], `permissions seeded but absent from frontend catalog: ${missingInFrontend.join(", ")}`);
  assert.deepEqual(missingInBackend, [], `permissions in frontend catalog but not seeded: ${missingInBackend.join(", ")}`);
});

test("backend-only permission allowlist stays honest", () => {
  for (const key of BACKEND_ONLY) {
    assert.ok(backendKeys.has(key), `allowlisted backend-only key no longer exists in seeder: ${key}`);
    assert.ok(!frontendKeys.has(key), `allowlisted backend-only key appeared in frontend catalog; remove it from BACKEND_ONLY: ${key}`);
  }
});
