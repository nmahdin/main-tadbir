import {
  resolveEnvironment,
  sameEnvironment,
  type EnvironmentSelection,
  type EnvironmentsPayload,
} from '../../shared/lib/environments.ts';
import { notificationDestination, type NotificationTarget } from '../../app/router/listQuery.ts';
import type { AppNotification } from '../../shared/types.ts';

/**
 * UX-02-4 §5.3: resolve where activating a notification may go.
 * The destination route is allowlisted; when the notification knows
 * the owning environment and it differs from the current selection,
 * the switch happens only if the environment resolves for this user
 * (backend re-authorizes the record again on arrival — this is
 * navigation context, never an access grant).
 */
export function resolveNotificationTarget(
  notification: AppNotification,
  payload: EnvironmentsPayload | null,
  currentSelection: EnvironmentSelection | null,
): NotificationTarget {
  const path = notificationDestination(notification);
  if (!path) return { kind: 'unavailable', reason: 'no-destination' };

  const context = notification.context;
  if (!context || !payload) return { kind: 'navigate', path };

  const selection: EnvironmentSelection = { kind: context.kind, id: context.id };
  if (sameEnvironment(selection, currentSelection)) return { kind: 'navigate', path };
  if (resolveEnvironment(payload, selection)) return { kind: 'switch', selection, path };
  return { kind: 'unavailable', reason: 'context-inaccessible' };
}
