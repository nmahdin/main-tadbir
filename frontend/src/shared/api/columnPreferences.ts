/**
 * UX-02-3-FINAL pure helpers for the v2 list-column preference shape
 * ({ hidden, order } per module). Kept free of API/client imports so
 * they are unit-testable and reusable by any list surface; the API
 * client lives in ./preferences and re-exports these.
 */
export interface ModuleColumnPreference {
  hidden: string[];
  order: string[];
}

const stringsOnly = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((entry): entry is string => typeof entry === 'string')
  : [];

/** Normalize one module entry from either the v1 or v2 shape. */
export function normalizeModuleColumnPreference(raw: unknown): ModuleColumnPreference {
  if (Array.isArray(raw)) return { hidden: stringsOnly(raw), order: [] };
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    return { hidden: stringsOnly(record.hidden), order: stringsOnly(record.order) };
  }
  return { hidden: [], order: [] };
}

/**
 * Apply a persisted order to column definitions: mandatory columns
 * keep their anchored positions (title first, actions last in the
 * list tables); the free columns follow `order`, unknown keys are
 * dropped, and unlisted columns keep their default relative order.
 */
export function applyColumnOrder<T extends { key: string; mandatory?: boolean }>(definitions: T[], order: string[]): T[] {
  const free = definitions.filter(definition => !definition.mandatory);
  const byKey = new Map(free.map(definition => [definition.key, definition]));
  const ordered: T[] = [];
  for (const key of order) {
    const definition = byKey.get(key);
    if (definition) {
      ordered.push(definition);
      byKey.delete(key);
    }
  }
  ordered.push(...free.filter(definition => byKey.has(definition.key)));
  const result: T[] = [];
  let cursor = 0;
  for (const definition of definitions) {
    result.push(definition.mandatory ? definition : ordered[cursor++]);
  }
  return result;
}

/** Move a key one step within an order list (used by the column menu). */
export function moveInOrder(order: string[], key: string, direction: -1 | 1): string[] {
  const index = order.indexOf(key);
  if (index < 0) return order;
  const target = index + direction;
  if (target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
