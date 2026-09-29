/** Refresh a stale publication version for the NEXT explicit user attempt.
 * Never automatically replay a command against a newly changed source.
 * Refresh failure must not hide the original command failure or imply success.
 */
export async function withPublicationConflictRefresh<T>(
  command: () => Promise<T>,
  refresh: () => Promise<void>,
): Promise<T> {
  try {
    return await command();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 409) {
      try { await refresh(); } catch { /* Keep the original error; no successful write is claimed. */ }
    }
    throw error;
  }
}
