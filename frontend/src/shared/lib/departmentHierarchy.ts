/** Organizational hierarchy only: this helper never computes/inherits access. */
export function departmentDescendants(departments: readonly { id: string; parentId?: string | null }[], id?: string): Set<string> {
  const excluded = new Set<string>(id ? [id] : []);
  if (!id) return excluded;
  const children = new Map<string, string[]>();
  for (const department of departments) {
    if (department.parentId) children.set(department.parentId, [...(children.get(department.parentId) ?? []), department.id]);
  }
  const pending = [id];
  while (pending.length) {
    const parent = pending.pop()!;
    for (const child of children.get(parent) ?? []) {
      if (!excluded.has(child)) { excluded.add(child); pending.push(child); }
    }
  }
  return excluded;
}
