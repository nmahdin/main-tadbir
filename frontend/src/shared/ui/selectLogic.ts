/**
 * DS-2.1 custom Select — pure interaction logic (unit-testable).
 *
 * The branded dropdown in Select.tsx implements the WAI-ARIA listbox
 * pattern with aria-activedescendant: DOM focus stays on the trigger
 * (or the search field in the searchable variant) while the active
 * option is tracked here. Keeping the navigation math pure means the
 * keyboard contract is tested without a browser.
 */

export interface SelectOptionItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export function enabledOptions(options: readonly SelectOptionItem[]): SelectOptionItem[] {
  return options.filter(option => !option.disabled);
}

/** Index of the first enabled option at/after `start`, wrapping. */
export function firstEnabledIndex(options: readonly SelectOptionItem[], start = 0): number {
  for (let offset = 0; offset < options.length; offset += 1) {
    const index = (start + offset) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}

export function lastEnabledIndex(options: readonly SelectOptionItem[]): number {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index].disabled) return index;
  }
  return -1;
}

/**
 * Move the active option by `delta` (+1/-1), skipping disabled
 * options and wrapping at both ends. Returns -1 when nothing is
 * selectable.
 */
export function moveActiveIndex(options: readonly SelectOptionItem[], current: number, delta: 1 | -1): number {
  if (options.length === 0) return -1;
  let index = current;
  for (let step = 0; step < options.length; step += 1) {
    index = (index + delta + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}

/**
 * Type-ahead: find the next enabled option whose label starts with
 * the accumulated query (case-insensitive, Unicode-aware via
 * toLocaleLowerCase), searching after `current` and wrapping.
 */
export function typeaheadIndex(options: readonly SelectOptionItem[], query: string, current: number): number {
  if (!query) return current;
  const needle = query.toLocaleLowerCase();
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (current + offset) % options.length;
    const option = options[index];
    if (!option.disabled && option.label.toLocaleLowerCase().startsWith(needle)) return index;
  }
  return current;
}

/** Searchable variant: substring filter over labels (and values). */
export function filterSelectOptions(options: readonly SelectOptionItem[], query: string): SelectOptionItem[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...options];
  return options.filter(
    option => option.label.toLocaleLowerCase().includes(needle) || option.value.toLocaleLowerCase().includes(needle),
  );
}

export function indexOfValue(options: readonly SelectOptionItem[], value: string): number {
  return options.findIndex(option => option.value === value);
}
