import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  draftFromItem,
  editorKindFor,
  formatValue,
  inheritanceLabel,
  operationLabel,
  optionsFor,
  parseDraft,
  settingErrorMessage,
  sourceLabel,
  workspaceOverrideAllowed,
} from "../src/features/settings/scopedSettingsLogic.ts";

// Stage C7-4 contract gates: pure presentation logic plus
// source-level safety checks (no secret reads, no browser
// storage for secret drafts, DS-only wiring).

const api = readFileSync(new URL("../src/features/settings/scopedSettingsApi.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/features/settings/components/ScopedSettingsPage.tsx", import.meta.url), "utf8");
const row = readFileSync(new URL("../src/features/settings/components/SettingRow.tsx", import.meta.url), "utf8");
const secrets = readFileSync(new URL("../src/features/settings/components/SecretsSection.tsx", import.meta.url), "utf8");
const history = readFileSync(new URL("../src/features/settings/components/HistoryDrawer.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/layout/Sidebar.tsx", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");

function item(overrides = {}) {
  return {
    definition: {
      key: "display.locale",
      title: "Default interface locale",
      description: null,
      type: "locale",
      default: "fa",
      allowed_scopes: ["organization", "workspace"],
      inheritance: "organization_to_workspace",
      workspace_override: true,
      user_override: false,
      nullable: false,
      sensitivity: "internal",
      owner: "core",
      values: ["fa", "en"],
      ...(overrides.definition ?? {}),
    },
    effective: { value: "fa", source: "default", source_owner_type: null, source_owner_id: null, legacy: false, has_explicit_value: false, ...(overrides.effective ?? {}) },
    explicit: { exists: false, value: null, version: null, ...(overrides.explicit ?? {}) },
    override_policy: { allow: false, version: null, explicit: false, ...(overrides.override_policy ?? {}) },
  };
}

test("editor kinds follow definition type and allowed values", () => {
  assert.equal(editorKindFor("locale", ["fa", "en"]), "select");
  assert.equal(editorKindFor("timezone", null), "select");
  assert.equal(editorKindFor("enum", null), "select");
  assert.equal(editorKindFor("boolean", null), "boolean");
  assert.equal(editorKindFor("integer", null), "number");
  assert.equal(editorKindFor("json", null), "json");
  assert.equal(editorKindFor("string", null), "text");
  assert.equal(editorKindFor("string", ["a", "b"]), "select");
});

test("timezone options always contain the current effective value", () => {
  const custom = item({ definition: { type: "timezone", values: null }, effective: { value: "Asia/Qostanay" } });
  assert.equal(optionsFor(custom)[0], "Asia/Qostanay");
  const known = item({ definition: { type: "timezone", values: null }, effective: { value: "Asia/Tehran" } });
  assert.ok(optionsFor(known).includes("Asia/Tehran"));
  assert.deepEqual(optionsFor(item()), ["fa", "en"]);
});

test("inheritance labels: workspace without explicit value explains its source", () => {
  assert.equal(
    inheritanceLabel(item({ effective: { source: "organization", value: "en" } }), "workspace"),
    "به ارث رسیده از سازمان",
  );
  assert.equal(
    inheritanceLabel(item({ effective: { source: "default" } }), "workspace"),
    "مقدار پیش‌فرض پلتفرم",
  );
  assert.equal(
    inheritanceLabel(item({ explicit: { exists: true, value: "fa", version: 1 } }), "workspace"),
    null,
  );
  assert.equal(inheritanceLabel(item(), "organization"), null);
});

test("workspace override availability follows explicit organization policy", () => {
  assert.equal(workspaceOverrideAllowed(item({ override_policy: { allow: false, explicit: true } })), false);
  assert.equal(workspaceOverrideAllowed(item({ override_policy: { allow: true, explicit: true } })), true);
  assert.equal(
    workspaceOverrideAllowed(item({ definition: { workspace_override: false }, override_policy: null })),
    false,
  );
});

test("draft parsing: explicit null is distinct from invalid drafts", () => {
  const nullable = item({ definition: { type: "string", values: null, nullable: true } });
  assert.deepEqual(parseDraft(nullable, "   "), { ok: true, value: null });
  const required = item({ definition: { type: "string", values: null, nullable: false } });
  assert.equal(parseDraft(required, "").ok, false);
  const integer = item({ definition: { type: "integer", values: null } });
  assert.deepEqual(parseDraft(integer, "42"), { ok: true, value: 42 });
  assert.equal(parseDraft(integer, "4.5").ok, false);
  const json = item({ definition: { type: "json", values: null } });
  assert.deepEqual(parseDraft(json, '{"a":1}'), { ok: true, value: { a: 1 } });
  assert.equal(parseDraft(json, "{nope").ok, false);
});

test("drafts start from the explicit value when one exists", () => {
  assert.equal(draftFromItem(item({ explicit: { exists: true, value: "en", version: 2 }, effective: { value: "en" } })), "en");
  assert.equal(draftFromItem(item({ effective: { value: "fa" } })), "fa");
  assert.equal(draftFromItem(item({ definition: { nullable: true }, effective: { value: null } })), "");
});

test("stable error copy never depends on submitted values", () => {
  assert.match(settingErrorMessage("setting_version_conflict", 409), /هم‌زمان/);
  assert.match(settingErrorMessage("setting_override_denied", 409), /سازمان اجازه/);
  assert.match(settingErrorMessage("setting_forbidden", 403), /مجوز/);
  assert.match(settingErrorMessage("setting_module_disabled", 409), /ماژول/);
  assert.equal(settingErrorMessage("totally_new_code", 500), "خطایی رخ داد. دوباره تلاش کنید.");
  assert.equal(formatValue(true), "بله");
  assert.equal(formatValue(null), "—");
  assert.equal(sourceLabel("organization"), "سازمان");
  assert.equal(operationLabel("restore"), "بازگردانی");
});

test("API client surface: scoped routes only, write-only secrets, no generic owners", () => {
  assert.ok(api.includes("/settings/${key}"));
  assert.ok(api.includes("/secrets/${key}"));
  // Scope ids travel only in fixed route segments — never as a
  // caller-chosen owner_type/owner_id request field. (The
  // source_owner_* response metadata is server-derived.)
  assert.ok(!api.includes("owner_type="), "no generic owner-type parameters");
  assert.ok(!/body:\s*\{[^}]*owner/.test(api), "no owner fields in request bodies");
  // Secret values are only ever PUT; no function reads a secret value.
  assert.ok(!/secrets\/\$\{key\}[^)]*method: 'GET'/.test(api));
  assert.ok(!api.includes("reveal"));
  for (const verb of ["putOrganizationSecret", "revokeOrganizationSecret", "putWorkspaceSecret", "revokeWorkspaceSecret"]) {
    assert.ok(api.includes(verb), verb);
  }
});

test("secrets UI: password-style write-only field, no persistence, metadata only", () => {
  assert.ok(secrets.includes('type="password"'));
  assert.ok(secrets.includes('autoComplete="new-password"'));
  assert.ok(secrets.includes("پیکربندی شده"));
  for (const source of [api, page, row, secrets, history]) {
    assert.ok(!source.includes("localStorage"), "no browser storage in settings feature");
    assert.ok(!source.includes("sessionStorage"), "no browser storage in settings feature");
  }
  assert.ok(!secrets.includes("secret.value"), "server metadata never contains a readable value field");
});

test("wiring: dedicated ActiveView, sidebar entry, tabs, drawer, confirm dialogs", () => {
  assert.ok(types.includes("'scoped-settings'"));
  assert.ok(app.includes("case 'scoped-settings':"));
  assert.ok(app.includes("ScopedSettingsPage"));
  assert.ok(sidebar.includes("nav-item-scoped-settings"));
  assert.ok(sidebar.includes("handleNavClick('scoped-settings')"));
  assert.ok(page.includes("<Tabs"));
  assert.ok(page.includes("SecretsSection"));
  assert.ok(history.includes("<Drawer"));
  assert.ok(history.includes("ConfirmDialog"));
  assert.ok(secrets.includes("ConfirmDialog"));
  // Restore is a restore mutation, never an in-place edit.
  assert.ok(api.includes("/history/${revisionId}/restore"));
});
