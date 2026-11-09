import React from 'react';
import { Button, ConfirmDialog, Drawer, EmptyState, Skeleton, Table, TableCell, TableRow } from '../../../shared/ui/Primitives';
import { Alert } from '../../../shared/ui/Notifications';
import { ApiError } from '../../../shared/api/client';
import type { HistoryPage, ScopedSettingItem, SettingRevision } from '../scopedSettingsApi';
import { formatValue, operationLabel, settingErrorMessage } from '../scopedSettingsLogic';

interface HistoryDrawerProps {
  item: ScopedSettingItem | null;
  onClose: () => void;
  loadPage: (key: string, page: number) => Promise<HistoryPage>;
  restore: (key: string, revisionId: number, expectedVersion: number | null) => Promise<void>;
  onRestored: () => void;
}

/**
 * Paginated non-secret revision history. Restore is a NEW
 * versioned mutation (confirmed here, revalidated server-side
 * against current rules); it never rewrites the chain. Secret
 * settings never reach this drawer (the API refuses them).
 */
export function HistoryDrawer({ item, onClose, loadPage, restore, onRestored }: HistoryDrawerProps) {
  const [page, setPage] = React.useState<HistoryPage | null>(null);
  const [pageNumber, setPageNumber] = React.useState(1);
  const [error, setError] = React.useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = React.useState<SettingRevision | null>(null);
  const [busy, setBusy] = React.useState(false);

  const key = item?.definition.key ?? null;

  const load = React.useCallback(async (targetPage: number) => {
    if (!key) return;
    try {
      setPage(await loadPage(key, targetPage));
      setError(null);
    } catch (loadError) {
      const payload = loadError instanceof ApiError ? (loadError.payload as { code?: string } | undefined) : undefined;
      setError(settingErrorMessage(payload?.code, loadError instanceof ApiError ? loadError.status : 0));
      setPage({ data: [], meta: { page: 1, per_page: 10, total: 0, last_page: 1 } });
    }
  }, [key, loadPage]);

  React.useEffect(() => {
    if (key) {
      setPageNumber(1);
      void load(1);
    } else {
      setPage(null);
    }
  }, [key, load]);

  const confirmRestore = async () => {
    if (!item || !restoreTarget) return;
    setBusy(true);
    try {
      await restore(item.definition.key, restoreTarget.id, item.explicit.version);
      setRestoreTarget(null);
      onRestored();
      void load(1);
      setPageNumber(1);
    } catch (restoreError) {
      const payload = restoreError instanceof ApiError ? (restoreError.payload as { code?: string } | undefined) : undefined;
      setError(settingErrorMessage(payload?.code, restoreError instanceof ApiError ? restoreError.status : 0));
      setRestoreTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={item !== null} onClose={onClose} title={item ? `تاریخچهٔ ${item.definition.title}` : 'تاریخچه'} size="lg">
      {error && <Alert tone="error" title="خطا" description={error} onClose={() => setError(null)} />}
      {page === null ? (
        <Skeleton />
      ) : page.data.length === 0 ? (
        <EmptyState variant="first-use" title="هنوز تغییری ثبت نشده است" description="نخستین ذخیرهٔ این تنظیم، اولین رکورد تاریخچه را ایجاد می‌کند." />
      ) : (
        <div className="space-y-3">
          <Table columns={['عملیات', 'مقدار قبلی', 'مقدار جدید', 'نسخه', 'زمان', '']}>
            {page.data.map(revision => (
              <TableRow>
                <TableCell>{operationLabel(revision.operation)}</TableCell>
                <TableCell>{revision.previous_present ? formatValue(revision.previous_value) : '—'}</TableCell>
                <TableCell>{revision.new_present ? formatValue(revision.new_value) : '—'}</TableCell>
                <TableCell>{revision.version}</TableCell>
                <TableCell><span dir="ltr">{revision.created_at ?? ''}</span></TableCell>
                <TableCell>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRestoreTarget(revision)}>بازگردانی</Button>
                </TableCell>
              </TableRow>
            ))}
          </Table>
          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant="ghost"
              disabled={pageNumber <= 1 || busy}
              onClick={() => { const next = pageNumber - 1; setPageNumber(next); void load(next); }}
            >
              صفحهٔ قبل
            </Button>
            <span className="text-[11px] text-slate-500">صفحهٔ {page.meta.page} از {page.meta.last_page} — {page.meta.total} رکورد</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pageNumber >= page.meta.last_page || busy}
              onClick={() => { const next = pageNumber + 1; setPageNumber(next); void load(next); }}
            >
              صفحهٔ بعد
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        onConfirm={() => void confirmRestore()}
        title="این نسخه بازگردانده شود؟ بازگردانی یک تغییر جدید ثبت می‌کند و تاریخچه پاک نمی‌شود."
        busy={busy}
      />
    </Drawer>
  );
}
