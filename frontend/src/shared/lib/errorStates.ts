/**
 * UX-02-1 illustrated error-state model (pure logic).
 *
 * Maps a failed request (HTTP status / machine code / connectivity)
 * onto one of the illustrated Ocean states. Copy lives in the
 * IllustratedState component; this module only decides WHICH state
 * applies so the mapping stays unit-testable.
 */
import { ApiError } from '../api/errors.ts';

export type ErrorStateKind = 'forbidden' | 'not-found' | 'conflict' | 'server' | 'offline' | 'invalid-context' | 'generic';

export function errorStateKind(error: unknown, isOnline: boolean): ErrorStateKind {
  if (!isOnline) return 'offline';
  if (!(error instanceof ApiError)) return 'generic';
  if (error.status === 0) return 'offline';
  if (error.status === 403) return 'forbidden';
  if (error.status === 404) return 'not-found';
  if (error.status === 409) return 'conflict';
  if (error.status >= 500) return 'server';
  return 'generic';
}

/** Machine error codes that mean "the context you asked for is no
 *  longer available to you" rather than a plain denial (C3 lifecycle
 *  and scoped-settings planes). */
const INVALID_CONTEXT_CODES = new Set([
  // C3 lifecycle: deliberately generic member-facing denial.
  'organization_unavailable',
  // AuthorizationDeniedException context losses (C1 plane).
  'workspace_inactive',
  'workspace_membership_missing',
  'workspace_membership_inactive',
  'organization_membership_missing',
  'organization_membership_inactive',
]);

export function isInvalidContextError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const payload = error.payload;
  if (typeof payload !== 'object' || payload === null) return false;
  const code = (payload as { code?: unknown }).code;
  return typeof code === 'string' && INVALID_CONTEXT_CODES.has(code);
}
