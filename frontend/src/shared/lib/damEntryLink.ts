/** Navigation hint only; never an authorization grant. Reject ambiguous task links. */
export function readDamEntryLink(search: string): boolean {
  const query = new URLSearchParams(search);
  return query.getAll('dam_entry').length === 1 && query.get('dam_entry') === 'file' && !query.has('task');
}
