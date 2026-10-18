import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// DS-2.2 additional refinements — contract gates (source-level,
// same convention as the other frontend regression tests; manual
// browser verification stays with the DS showcase baseline).

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const primitives = readFileSync(new URL("../src/components/common/Primitives.tsx", import.meta.url), "utf8");
const dataTable = readFileSync(new URL("../src/components/common/DataTable.tsx", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/components/common/Notifications.tsx", import.meta.url), "utf8");
const showcase = readFileSync(new URL("../src/features/showcase/UiShowcaseThemeComparison.tsx", import.meta.url), "utf8");

test("modal closes with a ~160ms exit animation instead of instant unmount", () => {
  assert.match(primitives, /reduced \? 0 : 160/, "exit wait skipped under reduced motion");
  assert.match(primitives, /ui-modal-exiting/, "exiting class drives the fade");
  assert.doesNotMatch(primitives, /if \(!open\) return null;/, "no immediate unmount");
  assert.match(css, /@keyframes ui-dialog-out/);
  assert.match(css, /\.ui-modal-exiting \.ui-modal \{ animation: ui-dialog-out \.16s ease-in both; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.ui-modal-exiting, \.ui-modal-exiting \.ui-modal \{ animation: none !important; \}/);
  // Focus handling still lives in the [open] effect (trap + restore).
  assert.match(primitives, /if \(previous\?\.isConnected\) previous\.focus\(\)/);
});

test("toasts anchor at the physical top-left with safe-area insets, borderless", () => {
  assert.match(css, /\.ui-toast-viewport \{ position: fixed; top: max\(1rem, env\(safe-area-inset-top\)\); left: max\(1rem, env\(safe-area-inset-left\)\);/);
  assert.doesNotMatch(css, /\.ui-toast-viewport \{[^}]*inset-inline-start/, "not logical-start (would flip in RTL)");
  assert.match(css, /\.ui-toast \{[^}]*border: 0;/);
  assert.match(css, /\.ui-alert \{[^}]*border: 0;/);
  assert.match(css, /\.ui-toast-error \{[^}]*background: color-mix\(in srgb, var\(--color-danger\)/);
  assert.match(notifications, /className="ui-toast-viewport"/);
  assert.match(notifications, /case 'error':\s*\n\s*return null|durationMs === null/, "errors persist (checked in logic tests)");
});

test("Radio/RadioGroup use native radios: group semantics, arrows, form names", () => {
  assert.match(primitives, /export function Radio\(/);
  assert.match(primitives, /export function RadioGroup\(/);
  assert.match(primitives, /type="radio"/);
  assert.match(primitives, /role="radiogroup"/);
  assert.match(primitives, /aria-invalid=\{error \? true : undefined\}/);
  assert.match(primitives, /RadioGroupContext/, "options inherit the group name/value");
});

test("SearchInput puts the icon on the physical left with matching padding", () => {
  assert.match(primitives, /export function SearchInput\(/);
  assert.match(primitives, /absolute left-3 top-1\/2/, "physical left icon");
  assert.match(primitives, /ui-input pl-10/, "left padding clears the icon");
  assert.match(primitives, /aria-label="پاک‌کردن جست‌وجو"/, "clear action");
  assert.match(dataTable, /<SearchInput/, "DataTable search uses the shared component");
});

test("DataTable hover is a subtle tint distinct from persistent selection", () => {
  assert.match(css, /\.ui-data-table tbody tr:hover \{ background: color-mix\(in srgb, var\(--color-primary\) 3\.5%, white\); \}/);
  assert.match(css, /\.ui-data-table tbody tr\[data-selected='true'\] \{ background: color-mix\(in srgb, var\(--color-primary\) 7%, white\); \}/);
  assert.match(css, /\.ui-data-table tbody tr\[data-selected='true'\]:hover \{ background: color-mix\(in srgb, var\(--color-primary\) 9%, white\); \}/);
});

test("active tab uses a brand-colored surface with white text", () => {
  assert.match(css, /\.ui-tab\[aria-selected='true'\] \{ background: var\(--color-primary\); color: #fff;/);
  assert.match(css, /\.ui-tab:disabled/);
});

test("FullPageLoader: brand surface, status role, reduced-motion safe", () => {
  assert.match(primitives, /export function FullPageLoader\(/);
  assert.match(primitives, /ui-fullpage-loader-surface/);
  assert.match(css, /\.ui-fullpage-loader-surface \{[^}]*background: color-mix\(in srgb, var\(--color-primary\) 9%, white\)/);
  assert.match(css, /\.ui-fullpage-loader-surface svg \{ animation: none !important; \}/);
});

test("colored icon buttons extend the canonical Button with semantic tones", () => {
  assert.match(primitives, /tone\?: 'primary' \| 'success' \| 'danger' \| 'warning' \| 'neutral'/);
  for (const tone of ["primary", "success", "danger", "warning", "neutral"]) {
    assert.match(css, new RegExp(`\\.ui-button-tone-${tone}:hover:not\\(:disabled\\)`), `tone hover: ${tone}`);
  }
  assert.match(css, /\.ui-button \{[^}]*gap: var\(--button-gap\)/, "8px icon gap via token");
  assert.match(css, /--button-gap:\s*\.5rem/);
  assert.match(css, /\.ui-button:active:not\(:disabled\)[^{]*\{ transform: scale\(\.97\) !important; \}/, "press animation retained");
});

test("showcase demonstrates every refinement with fictional data", () => {
  for (const marker of ["<RadioGroup", "<SearchInput", "<FullPageLoader", 'tone="success"', 'tone="danger"']) {
    assert.match(showcase, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `showcase marker: ${marker}`);
  }
  assert.doesNotMatch(showcase, /api\/|fetch\(|XMLHttpRequest|useQuery|useAuth/);
});
