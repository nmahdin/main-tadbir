import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// DS-2.2 amendment — final Button design contract gates.
// The frontend harness is source/logic-level (no browser tooling by
// design); mouse/keyboard/press behavior is pinned here at the
// component/CSS contract level and exercised manually in the
// showcase, exactly like the DS-2 manual baseline.

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const primitives = readFileSync(new URL("../src/components/common/Primitives.tsx", import.meta.url), "utf8");
const showcase = readFileSync(new URL("../src/features/showcase/UiShowcaseThemeComparison.tsx", import.meta.url), "utf8");

test("exactly two named shapes via tokens; rounded is the default", () => {
  assert.match(css, /--button-radius-rounded:\s*\.75rem/, "rounded = 12px");
  assert.match(css, /--button-radius-pill:\s*9999px/, "pill = capsule");
  assert.match(css, /\.ui-button-rounded \{ border-radius: var\(--button-radius-rounded\); \}/);
  assert.match(css, /\.ui-button-pill \{ border-radius: var\(--button-radius-pill\); \}/);
  assert.match(primitives, /export type ButtonShape = 'pill' \| 'rounded'/);
  assert.match(primitives, /shape = 'rounded'/, "default shape is rounded for backward compatibility");
  assert.match(primitives, /ui-button-\$\{shape\}/);
  assert.match(primitives, /data-button-shape=\{shape\}/);
});

test("final shadow token is the specified single soft shadow", () => {
  assert.match(css, /--button-shadow:\s*0 1px 3px rgb\(15 23 42 \/ \.035\);/);
  assert.match(css, /\.ui-button \{[^}]*box-shadow: var\(--button-shadow\) !important;/);
});

test("press feedback: 0.97 scale, ~120ms, active controls only", () => {
  assert.match(css, /transform \.12s ease/, "120ms transform transition on buttons");
  assert.match(css, /\.ui-button:active:not\(:disabled\)[^{]*\{ transform: scale\(\.97\) !important; \}/);
  assert.match(primitives, /disabled=\{disabled \|\| loading\}/, "loading disables the control, so it cannot animate as active");
  assert.match(primitives, /aria-busy=\{loading \|\| undefined\}/);
});

test("reduced motion removes movement but keeps visible feedback", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\/\* Movement off; visible feedback remains via color \+ inset shadow\. \*\/\s*\n\s*\.ui-button:active:not\(:disabled\), \.ui-tab:active:not\(:disabled\) \{ transform: none !important; \}/);
  assert.match(css, /\.ui-button:active:not\(:disabled\) \{ box-shadow: var\(--button-shadow-active\) !important; \}/, "inset pressed shadow still signals activation");
});

test("focus and keyboard activation stay native and visible", () => {
  assert.match(primitives, /<button type="button" \{\.\.\.props\}/, "real <button>: Space/Enter activation and focus are native");
  assert.match(css, /\.ui-button:focus-visible, \.ui-input:focus-visible \{ outline: 2px solid var\(--color-primary\); outline-offset: 2px; \}/);
  assert.match(css, /button:disabled \{ cursor: not-allowed; opacity: \.55; \}/);
});

test("one canonical Button API; no competing button component", () => {
  const definitions = primitives.match(/export function Button\(/g) ?? [];
  assert.equal(definitions.length, 1);
  assert.match(primitives, /export function IconButton/, "icon button composes the same Button");
});

test("showcase demonstrates both shapes, variants, icons and press feedback", () => {
  assert.match(showcase, /shape="pill"/);
  assert.match(showcase, /شکل rounded:/);
  assert.match(showcase, /شکل pill:/);
  assert.match(showcase, /prefers-reduced-motion/);
  assert.doesNotMatch(showcase, /api\/|fetch\(|XMLHttpRequest|useQuery|useAuth/);
});
