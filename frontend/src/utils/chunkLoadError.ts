/** Browser messages used when a deployed frontend no longer has an old lazy chunk. */
const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /loading (?:css )?chunk [^ ]+ failed/i,
  /chunkloaderror/i,
];

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '');
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(message));
}
