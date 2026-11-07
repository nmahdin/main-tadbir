/**
 * UX-02-4 (§12): shell-level registry of unsaved-change sources.
 * Long forms opt in (UX-02-3 form drafts are the first adopters);
 * the environment selector consults the registry before switching
 * so an in-progress form is never silently abandoned. Sources are
 * responsible for persisting/discarding their own drafts.
 */
export interface DirtySource {
  isDirty: () => boolean;
  /** Drop the draft and reset to a clean state. */
  discard: () => void;
}

const sources = new Map<string, DirtySource>();

export function registerDirtySource(id: string, source: DirtySource): () => void {
  sources.set(id, source);
  return () => {
    if (sources.get(id) === source) sources.delete(id);
  };
}

export function anyDirtySource(): boolean {
  for (const source of sources.values()) {
    if (source.isDirty()) return true;
  }
  return false;
}

export function discardAllDirtySources(): void {
  for (const source of sources.values()) {
    if (source.isDirty()) source.discard();
  }
}
