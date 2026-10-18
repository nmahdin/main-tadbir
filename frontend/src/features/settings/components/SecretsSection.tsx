import React from 'react';
import { Badge, Button, Card, ConfirmDialog, EmptyState, FormField, Input, Skeleton } from '../../../components/common/Primitives';
import { Alert } from '../../../components/common/Notifications';
import { ApiError } from '../../../api/client';
import type { ScopedSecretItem } from '../scopedSettingsApi';
import { settingErrorMessage } from '../scopedSettingsLogic';

interface SecretsSectionProps {
  title: string;
  load: () => Promise<ScopedSecretItem[]>;
  put: (key: string, value: string, expectedVersion: number | null) => Promise<void>;
  revoke: (key: string, expectedVersion: number | null) => Promise<void>;
  reloadToken: number;
}

/**
 * Write-only secret configuration. The value field is local,
 * password-style, never repopulated from the server, cleared on
 * submit/close/unmount, and never placed in storage, URLs,
 * analytics, or messages. The server only ever returns
 * configured metadata.
 */
export function SecretsSection({ title, load, put, revoke, reloadToken }: SecretsSectionProps) {
  const [items, setItems] = React.useState<ScopedSecretItem[] | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [denied, setDenied] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<ScopedSecretItem | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      setItems(await load());
      setDenied(false);
    } catch (loadError) {
      if (loadError instanceof ApiError && (loadError.status === 403 || (loadError.payload as { code?: string } | undefined)?.code === 'setting_forbidden')) {
        setDenied(true);
        setItems([]);
      } else {
        setError(settingErrorMessage(undefined, loadError instanceof ApiError ? loadError.status : 0));
        setItems([]);
      }
    }
  }, [load]);

  React.useEffect(() => {
    void refresh();
  }, [refresh, reloadToken]);

  // Never keep secret drafts around after leaving the section.
  React.useEffect(() => () => setDrafts({}), []);

  const submit = async (item: ScopedSecretItem) => {
    const value = drafts[item.definition.key] ?? '';
    if (value === '') {
      setError('مقدار محرمانه را وارد کنید.');
      return;
    }
    setBusyKey(item.definition.key);
    setError(null);
    try {
      await put(item.definition.key, value, item.secret.version);
      // Clear the local secret immediately; refresh shows metadata only.
      setDrafts(previous => ({ ...previous, [item.definition.key]: '' }));
      await refresh();
    } catch (putError) {
      const payload = putError instanceof ApiError ? (putError.payload as { code?: string } | undefined) : undefined;
      setError(settingErrorMessage(payload?.code, putError instanceof ApiError ? putError.status : 0));
      setDrafts(previous => ({ ...previous, [item.definition.key]: '' }));
    } finally {
      setBusyKey(null);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setBusyKey(revokeTarget.definition.key);
    setError(null);
    try {
      await revoke(revokeTarget.definition.key, revokeTarget.secret.version);
      setRevokeTarget(null);
      await refresh();
    } catch (revokeError) {
      const payload = revokeError instanceof ApiError ? (revokeError.payload as { code?: string } | undefined) : undefined;
      setError(settingErrorMessage(payload?.code, revokeError instanceof ApiError ? revokeError.status : 0));
      setRevokeTarget(null);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Card title={title} description="مقادیر محرمانه فقط نوشته می‌شوند و هرگز نمایش داده نمی‌شوند.">
      {items === null ? (
        <Skeleton />
      ) : denied ? (
        <EmptyState
          variant="no-permission"
          title="مجوز مدیریت اسرار را ندارید"
          description="مدیریت اسرار نیازمند مجوز جداگانهٔ مدیریت اسرار این دامنه است و با مجوز مدیریت تنظیمات داده نمی‌شود."
        />
      ) : items.length === 0 ? (
        <EmptyState
          variant="first-use"
          title="تنظیم محرمانه‌ای ثبت نشده است"
          description="در حال حاضر هیچ ماژولی برای این دامنه کلید محرمانه‌ای ثبت نکرده است. به‌محض ثبت نخستین کلید توسط ماژول مصرف‌کننده، اینجا نمایش داده می‌شود."
        />
      ) : (
        <div className="space-y-4">
          {error && <Alert tone="error" title="خطا" description={error} onClose={() => setError(null)} />}
          {items.map(item => (
            <div key={item.definition.key} className="rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-extrabold text-slate-800">{item.definition.title}</p>
                  <p className="text-[10px] text-slate-400" dir="ltr">{item.definition.key}</p>
                </div>
                <Badge tone={item.secret.configured ? 'success' : 'neutral'}>
                  {item.secret.configured ? 'پیکربندی شده' : 'پیکربندی نشده'}
                </Badge>
              </div>
              {item.secret.configured && (
                <p className="text-[11px] text-slate-500">
                  نسخهٔ {item.secret.version ?? '—'}
                  {item.secret.updated_at && <> — آخرین به‌روزرسانی: <span dir="ltr">{item.secret.updated_at}</span></>}
                </p>
              )}
              <FormField label="مقدار جدید (فقط نوشتنی)" htmlFor={`secret-${item.definition.key.replace(/[^a-z0-9]+/gi, '-')}`}>
                <Input
                  id={`secret-${item.definition.key.replace(/[^a-z0-9]+/gi, '-')}`}
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  value={drafts[item.definition.key] ?? ''}
                  disabled={busyKey === item.definition.key}
                  onChange={event => setDrafts(previous => ({ ...previous, [item.definition.key]: event.target.value }))}
                  placeholder="مقدار محرمانهٔ جدید…"
                />
              </FormField>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={busyKey === item.definition.key} onClick={() => void submit(item)}>
                  {item.secret.configured ? 'جایگزینی مقدار' : 'ذخیرهٔ مقدار'}
                </Button>
                {item.secret.configured && (
                  <Button size="sm" variant="danger" disabled={busyKey === item.definition.key} onClick={() => setRevokeTarget(item)}>
                    حذف مقدار محرمانه
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => void confirmRevoke()}
        title="مقدار محرمانه حذف شود؟"
        busy={busyKey !== null}
      />
    </Card>
  );
}
