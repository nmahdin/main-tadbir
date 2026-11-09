// Transitional protection for legacy autosave: reading a collection is never a write.
// This is memory-only, per-session metadata, not a second data source.
const snapshots = new Map<string, string>();
const key = (userId: string, name: string, id: string) => `${userId}:${name}:${id}`;
export function rememberServerRecords(userId: string, name: string, data: unknown) {
  if (!Array.isArray(data)) return;
  for (const record of data) if (record && typeof record === 'object' && record.id != null)
    snapshots.set(key(userId, name, String(record.id)), JSON.stringify(record));
}
export function needsServerWrite(userId: string, name: string, record: { id: string }) {
  const previous = snapshots.get(key(userId, name, record.id));
  // Unknown numeric records may be a late detail fetch, not an edit. Do not blindly persist them.
  return previous !== undefined && previous !== JSON.stringify(record);
}
export function clearServerSnapshots() { snapshots.clear(); }

let session = { userId: '', epoch: 0 };
export const snapshotSession = () => session;
export function activateSnapshotSession(userId: string) {
  session = { userId, epoch: session.epoch + 1 }; snapshots.clear();
}
const apiCollections: Record<string, string> = {
  projects: 'projects', tasks: 'tasks', contents: 'contents', users: 'users', roles: 'roles', departments: 'departments',
  notifications: 'notifications', 'project-templates': 'templates', 'activity-logs': 'activities',
  ideas: 'ideas', 'think-tank-meetings': 'thinkTankMeetings', 'secretariat-letters': 'secretariatLetters',
  'secretariat-resolutions': 'secretariatResolutions', 'archive-dossiers': 'archiveDossiers',
  'dam/folders': 'folders', 'dam/assets': 'assets', 'chat/conversations': 'conversations', 'chat/messages': 'messages',
};
export function rememberApiResponse(scope: { userId: string; epoch: number }, path: string, payload: any) {
  if (!scope.userId || scope !== session) return; // Ignore late responses from an old session.
  const clean = path.split('?')[0].replace(/^\//, '');
  const prefix = Object.keys(apiCollections).find(prefix => clean === prefix || new RegExp(`^${prefix}/[1-9]\\d*$`).test(clean));
  if (!prefix || !payload?.data) return;
  rememberServerRecords(scope.userId, apiCollections[prefix], Array.isArray(payload.data) ? payload.data : [payload.data]);
}
