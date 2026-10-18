import React from 'react';
import { Badge, Button, Checkbox, FormField, Input, RadioGroup, Select, Textarea } from '../../../components/common/Primitives';
import { Alert } from '../../../components/common/Notifications';
import type { ScopedSettingItem } from '../scopedSettingsApi';
import {
  draftFromItem,
  editorKindFor,
  formatValue,
  inheritanceLabel,
  optionsFor,
  parseDraft,
  settingErrorMessage,
  sourceLabel,
  workspaceOverrideAllowed,
} from '../scopedSettingsLogic';
import { ApiError } from '../../../api/client';

export type SettingsScope = 'organization' | 'workspace' | 'user';

interface SettingRowProps {
  item: ScopedSettingItem;
  scope: SettingsScope;
  onSave: (key: string, value: unknown, expectedVersion: number | null) => Promise<void>;
  onRemove: (key: string, expectedVersion: number | null) => Promise<void>;
  onPolicyChange?: (key: string, allow: boolean, expectedVersion: number | null) => Promise<void>;
  onHistory: (item: ScopedSettingItem) => void;
}

function codeOf(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    const payload = error.payload as { code?: string } | undefined;
    return payload?.code;
  }
  return undefined;
}

function statusOf(error: unknown): number {
  return error instanceof ApiError ? error.status : 0;
}

/**
 * One registered setting: effective value + winning source, an
 * editor for the explicit value at this scope, optimistic-version
 * saving, reset-to-inherited (remove), and history. All state is
 * local to the row; secret settings never render here.
 */
export function SettingRow({ item, scope, onSave, onRemove, onPolicyChange, onHistory }: SettingRowProps) {
  const { definition } = item;
  const kind = editorKindFor(definition.type, definition.values);
  const options = optionsFor(item);
  const [draft, setDraft] = React.useState(() => draftFromItem(item));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDraft(draftFromItem(item));
    setError(null);
    setNotice(null);
  }, [item]);

  const overrideBlocked = scope === 'workspace' && definition.workspace_override && !workspaceOverrideAllowed(item);
  const disabled = busy || overrideBlocked;
  const inherited = inheritanceLabel(item, scope);
  const fieldId = `setting-${scope}-${definition.key.replace(/[^a-z0-9]+/gi, '-')}`;

  const save = async () => {
    const parsed = parseDraft(item, draft);
    if (parsed.ok === false) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(definition.key, parsed.value, item.explicit.version);
      setNotice('ذخیره شد.');
    } catch (saveError) {
      setError(settingErrorMessage(codeOf(saveError), statusOf(saveError)));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await onRemove(definition.key, item.explicit.version);
      setNotice(scope === 'workspace' ? 'مقدار فضای کاری حذف شد و مقدار سازمان به ارث می‌رسد.' : 'مقدار صریح حذف شد.');
    } catch (removeError) {
      setError(settingErrorMessage(codeOf(removeError), statusOf(removeError)));
    } finally {
      setBusy(false);
    }
  };

  const togglePolicy = async (allow: boolean) => {
    if (!onPolicyChange) return;
    setBusy(true);
    setError(null);
    try {
      await onPolicyChange(definition.key, allow, item.override_policy?.version ?? null);
    } catch (policyError) {
      setError(settingErrorMessage(codeOf(policyError), statusOf(policyError)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-slate-800">{definition.title}</p>
          {definition.description && <p className="text-[11px] leading-5 text-slate-500 mt-0.5">{definition.description}</p>}
          <p className="text-[10px] text-slate-400 mt-0.5" dir="ltr">{definition.key}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={item.explicit.exists ? 'primary' : 'neutral'}>
            {item.explicit.exists ? 'مقدار صریح' : inherited ?? `منبع: ${sourceLabel(item.effective.source)}`}
          </Badge>
          {item.effective.legacy && <Badge tone="warning">از منبع قدیمی</Badge>}
        </div>
      </div>

      <p className="text-xs text-slate-600">
        مقدار مؤثر فعلی: <strong className="text-slate-900">{formatValue(item.effective.value)}</strong>
        <span className="text-slate-400"> (منبع: {sourceLabel(item.effective.source)})</span>
        {item.explicit.exists && item.explicit.version !== null && (
          <span className="text-slate-400"> — نسخهٔ {item.explicit.version}</span>
        )}
      </p>

      {overrideBlocked && (
        <Alert tone="warning" title="بازنویسی در فضای کاری مجاز نیست" description="سازمان اجازهٔ بازنویسی این تنظیم را نداده است. مقدار ذخیره‌شده (اگر باشد) حفظ می‌شود ولی اعمال نمی‌شود." />
      )}
      {error && <Alert tone="error" title="خطا" description={error} onClose={() => setError(null)} />}
      {notice && !error && <Alert tone="success" title={notice} onClose={() => setNotice(null)} />}

      <FormField label={scope === 'workspace' ? 'مقدار فضای کاری' : scope === 'organization' ? 'مقدار سازمان' : 'ترجیح شما'} htmlFor={fieldId}>
        {kind === 'select' ? (
          <Select id={fieldId} value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)}>
            {definition.nullable && <option value="">(خالی)</option>}
            {options.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        ) : kind === 'boolean' ? (
          <RadioGroup
            label={definition.title}
            name={fieldId}
            value={draft === '' ? 'false' : draft}
            disabled={disabled}
            onChange={value => setDraft(value)}
            options={[
              { value: 'true', label: 'بله' },
              { value: 'false', label: 'خیر' },
            ]}
          />
        ) : kind === 'json' || definition.type === 'json' ? (
          <Textarea id={fieldId} rows={4} dir="ltr" value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)} />
        ) : kind === 'number' ? (
          <Input id={fieldId} inputMode="numeric" dir="ltr" value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)} />
        ) : (
          <Input id={fieldId} dir={definition.type === 'string' && definition.key.includes('url') ? 'ltr' : undefined} value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)} />
        )}
      </FormField>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={busy} disabled={disabled} onClick={() => void save()}>ذخیره</Button>
        {item.explicit.exists && (
          <Button size="sm" variant="secondary" disabled={disabled} onClick={() => void remove()}>
            {scope === 'workspace' ? 'بازنشانی به مقدار به‌ارث‌رسیده' : 'حذف مقدار صریح'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onHistory(item)}>تاریخچه</Button>
      </div>

      {scope === 'organization' && definition.workspace_override && onPolicyChange && (
        <div className="border-t border-slate-100 pt-3">
          <Checkbox
            id={`${fieldId}-policy`}
            label="اجازهٔ بازنویسی در فضای کاری"
            description={item.override_policy?.allow
              ? 'فضاهای کاری می‌توانند برای این تنظیم مقدار خودشان را داشته باشند.'
              : 'فضاهای کاری مقدار سازمان را به ارث می‌برند و نمی‌توانند آن را بازنویسی کنند.'}
            checked={Boolean(item.override_policy?.allow)}
            disabled={busy}
            onChange={event => void togglePolicy(event.target.checked)}
          />
        </div>
      )}
    </div>
  );
}
