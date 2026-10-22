import React from 'react';
import { Card, EmptyState, PageHeader, Select, Skeleton, Tabs } from '../../../shared/ui/Primitives';
import { Alert } from '../../../shared/ui/Notifications';
import { PageSurface } from '../../../shared/ui/PageSurface';
import { ApiError } from '../../../shared/api/client';
import {
  scopedSettingsApi,
  type ScopedSettingItem,
  type ScopeSummary,
} from '../scopedSettingsApi';
import { settingErrorMessage } from '../scopedSettingsLogic';
import { useEnvironment } from '../../../app/providers/EnvironmentContext';
import { SettingRow, type SettingsScope } from './SettingRow';
import { SecretsSection } from './SecretsSection';
import { HistoryDrawer } from './HistoryDrawer';

type SettingsTab = 'organization' | 'workspace' | 'personal' | 'platform';

function messageOf(error: unknown): string {
  const payload = error instanceof ApiError ? (error.payload as { code?: string } | undefined) : undefined;
  return settingErrorMessage(payload?.code, error instanceof ApiError ? error.status : 0);
}

const TAB_ITEMS = [
  { id: 'organization', label: 'سازمان' },
  { id: 'workspace', label: 'فضای کاری' },
  { id: 'personal', label: 'شخصی' },
  { id: 'platform', label: 'پلتفرم' },
];

/**
 * Stage C7-4 scoped settings: Organization values + override
 * policies, Workspace values over inherited Organization defaults,
 * and personal presentation preferences — all through the C7-2/
 * C7-3 authorized APIs. The legacy workspace "Settings" screen is
 * untouched; this page only manages Core scoped settings.
 */
export function ScopedSettingsPage() {
  const [tab, setTab] = React.useState<SettingsTab>('organization');
  const [organizations, setOrganizations] = React.useState<ScopeSummary[]>([]);
  const [workspaces, setWorkspaces] = React.useState<ScopeSummary[]>([]);
  const [organizationId, setOrganizationId] = React.useState<number | null>(null);
  const [workspaceId, setWorkspaceId] = React.useState<number | null>(null);
  const [scopesError, setScopesError] = React.useState<string | null>(null);
  const [scopesLoading, setScopesLoading] = React.useState(true);
  const [scopesDenied, setScopesDenied] = React.useState(false);

  const [orgItems, setOrgItems] = React.useState<ScopedSettingItem[] | null>(null);
  const [wsItems, setWsItems] = React.useState<ScopedSettingItem[] | null>(null);
  const [prefItems, setPrefItems] = React.useState<ScopedSettingItem[] | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [historyItem, setHistoryItem] = React.useState<ScopedSettingItem | null>(null);
  const [historyScope, setHistoryScope] = React.useState<SettingsScope>('organization');

  React.useEffect(() => {
    let cancelled = false;
    setScopesLoading(true);
    setScopesDenied(false);
    Promise.all([scopedSettingsApi.organizations(), scopedSettingsApi.workspaces()])
      .then(([orgs, spaces]) => {
        if (cancelled) return;
        setOrganizations(orgs.data);
        setWorkspaces(spaces.data);
        setOrganizationId(previous => previous ?? orgs.data[0]?.id ?? null);
        setWorkspaceId(previous => previous ?? spaces.data[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setScopesError(messageOf(error));
        setScopesDenied(error instanceof ApiError && error.status === 403);
      })
      .finally(() => { if (!cancelled) setScopesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const reloadLists = React.useCallback(() => setReloadToken(token => token + 1), []);

  // UX-02-1 (S6): entering via an organization/workspace/platform
  // environment preselects the matching scope here. Applied once per
  // environment (tracked by key) and only when the scope id is in the
  // caller's own server-returned lists; manual tab/scope changes
  // afterwards are never overridden.
  const { selection: environmentSelection } = useEnvironment();
  const appliedEnvironment = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (scopesLoading || !environmentSelection) return;
    const key = `${environmentSelection.kind}:${environmentSelection.id ?? ''}`;
    if (appliedEnvironment.current === key) return;
    if (environmentSelection.kind === 'platform') {
      setTab('platform');
      appliedEnvironment.current = key;
    } else if (environmentSelection.kind === 'organization' && environmentSelection.id !== null
      && organizations.some(org => org.id === environmentSelection.id)) {
      setTab('organization');
      setOrganizationId(environmentSelection.id);
      appliedEnvironment.current = key;
    } else if (environmentSelection.kind === 'workspace' && environmentSelection.id !== null
      && workspaces.some(workspace => workspace.id === environmentSelection.id)) {
      setTab('workspace');
      setWorkspaceId(environmentSelection.id);
      appliedEnvironment.current = key;
    }
  }, [scopesLoading, environmentSelection, organizations, workspaces]);

  React.useEffect(() => {
    if (tab !== 'organization' || organizationId === null) return;
    let cancelled = false;
    setOrgItems(null);
    scopedSettingsApi.organizationSettings(organizationId)
      .then(response => { if (!cancelled) { setOrgItems(response.data); setListError(null); } })
      .catch((error: unknown) => { if (!cancelled) { setOrgItems([]); setListError(messageOf(error)); } });
    return () => { cancelled = true; };
  }, [tab, organizationId, reloadToken]);

  React.useEffect(() => {
    if (tab !== 'workspace' || workspaceId === null) return;
    let cancelled = false;
    setWsItems(null);
    scopedSettingsApi.workspaceSettings(workspaceId)
      .then(response => { if (!cancelled) { setWsItems(response.data); setListError(null); } })
      .catch((error: unknown) => { if (!cancelled) { setWsItems([]); setListError(messageOf(error)); } });
    return () => { cancelled = true; };
  }, [tab, workspaceId, reloadToken]);

  React.useEffect(() => {
    if (tab !== 'personal') return;
    let cancelled = false;
    setPrefItems(null);
    scopedSettingsApi.preferences()
      .then(response => { if (!cancelled) { setPrefItems(response.data); setListError(null); } })
      .catch((error: unknown) => { if (!cancelled) { setPrefItems([]); setListError(messageOf(error)); } });
    return () => { cancelled = true; };
  }, [tab, reloadToken]);

  const openHistory = (scope: SettingsScope) => (item: ScopedSettingItem) => {
    setHistoryScope(scope);
    setHistoryItem(item);
  };

  const renderRows = (
    items: ScopedSettingItem[] | null,
    scope: SettingsScope,
    handlers: {
      onSave: (key: string, value: unknown, expectedVersion: number | null) => Promise<void>;
      onRemove: (key: string, expectedVersion: number | null) => Promise<void>;
      onPolicyChange?: (key: string, allow: boolean, expectedVersion: number | null) => Promise<void>;
    },
  ) => {
    if (items === null) return <><Skeleton /><Skeleton /></>;
    if (listError) {
      return <Alert tone="error" title="دریافت تنظیمات ناموفق بود" description={listError} actions={<button type="button" className="underline" onClick={reloadLists}>تلاش مجدد</button>} />;
    }
    if (items.length === 0) {
      return <EmptyState variant="first-use" title="تنظیمی ثبت نشده است" description="تنظیم‌ها فقط وقتی در کد ثبت شوند اینجا ظاهر می‌شوند." />;
    }
    return items.map(item => (
      <SettingRow
        item={item}
        scope={scope}
        onSave={handlers.onSave}
        onRemove={handlers.onRemove}
        onPolicyChange={handlers.onPolicyChange}
        onHistory={openHistory(scope)}
      />
    ));
  };

  return (
    <PageSurface containerClassName="max-w-5xl" className="space-y-5">
      <PageHeader
        title="تنظیمات دامنه‌ای"
        description="مقادیر سازمان، فضای کاری و ترجیحات شخصی از مسیر مجاز و حسابرسی‌شدهٔ C7 مدیریت می‌شوند. تنظیمات قدیمی فضای کاری در صفحهٔ «تنظیمات سامانه» دست‌نخورده باقی می‌ماند."
      />
      {scopesError && <Alert tone="error" title="دریافت دامنه‌ها ناموفق بود" description={scopesError} />}

      <Tabs items={TAB_ITEMS} value={tab} onChange={id => setTab(id as SettingsTab)} ariaLabel="دامنهٔ تنظیمات" />

      {tab === 'organization' && (
        <div className="space-y-4">
          <Card title="دامنهٔ سازمان">
            {scopesLoading ? (
              <Skeleton />
            ) : scopesDenied ? (
              <EmptyState variant="no-permission" title="دسترسی به دامنه‌ها ندارید" description="نشست شما مجاز به مشاهدهٔ دامنه‌های تنظیمات نیست. در صورت نیاز با مدیر سامانه تماس بگیرید." />
            ) : organizations.length === 0 ? (
              <EmptyState variant="no-results" title="سازمانی یافت نشد" description="برای حساب شما سازمانی با عضویت فعال پیدا نشد." />
            ) : (
              <Select
                id="scoped-settings-organization"
                value={organizationId === null ? '' : String(organizationId)}
                onChange={event => setOrganizationId(Number(event.target.value))}
              >
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </Select>
            )}
          </Card>

          {organizationId !== null && (
            <>
              <section className="space-y-3">
                <h2 className="text-sm font-black text-slate-700">نمایهٔ عمومی سازمان</h2>
                {renderRows(orgItems?.filter(item => item.definition.key.startsWith('organization.public.')) ?? null, 'organization', {
                  onSave: async (key, value, expected) => { await scopedSettingsApi.writeOrganizationSetting(organizationId, key, value, expected); reloadLists(); },
                  onRemove: async (key, expected) => { await scopedSettingsApi.removeOrganizationSetting(organizationId, key, expected); reloadLists(); },
                })}
                <p className="text-[11px] text-slate-400">این همان فرادادهٔ تأییدشده‌ای است که در پیش‌نمایش دعوت‌نامه‌ها نمایش داده می‌شود؛ منبع دیگری برای آن وجود ندارد.</p>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-black text-slate-700">تنظیمات سازمان</h2>
                {renderRows(orgItems?.filter(item => !item.definition.key.startsWith('organization.public.')) ?? null, 'organization', {
                  onSave: async (key, value, expected) => { await scopedSettingsApi.writeOrganizationSetting(organizationId, key, value, expected); reloadLists(); },
                  onRemove: async (key, expected) => { await scopedSettingsApi.removeOrganizationSetting(organizationId, key, expected); reloadLists(); },
                  onPolicyChange: async (key, allow, expected) => { await scopedSettingsApi.setOrganizationPolicy(organizationId, key, allow, expected); reloadLists(); },
                })}
              </section>

              <SecretsSection
                title="اسرار سازمان"
                load={async () => (await scopedSettingsApi.organizationSecrets(organizationId)).data}
                put={async (key, value, expected) => { await scopedSettingsApi.putOrganizationSecret(organizationId, key, value, expected); }}
                revoke={async (key, expected) => { await scopedSettingsApi.revokeOrganizationSecret(organizationId, key, expected); }}
                reloadToken={reloadToken}
              />
            </>
          )}
        </div>
      )}

      {tab === 'workspace' && (
        <div className="space-y-4">
          <Card title="دامنهٔ فضای کاری">
            {scopesLoading ? (
              <Skeleton />
            ) : scopesDenied ? (
              <EmptyState variant="no-permission" title="دسترسی به دامنه‌ها ندارید" description="نشست شما مجاز به مشاهدهٔ دامنه‌های تنظیمات نیست. در صورت نیاز با مدیر سامانه تماس بگیرید." />
            ) : workspaces.length === 0 ? (
              <EmptyState variant="no-results" title="فضای کاری یافت نشد" description="برای حساب شما فضای کاری قابل دسترسی پیدا نشد." />
            ) : (
              <Select
                id="scoped-settings-workspace"
                value={workspaceId === null ? '' : String(workspaceId)}
                onChange={event => setWorkspaceId(Number(event.target.value))}
              >
                {workspaces.map(space => (
                  <option key={space.id} value={space.id}>{space.name}</option>
                ))}
              </Select>
            )}
          </Card>

          {workspaceId !== null && (
            <>
              <section className="space-y-3">
                <h2 className="text-sm font-black text-slate-700">تنظیمات فضای کاری</h2>
                {renderRows(wsItems, 'workspace', {
                  onSave: async (key, value, expected) => { await scopedSettingsApi.writeWorkspaceSetting(workspaceId, key, value, expected); reloadLists(); },
                  onRemove: async (key, expected) => { await scopedSettingsApi.removeWorkspaceSetting(workspaceId, key, expected); reloadLists(); },
                })}
              </section>

              <SecretsSection
                title="اسرار فضای کاری"
                load={async () => (await scopedSettingsApi.workspaceSecrets(workspaceId)).data}
                put={async (key, value, expected) => { await scopedSettingsApi.putWorkspaceSecret(workspaceId, key, value, expected); }}
                revoke={async (key, expected) => { await scopedSettingsApi.revokeWorkspaceSecret(workspaceId, key, expected); }}
                reloadToken={reloadToken}
              />
            </>
          )}
        </div>
      )}

      {tab === 'personal' && (
        <section className="space-y-3">
          <h2 className="text-sm font-black text-slate-700">ترجیحات نمایشی شخصی</h2>
          <p className="text-[11px] leading-5 text-slate-500">این ترجیحات فقط روی تجربهٔ نمایشی شما اثر می‌گذارند و هیچ سیاست امنیتی یا کسب‌وکاری را تغییر نمی‌دهند.</p>
          {renderRows(prefItems, 'user', {
            onSave: async (key, value, expected) => { await scopedSettingsApi.writePreference(key, value, expected); reloadLists(); },
            onRemove: async (key, expected) => { await scopedSettingsApi.removePreference(key, expected); reloadLists(); },
          })}
        </section>
      )}

      {tab === 'platform' && (
        <EmptyState
          variant="first-use"
          title="تنظیم پلتفرمی در این صفحه وجود ندارد"
          description="در حال حاضر هیچ تنظیمی با دامنهٔ پلتفرم و مجوز مدیریت پلتفرم برای این رابط ثبت نشده است. دسترسی فضای کاری هرگز جایگزین مدیریت پلتفرم نمی‌شود و مدیریت پلتفرم از کنسول پلتفرم انجام می‌شود."
        />
      )}

      <HistoryDrawer
        item={historyItem}
        onClose={() => setHistoryItem(null)}
        loadPage={(key, page) => (historyScope === 'organization' && organizationId !== null
          ? scopedSettingsApi.organizationHistory(organizationId, key, page)
          : historyScope === 'workspace' && workspaceId !== null
            ? scopedSettingsApi.workspaceHistory(workspaceId, key, page)
            : scopedSettingsApi.preferenceHistory(key, page))}
        restore={async (key, revisionId, expected) => {
          if (historyScope === 'organization' && organizationId !== null) await scopedSettingsApi.restoreOrganizationSetting(organizationId, key, revisionId, expected);
          else if (historyScope === 'workspace' && workspaceId !== null) await scopedSettingsApi.restoreWorkspaceSetting(workspaceId, key, revisionId, expected);
          else await scopedSettingsApi.restorePreference(key, revisionId, expected);
        }}
        onRestored={reloadLists}
      />
    </PageSurface>
  );
}
