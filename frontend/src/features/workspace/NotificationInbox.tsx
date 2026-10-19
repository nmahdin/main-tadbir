/**
 * UX-02-4: the routed notification center is the unified server-backed
 * implementation in features/notifications (grouping, category muting,
 * scoped read-all, detail modal, context-safe activation). This module
 * keeps the historical import path stable for the lazy route.
 */
export { NotificationsView as NotificationInbox } from '../notifications/NotificationsView';
