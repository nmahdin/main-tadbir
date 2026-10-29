import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  addDaysISO,
  applyRangeSelection,
  compareISO,
  daysInViewMonth,
  formatISODate,
  isDateDisabled,
  isValidISODate,
  monthCells,
  partsFromISO,
  shiftView,
  viewOfISO,
} from "../src/shared/ui/datePickerLogic.ts";
import { gregorianToJalali, jalaliToGregorian } from "../src/shared/lib/jalali.ts";

// DS-2.3 contract gates: date logic (pure) plus component-level
// source checks, same convention as earlier DS test files.

const primitives = readFileSync(new URL("../src/shared/ui/Primitives.tsx", import.meta.url), "utf8");
const datePicker = readFileSync(new URL("../src/shared/ui/DatePicker.tsx", import.meta.url), "utf8");
const overlays = readFileSync(new URL("../src/shared/ui/Overlays.tsx", import.meta.url), "utf8");
const showcase = readFileSync(new URL("../src/features/showcase/UiShowcaseThemeComparison.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/index.css", import.meta.url), "utf8");

test("ISO plumbing: parse, validate, compare, add days across boundaries", () => {
  assert.deepEqual(partsFromISO("2026-03-21"), { year: 2026, month: 3, day: 21 });
  assert.equal(partsFromISO("2026-3-21"), null);
  assert.equal(isValidISODate("2026-02-29"), false, "2026 is not a leap year");
  assert.equal(isValidISODate("2024-02-29"), true, "2024 is a leap year");
  assert.equal(isValidISODate("2026-13-01"), false);
  assert.ok(compareISO("2026-03-21", "2026-03-22") < 0);
  assert.equal(compareISO("2026-03-21", "2026-03-21"), 0);
  // Timezone-boundary safety: pure UTC arithmetic, no local drift.
  assert.equal(addDaysISO("2026-01-01", -1), "2025-12-31");
  assert.equal(addDaysISO("2025-12-31", 1), "2026-01-01");
  assert.equal(addDaysISO("2026-03-20", 1), "2026-03-21", "Jalali new-year boundary day");
  assert.equal(addDaysISO("2024-02-28", 1), "2024-02-29");
  assert.equal(addDaysISO("2026-03-21", 7), "2026-03-28");
});

test("Jalali conversion is delegated to the tested jalali utils", () => {
  // 1 Farvardin 1405 == 2026-03-21 (known anchor from jalali tests).
  assert.deepEqual(gregorianToJalali(2026, 3, 21), { jy: 1405, jm: 1, jd: 1 });
  assert.deepEqual(jalaliToGregorian(1405, 1, 1), { gy: 2026, gm: 3, gd: 21 });
  assert.deepEqual(viewOfISO("2026-03-21", "jalali"), { year: 1405, month: 1 });
  assert.deepEqual(viewOfISO("2026-03-21", "gregorian"), { year: 2026, month: 3 });
  assert.match(formatISODate("2026-03-21", "jalali"), /فروردین/);
  assert.equal(formatISODate("2026-03-21", "gregorian"), "21 March 2026");
  assert.equal(daysInViewMonth({ year: 1405, month: 1 }, "jalali"), 31);
  assert.equal(daysInViewMonth({ year: 1405, month: 12 }, "jalali"), 29, "1405 is not a Jalali leap year");
  assert.equal(daysInViewMonth({ year: 2024, month: 2 }, "gregorian"), 29);
});

test("month grid: 42 Saturday-first cells, current month flagged", () => {
  const cells = monthCells({ year: 1405, month: 1 }, "jalali");
  assert.equal(cells.length, 42);
  const first = cells.find(cell => cell.inCurrentMonth);
  assert.equal(first.iso, "2026-03-21", "Farvardin 1 is the first in-month cell");
  assert.equal(first.day, 1);
  // 2026-03-21 was a Saturday -> no leading outside cells this month.
  assert.equal(cells[0].iso, "2026-03-21");
  assert.equal(cells.filter(cell => cell.inCurrentMonth).length, 31);
  const gregorian = monthCells({ year: 2026, month: 3 }, "gregorian");
  assert.equal(gregorian.filter(cell => cell.inCurrentMonth).length, 31);
  assert.equal(gregorian.find(cell => cell.inCurrentMonth).iso, "2026-03-01");
  assert.deepEqual(shiftView({ year: 1405, month: 12 }, 1), { year: 1406, month: 1 });
  assert.deepEqual(shiftView({ year: 1405, month: 1 }, -1), { year: 1404, month: 12 });
});

test("constraints: min/max and disabled dates", () => {
  const constraints = { min: "2026-03-21", max: "2026-04-20", disabledDates: ["2026-03-25"] };
  assert.equal(isDateDisabled("2026-03-20", constraints), true);
  assert.equal(isDateDisabled("2026-03-21", constraints), false);
  assert.equal(isDateDisabled("2026-03-25", constraints), true);
  assert.equal(isDateDisabled("2026-04-20", constraints), false);
  assert.equal(isDateDisabled("2026-04-21", constraints), true);
  assert.equal(isDateDisabled("2026-03-25", { disabledDates: new Set(["2026-03-25"]) }), true);
  assert.equal(isDateDisabled("2026-03-25", {}), false);
});

test("range selection state machine: set, complete, swap, restart", () => {
  let range = applyRangeSelection({ start: "", end: "" }, "2026-04-10");
  assert.deepEqual(range, { start: "2026-04-10", end: "" });
  range = applyRangeSelection(range, "2026-04-15");
  assert.deepEqual(range, { start: "2026-04-10", end: "2026-04-15" });
  // Earlier second click swaps instead of producing an invalid range.
  let swapped = applyRangeSelection({ start: "2026-04-10", end: "" }, "2026-04-05");
  assert.deepEqual(swapped, { start: "2026-04-05", end: "2026-04-10" });
  // Clicking after a complete range starts over.
  swapped = applyRangeSelection(swapped, "2026-05-01");
  assert.deepEqual(swapped, { start: "2026-05-01", end: "" });
});

test("DatePicker contract: ISO-only values, keyboard grid, real disabled days", () => {
  assert.match(datePicker, /selection\?: 'single' \| 'range'/);
  assert.match(datePicker, /calendar\?: CalendarKind/);
  assert.match(datePicker, /aria-haspopup="dialog"/);
  assert.match(datePicker, /event\.key === forward/);
  assert.match(datePicker, /event\.key === 'PageDown'/);
  assert.match(datePicker, /event\.key === 'Escape'\) \{ event\.preventDefault\(\); closePopup\(true\); \}/);
  assert.match(datePicker, /disabled=\{cellDisabled\}/, "disabled dates are real disabled buttons");
  assert.match(datePicker, /aria-pressed=\{isSelected/);
  assert.match(datePicker, /aria-current=\{cell\.iso === today \? 'date'/);
  assert.match(datePicker, /data-iso=\{cell\.iso\}/, "focus is moved to the focused day button");
  assert.doesNotMatch(datePicker, /T\d{2}:\d{2}/, "date-only semantics: no time component anywhere");
});

test("overlays: menu/popover keyboard + dismissal, tooltip via description", () => {
  assert.match(overlays, /role="menu"/);
  assert.match(overlays, /role="menuitem"/);
  assert.match(overlays, /aria-haspopup="dialog"/, "popover trigger");
  assert.match(overlays, /role="dialog"/, "popover panel");
  assert.match(overlays, /event\.key === 'Escape'\) \{ event\.preventDefault\(\); close\(true\); \}/);
  assert.match(overlays, /role="tooltip"/);
  assert.match(overlays, /'aria-describedby': tooltipId/, "tooltip is announced, not hover-only pixels");
});

test("Drawer reuses Modal accessibility (no duplicated trap logic)", () => {
  assert.match(primitives, /export const Drawer = \(props: React\.ComponentProps<typeof Modal>\) => <Modal \{\.\.\.props\} drawer \/>/);
});

test("EmptyState variants carry distinct semantics (error is an alert)", () => {
  assert.match(primitives, /variant\?: EmptyStateVariant/);
  assert.match(primitives, /role=\{variant === 'error' \? 'alert' : 'status'\}/);
  assert.match(primitives, /'no-permission':/);
});

test("FormField wires help/error text into the control", () => {
  assert.match(primitives, /helpText\?: string/);
  assert.match(primitives, /'aria-describedby':/);
  assert.match(primitives, /\)\.props\.invalid \?\? \(error \? true : undefined\)/);
});

test("DS-2.3 styles resolve through tokens and respect reduced motion", () => {
  assert.match(css, /\.ui-calendar-day-selected \{ background: var\(--color-primary\)/);
  assert.match(css, /\.ui-menu-item-danger \{ color: var\(--color-danger\); \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.ui-calendar-day, \.ui-menu-item \{ transition: none !important; \}/);
});

test("showcase presents all six DS-2.3 groups with fictional data", () => {
  for (const marker of ["<DatePicker", "<DropdownMenu", "<Popover", "<Tooltip", "<Drawer", 'variant="no-results"', 'variant="no-permission"', 'variant="error"', 'variant="first-use"']) {
    assert.ok(showcase.includes(marker), `showcase marker: ${marker}`);
  }
  assert.doesNotMatch(showcase, /api\/|fetch\(|XMLHttpRequest|useQuery|useAuth/);
});
