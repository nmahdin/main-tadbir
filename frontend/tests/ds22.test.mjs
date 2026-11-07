import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// DS-2.2 contract gates: refined buttons, Tabs, Badge sizes,
// loading patterns and the motion rules (source-level, same
// convention as the other frontend regression tests).

const css = readFileSync(new URL("../src/styles/index.css", import.meta.url), "utf8");
const primitives = readFileSync(new URL("../src/shared/ui/Primitives.tsx", import.meta.url), "utf8");
const showcase = readFileSync(new URL("../src/features/showcase/UiShowcaseThemeComparison.tsx", import.meta.url), "utf8");

test("buttons: 36px, soft shadow, pressed inset (shapes covered by amendment tests)", () => {
  assert.match(css, /--button-height:\s*2\.25rem/);
  assert.match(css, /--button-shadow:\s*0 1px 3px rgb\(15 23 42 \/ \.035\)/);
  assert.match(css, /--button-shadow-active:\s*inset 0 1px 2px/);
  assert.match(css, /\.ui-button:active:not\(:disabled\) \{ box-shadow: var\(--button-shadow-active\) !important; \}/);
  assert.match(css, /\.ui-button-ghost \{ box-shadow: none !important; \}/, "ghost stays flat");
});

test("motion is light and honors prefers-reduced-motion", () => {
  assert.match(css, /@keyframes ui-fade-slide/);
  assert.match(css, /@keyframes ui-dialog-in/);
  assert.match(css, /\.ui-motion-enter \{ animation: ui-fade-slide var\(--motion-duration\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.ui-motion-enter, \.ui-toast, \.ui-modal \{ animation: none !important; \}/);
  assert.match(css, /\.ui-collapse \{ display: grid; grid-template-rows: 0fr; transition: grid-template-rows var\(--motion-duration\)/);
});

test("Tabs implements the ARIA tabs pattern without a nav framework", () => {
  assert.match(primitives, /export function Tabs/);
  assert.match(primitives, /role="tablist"/);
  assert.match(primitives, /role="tab"/);
  assert.match(primitives, /role="tabpanel"/);
  assert.match(primitives, /aria-selected=\{selected\}/);
  assert.match(primitives, /tabIndex=\{selected \? 0 : -1\}/, "roving tabindex");
  assert.match(primitives, /document\.dir === 'rtl'/, "RTL-aware arrow keys");
  assert.match(css, /\.ui-tabs \{[^}]*overflow-x: auto/, "scrollable overflow strip");
  assert.match(css, /\.ui-tab\[aria-selected='true'\]/);
  assert.match(css, /\.ui-tab:disabled/);
});

test("Badge exposes xs/sm/md sizes and status/count usage", () => {
  assert.match(primitives, /size\?: BadgeSize/);
  assert.match(primitives, /usage\?: 'status' \| 'count'/);
  for (const size of ["xs", "sm", "md"]) assert.match(css, new RegExp(`\\.ui-badge-${size} \\{`), `badge size ${size}`);
  assert.match(css, /\.ui-badge-count \{[^}]*tabular-nums/);
});

test("shared loading patterns cover page, section, card, table, inline", () => {
  for (const name of ["PageLoadingState", "CardSkeleton", "TableSkeleton", "InlineLoading", "LoadingState"]) {
    assert.match(primitives, new RegExp(`(function|const) ${name}\\b`), `missing pattern: ${name}`);
  }
});

test("showcase presents tabs, badges, card patterns, loading and motion", () => {
  assert.match(showcase, /<Tabs/);
  assert.match(showcase, /usage="count"/);
  assert.match(showcase, /کارت آماری/);
  assert.match(showcase, /کارت نیازمند اقدام/);
  assert.match(showcase, /<CardSkeleton \/>/);
  assert.match(showcase, /<TableSkeleton/);
  assert.match(showcase, /ui-motion-enter/);
  assert.match(showcase, /ui-collapse/);
  assert.doesNotMatch(showcase, /api\/|fetch\(|XMLHttpRequest|useQuery|useAuth/);
});
