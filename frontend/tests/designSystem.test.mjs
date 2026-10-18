import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// DS-1/DS-2 design-system contract gates (source-level, same
// convention as the other frontend regression tests).

const css = readFileSync(new URL("../src/styles/index.css", import.meta.url), "utf8");
const primitives = readFileSync(new URL("../src/shared/ui/Primitives.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const showcase = readFileSync(new URL("../src/features/showcase/UiShowcaseThemeComparison.tsx", import.meta.url), "utf8");

test("token contract: brand color, 40px controls, 12px radius", () => {
  // Owner-approved canonical identity (#39677C from /theme-previews)
  // supersedes the DS-1 indigo brand value.
  assert.match(css, /--color-primary:\s*#39677c/);
  assert.match(css, /--control-height:\s*2\.5rem/);
  assert.match(css, /--radius-md:\s*\.75rem/);
  assert.match(css, /--color-danger:/);
  assert.match(css, /--color-success:/);
  assert.match(css, /--color-warning:/);
});

test("DS-1 primitives expose the consolidated component APIs", () => {
  for (const name of ["Button", "Input", "Textarea", "Checkbox", "FormField", "Modal", "Card", "Badge", "Table", "PageHeader", "EmptyState", "LoadingState", "ErrorState"]) {
    assert.match(primitives, new RegExp(`(function|const) ${name}\\b`), `missing primitive: ${name}`);
  }
  // DS-2.1: Select is implemented in ./Select and re-exported here.
  assert.match(primitives, /export \{ Select \} from '.\/Select'/, "Select re-exported from Primitives");
  assert.match(primitives, /size\?: 'sm' \| 'md' \| 'lg'/, "Button sizes");
  assert.match(primitives, /ui-button-\$\{size\}/);
  assert.match(primitives, /invalid\?: boolean/, "control invalid state");
});

test("primary design template route is public and lazy", () => {
  assert.match(app, /import\('\.\.\/features\/showcase\/UiShowcaseThemeComparison'\)/);
  assert.match(app, /path="\/theme-previews"/);
  assert.doesNotMatch(app, /path="\/_dev\/ui-showcase"/);
});

test("showcase uses fictional data only and performs no API calls", () => {
  assert.doesNotMatch(showcase, /api\/|fetch\(|XMLHttpRequest|useQuery|useAuth/);
  assert.match(showcase, /ساختگی/);
  assert.doesNotMatch(showcase, /useAuth|useQuery|XMLHttpRequest/);
});
