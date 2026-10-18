import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// DS-1/DS-2 design-system contract gates (source-level, same
// convention as the other frontend regression tests).

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const primitives = readFileSync(new URL("../src/components/common/Primitives.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const showcase = readFileSync(new URL("../src/features/showcase/UiShowcasePage.tsx", import.meta.url), "utf8");

test("token contract: brand color, 40px controls, 12px radius", () => {
  assert.match(css, /--color-primary:\s*#4f46e5/);
  assert.match(css, /--control-height:\s*2\.5rem/);
  assert.match(css, /--radius-md:\s*\.75rem/);
  assert.match(css, /--color-danger:/);
  assert.match(css, /--color-success:/);
  assert.match(css, /--color-warning:/);
});

test("DS-1 primitives expose the consolidated component APIs", () => {
  for (const name of ["Button", "Input", "Textarea", "Select", "Checkbox", "FormField", "Modal", "Card", "Badge", "Table", "PageHeader", "EmptyState", "LoadingState", "ErrorState"]) {
    assert.match(primitives, new RegExp(`(function|const) ${name}\\b`), `missing primitive: ${name}`);
  }
  assert.match(primitives, /size\?: 'sm' \| 'md' \| 'lg'/, "Button sizes");
  assert.match(primitives, /ui-button-\$\{size\}/);
  assert.match(primitives, /invalid\?: boolean/, "control invalid state");
});

test("showcase route is dev-only and lazy", () => {
  assert.match(app, /import\.meta\.env\.DEV \? React\.lazy\(\(\) => import\('\.\.\/features\/showcase\/UiShowcasePage'\)/);
  assert.match(app, /path="\/_dev\/ui-showcase"/);
});

test("showcase uses fictional data only and performs no API calls", () => {
  assert.doesNotMatch(showcase, /api\/|fetch\(|XMLHttpRequest|useQuery|useAuth/);
  assert.match(showcase, /ساختگی/);
  assert.doesNotMatch(showcase, /secret|password|token/i);
});
