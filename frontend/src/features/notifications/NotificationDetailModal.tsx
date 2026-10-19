import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Button, Modal } from '../../shared/ui/Primitives';
import { formatPersianDateTime } from '../../shared/lib/date';
import type { AppNotification } from '../../shared/types';

/**
 * UX-02-4 §5.3: in-page detail for notifications that carry
 * meaningful detail text. Reading already happened on activation;
 * this modal informs — it never implies legal acknowledgment of an
 * official notice (that is SYS-MSG-01 territory, deliberately absent).
 */
export function NotificationDetailModal({
  notification,
  canNavigate,
  onNavigate,
  onClose,
}: {
  notification: AppNotification | null;
  canNavigate: boolean;
  onNavigate: () => void;
  onClose: () => void;
}) {
  if (!notification) return null;
  return (
    <Modal open onClose={onClose} title={notification.title}>
      <div className="space-y-4 p-5">
        <p className="whitespace-pre-line text-sm leading-7 text-slate-600">{notification.body || notification.message}</p>
        <p className="text-[11px] font-bold text-slate-400">{formatPersianDateTime(notification.timestamp)}</p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>بستن</Button>
          {canNavigate && (
            <Button onClick={onNavigate}>
              <ExternalLink className="h-4 w-4" />
              مشاهدهٔ مورد مرتبط
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
