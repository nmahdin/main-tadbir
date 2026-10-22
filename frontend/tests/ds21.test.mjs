import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createToastRecord,
  defaultToastDuration,
  dismissToastFrom,
  enqueueToast,
} from "../src/shared/ui/notificationLogic.ts";
import {
  filterSelectOptions,
  firstEnabledIndex,
  moveActiveIndex,
  typeaheadIndex,
} from "../src/shared/ui/selectLogic.ts";
import {
  cycleSort,
  filterRows,
  initialDataTableState,
  pageSelectionState,
  paginateRows,
  sortRows,
  togglePageSelection,
  toggleSelection,
  toServerState,
  withFirstPage,
} from "../src/shared/ui/dataTableLogic.ts";

// DS-2.1 contract gates: button geometry, notification service,
// branded Select, DataTable — pure logic plus source-level checks
// (same convention as the other frontend regression tests).

const css = readFileSync(new URL("../src/styles/index.css", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/shared/ui/Notifications.tsx", import.meta.url), "utf8");
const selectSource = readFileSync(new URL("../src/shared/ui/Select.tsx", import.meta.url), "utf8");
const dataTable = readFileSync(new URL("../src/shared/ui/DataTable.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const showcase = readFileSync(new URL("../src/features/showcase/UiShowcaseThemeComparison.tsx", import.meta.url), "utf8");

test("DS-2.1 button tokens: 36px standard, 16px radius, controls stay 40px", () => {
  assert.match(css, /--button-height:\s*2\.25rem/);
  assert.match(css, /--button-height-sm:\s*2rem/);
  assert.match(css, /--button-height-lg:\s*2\.75rem/);
  assert.match(css, /--button-radius-rounded:\s*\.75rem/); // DS-2.2 amendment: rounded = 12px
  assert.match(css, /--control-height:\s*2\.5rem/);
  assert.match(css, /\.ui-button\s*\{[^}]*min-height:\s*var\(--button-height\)/);
});

test("toast lifetimes: success/info fade, warning lingers, errors persist", () => {
  assert.equal(defaultToastDuration("success"), 5000);
  assert.equal(defaultToastDuration("info"), 5000);
  assert.equal(defaultToastDuration("warning"), 8000);
  assert.equal(defaultToastDuration("error"), null);
});

test("toast queue dedupes identical notifications inside the window", () => {
  const first = createToastRecord({ kind: "error", title: "خطای نمونه" }, "t1", 1000);
  const dupe = createToastRecord({ kind: "error", title: "خطای نمونه" }, "t2", 2000);
  const later = createToastRecord({ kind: "error", title: "خطای نمونه" }, "t3", 9000);
  let result = enqueueToast([], first);
  assert.equal(result.suppressed, false);
  result = enqueueToast(result.toasts, dupe);
  assert.equal(result.suppressed, true);
  assert.equal(result.toasts.length, 1);
  result = enqueueToast(result.toasts, later);
  assert.equal(result.suppressed, false);
  assert.equal(result.toasts.length, 2);
  assert.equal(dismissToastFrom(result.toasts, "t3").length, 1);
});

test("toast stack is capped and evicts calm toasts before errors", () => {
  let toasts = [];
  for (let index = 0; index < 4; index += 1) {
    toasts = enqueueToast(toasts, createToastRecord({ kind: "info", title: `اطلاع ${index}` }, `i${index}`, index * 10000)).toasts;
  }
  toasts = enqueueToast(toasts, createToastRecord({ kind: "error", title: "خطای ماندگار" }, "e1", 50000)).toasts;
  toasts = enqueueToast(toasts, createToastRecord({ kind: "success", title: "موفقیت تازه" }, "s1", 60000)).toasts;
  assert.equal(toasts.length, 5);
  assert.ok(toasts.some(toast => toast.id === "e1"), "persistent error survives eviction");
  assert.ok(toasts.some(toast => toast.id === "s1"), "newest toast is kept");
});

test("notification service exposes the four kinds, provider and Alert", () => {
  for (const kind of ["success", "error", "warning", "info"]) {
    assert.match(notifications, new RegExp(`${kind}: \\(title: string`), `toast.${kind}`);
  }
  assert.match(notifications, /export function ToastProvider/);
  assert.match(notifications, /export function useToast/);
  assert.match(notifications, /export function Alert/);
  assert.match(notifications, /role=\{tone === 'error' \|\| tone === 'warning' \? 'alert' : 'status'\}/);
  assert.match(app, /<ToastProvider>/, "provider mounted once at the app root");
});

test("custom Select implements the listbox pattern with a native fallback", () => {
  assert.match(selectSource, /aria-haspopup="listbox"/);
  assert.match(selectSource, /role="listbox"/);
  assert.match(selectSource, /role="option"/);
  assert.match(selectSource, /aria-activedescendant/);
  assert.match(selectSource, /case 'Escape':/);
  assert.match(selectSource, /case 'ArrowDown':/);
  assert.match(selectSource, /aria-hidden="true"[\s\S]{0,200}tabIndex=\{-1\}/, "hidden native fallback keeps form submission working");
  assert.match(selectSource, /filterSelectOptions/, "searchable variant filters options");
});

test("select keyboard logic skips disabled options and wraps", () => {
  const options = [
    { value: "a", label: "آلفا" },
    { value: "b", label: "بتا", disabled: true },
    { value: "c", label: "گاما" },
  ];
  assert.equal(firstEnabledIndex(options), 0);
  assert.equal(moveActiveIndex(options, 0, 1), 2);
  assert.equal(moveActiveIndex(options, 2, 1), 0);
  assert.equal(moveActiveIndex(options, 0, -1), 2);
  assert.equal(typeaheadIndex(options, "گ", 0), 2);
  assert.deepEqual(filterSelectOptions(options, "بت").map(o => o.value), ["b"]);
  assert.equal(filterSelectOptions(options, " ").length, 3);
});

test("data table sort cycle: none -> asc -> desc -> none", () => {
  assert.deepEqual(cycleSort(null, "name"), { key: "name", direction: "asc" });
  assert.deepEqual(cycleSort({ key: "name", direction: "asc" }, "name"), { key: "name", direction: "desc" });
  assert.equal(cycleSort({ key: "name", direction: "desc" }, "name"), null);
  assert.deepEqual(cycleSort({ key: "name", direction: "desc" }, "owner"), { key: "owner", direction: "asc" });
});

test("data table client pipeline: search, filter, sort, paginate", () => {
  const rows = [
    { id: "1", name: "بتا", status: "active", progress: 30 },
    { id: "2", name: "آلفا", status: "paused", progress: 80 },
    { id: "3", name: "گاما", status: "active", progress: 55 },
    { id: "4", name: "دلتا", status: "active", progress: 10 },
  ];
  const filtered = filterRows(rows, { query: "", filters: { status: "active" } }, row => row.name, (row, key) => String(row[key]));
  assert.deepEqual(filtered.map(row => row.id), ["1", "3", "4"]);
  const searched = filterRows(rows, { query: "آلف", filters: {} }, row => row.name, (row, key) => String(row[key]));
  assert.deepEqual(searched.map(row => row.id), ["2"]);
  const sorted = sortRows(filtered, { key: "progress", direction: "desc" }, (row, key) => row[key]);
  assert.deepEqual(sorted.map(row => row.id), ["3", "1", "4"]);
  const page = paginateRows(sorted, 9, 2);
  assert.equal(page.page, 2);
  assert.equal(page.totalPages, 2);
  assert.deepEqual(page.pageRows.map(row => row.id), ["4"]);
});

test("data table selection and server contract", () => {
  let selected = toggleSelection(new Set(), "a");
  selected = toggleSelection(selected, "b");
  assert.equal(pageSelectionState(selected, ["a", "b"]), "all");
  assert.equal(pageSelectionState(selected, ["a", "c"]), "some");
  assert.equal(togglePageSelection(selected, ["a", "b"]).size, 0);
  const state = withFirstPage({ ...initialDataTableState(20), page: 4 }, { query: "x" });
  assert.equal(state.page, 1, "search resets to the first page");
  const server = toServerState({ ...initialDataTableState(20), page: 3 });
  assert.equal(server.offset, 40);
  assert.equal(server.pageSize, 20);
});

test("DataTable exposes client and server modes without new endpoints", () => {
  assert.match(dataTable, /mode = 'client'/);
  assert.match(dataTable, /mode === 'server'/);
  assert.match(dataTable, /onStateChange/);
  assert.doesNotMatch(dataTable, /fetch\(|request\(|api\//, "table never fetches tenant data itself");
  assert.match(dataTable, /aria-sort/);
});

test("showcase demonstrates DS-2.1 with fictional data only", () => {
  assert.match(showcase, /toast\.success/);
  assert.match(showcase, /toast\.error/);
  assert.match(showcase, /toast\.warning/);
  assert.match(showcase, /toast\.info/);
  assert.match(showcase, /<Alert tone="error"/);
  assert.match(showcase, /<DataTable/);
  assert.match(showcase, /mode="server"/);
  assert.match(showcase, /searchable/);
  assert.doesNotMatch(showcase, /api\/|fetch\(|XMLHttpRequest|useQuery|useAuth/);
});
