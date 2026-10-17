import React from 'react';
import { invitationsApi, type AdminInvitation, type ScopedRoleOption } from '../../api/invitations';
import { apiErrorCode, invitationAdminErrorMessage, invitationMessageValid, validateInviteeEmail } from '../../invitations/invitationLogic';
import { ApiError } from '../../api/errors';

type ScopeKind = 'organization' | 'workspace' | 'combined';

/**
 * Stage C6-4 — minimal invitation management for scope
 * administrators (/invitations/manage), over the C6-3 APIs.
 *
 * Authorization (members.manage + Grant Ceilings) is enforced by
 * the backend; this page only offers the flow and renders stable
 * error codes as guidance. The one-time invitation link is kept
 * ONLY in component state after issuance, clearly marked
 * sensitive; token hashes are never returned by the API and are
 * never shown or persisted here. Delivery failure is surfaced
 * with the revoke-and-reissue recovery path.
 */
export function InvitationManagerPage() {
  const [kind, setKind] = React.useState<ScopeKind>('organization');
  const [organizationId, setOrganizationId] = React.useState('');
  const [workspaceId, setWorkspaceId] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [organizationRoles, setOrganizationRoles] = React.useState<ScopedRoleOption[]>([]);
  const [workspaceRoles, setWorkspaceRoles] = React.useState<ScopedRoleOption[]>([]);
  const [organizationRoleId, setOrganizationRoleId] = React.useState('');
  const [workspaceRoleId, setWorkspaceRoleId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [oneTimeLink, setOneTimeLink] = React.useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = React.useState<string | null>(null);
  const [invitations, setInvitations] = React.useState<AdminInvitation[]>([]);
  const [listError, setListError] = React.useState<string | null>(null);

  const orgId = Number.parseInt(organizationId, 10);
  const wsId = Number.parseInt(workspaceId, 10);
  const needsOrganization = kind === 'organization' || kind === 'combined';
  const needsWorkspace = kind === 'workspace' || kind === 'combined';

  const loadRoles = React.useCallback(() => {
    if (needsOrganization && Number.isInteger(orgId) && orgId > 0) {
      invitationsApi.organizationRoles(orgId)
        .then((response) => setOrganizationRoles(response.data))
        .catch(() => setOrganizationRoles([]));
    }
    if (needsWorkspace && Number.isInteger(wsId) && wsId > 0) {
      invitationsApi.workspaceRoles(wsId)
        .then((response) => setWorkspaceRoles(response.data))
        .catch(() => setWorkspaceRoles([]));
    }
  }, [kind, orgId, wsId, needsOrganization, needsWorkspace]);

  React.useEffect(() => { loadRoles(); }, [loadRoles]);

  const loadInvitations = React.useCallback(() => {
    setListError(null);
    const loaders: Promise<void>[] = [];
    const collected: AdminInvitation[] = [];
    if (Number.isInteger(orgId) && orgId > 0 && needsOrganization) {
      loaders.push(invitationsApi.listOrganizationInvitations(orgId).then((r) => { collected.push(...r.data); }).catch((e) => {
        setListError(invitationAdminErrorMessage(apiErrorCode(e), e instanceof ApiError ? e.status : 0));
      }));
    }
    if (Number.isInteger(wsId) && wsId > 0 && needsWorkspace) {
      loaders.push(invitationsApi.listWorkspaceInvitations(wsId).then((r) => { collected.push(...r.data); }).catch((e) => {
        setListError(invitationAdminErrorMessage(apiErrorCode(e), e instanceof ApiError ? e.status : 0));
      }));
    }
    void Promise.all(loaders).then(() => {
      const unique = [...new Map(collected.map((item) => [item.id, item])).values()];
      unique.sort((a, b) => b.id - a.id);
      setInvitations(unique);
    });
  }, [kind, orgId, wsId, needsOrganization, needsWorkspace]);

  React.useEffect(() => { loadInvitations(); }, [loadInvitations]);

  const roleSelect = (
    label: string,
    roles: ScopedRoleOption[],
    value: string,
    setValue: (next: string) => void,
    id: string,
  ) => (
    <div>
      <label htmlFor={id} className="mb-1 block font-medium">{label}</label>
      {roles.length > 0 ? (
        <select id={id} value={value} onChange={(event) => setValue(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          <option value="">انتخاب نقش…</option>
          {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      ) : (
        <input id={id} inputMode="numeric" dir="ltr" value={value} onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ''))} placeholder="شناسهٔ نقش" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" />
      )}
    </div>
  );

  const issue = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setOneTimeLink(null);
    setDeliveryStatus(null);
    if (!validateInviteeEmail(email)) { setError('نشانی ایمیل معتبر نیست.'); return; }
    if (!invitationMessageValid(message)) { setError('پیام دعوت حداکثر ۱۰۰۰ نویسه است.'); return; }
    const payloadMessage = message.trim() ? message : undefined;
    setBusy(true);
    try {
      const response = kind === 'organization'
        ? await invitationsApi.createOrganizationInvitation(orgId, { email: email.trim(), organization_role_id: Number(organizationRoleId), message: payloadMessage })
        : kind === 'workspace'
          ? await invitationsApi.createWorkspaceInvitation(wsId, { email: email.trim(), workspace_role_id: Number(workspaceRoleId), message: payloadMessage })
          : await invitationsApi.createCombinedInvitation(wsId, { email: email.trim(), organization_role_id: Number(organizationRoleId), workspace_role_id: Number(workspaceRoleId), message: payloadMessage });
      setOneTimeLink(response.data.accept_url);
      setDeliveryStatus(response.data.email_delivery_status);
      setNotice(response.data.email_delivery_status === 'sent'
        ? 'دعوت صادر و ایمیل آن ارسال شد.'
        : 'دعوت صادر شد، اما ارسال ایمیل ناموفق بود. پیوند یک‌بار زیر را دستی برای گیرنده بفرستید، یا دعوت را لغو و دوباره صادر کنید (پیوند تازه ساخته می‌شود).');
      loadInvitations();
    } catch (e) {
      setError(invitationAdminErrorMessage(apiErrorCode(e), e instanceof ApiError ? e.status : 0));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (invitation: AdminInvitation) => {
    setError(null);
    try {
      await invitationsApi.revokeInvitation(invitation.id);
      setNotice('دعوت لغو شد. برای ارسال دوباره، دعوت تازه‌ای صادر کنید (پیوند تازه ساخته می‌شود).');
      loadInvitations();
    } catch (e) {
      setError(invitationAdminErrorMessage(apiErrorCode(e), e instanceof ApiError ? e.status : 0));
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800">
      <main className="mx-auto w-full max-w-3xl" aria-label="مدیریت دعوت‌ها">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">مدیریت دعوت‌ها</h1>
          <p className="mt-2 text-sm leading-7 text-slate-500">دعوت‌ها فقط در محدوده‌ای صادر می‌شوند که در آن اختیار مدیریت اعضا دارید و نقش انتخاب‌شده از سقف اختیارات شما فراتر نمی‌رود. تشخیص نهایی با سرور است.</p>

          <form onSubmit={issue} className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="mb-1 block font-medium">نوع دعوت</span>
              <div role="radiogroup" aria-label="نوع دعوت" className="flex flex-wrap gap-2">
                {([['organization', 'سازمان'], ['workspace', 'فضای کاری'], ['combined', 'سازمان + فضای کاری']] as [ScopeKind, string][]).map(([value, label]) => (
                  <label key={value} className={`cursor-pointer rounded-lg border px-3 py-2 ${kind === value ? 'border-indigo-600 bg-indigo-50 font-bold text-indigo-900' : 'border-slate-300'}`}>
                    <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {needsOrganization && (
              <div>
                <label htmlFor="mgr-org" className="mb-1 block font-medium">شناسهٔ سازمان</label>
                <input id="mgr-org" inputMode="numeric" dir="ltr" value={organizationId} onChange={(event) => setOrganizationId(event.target.value.replace(/[^0-9]/g, ''))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" required />
              </div>
            )}
            {needsWorkspace && (
              <div>
                <label htmlFor="mgr-ws" className="mb-1 block font-medium">شناسهٔ فضای کاری</label>
                <input id="mgr-ws" inputMode="numeric" dir="ltr" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value.replace(/[^0-9]/g, ''))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" required />
              </div>
            )}
            {needsOrganization && roleSelect('نقش سازمانی', organizationRoles, organizationRoleId, setOrganizationRoleId, 'mgr-org-role')}
            {needsWorkspace && roleSelect('نقش فضای کاری', workspaceRoles, workspaceRoleId, setWorkspaceRoleId, 'mgr-ws-role')}

            <div className="sm:col-span-2">
              <label htmlFor="mgr-email" className="mb-1 block font-medium">ایمیل گیرنده</label>
              <input id="mgr-email" type="email" dir="ltr" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" placeholder="name@example.com" required />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="mgr-message" className="mb-1 block font-medium">پیام اختیاری <span className="text-slate-400">({message.length}/۱۰۰۰)</span></label>
              <textarea id="mgr-message" value={message} maxLength={1000} onChange={(event) => setMessage(event.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" />
            </div>

            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800 sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2">
              <button type="submit" disabled={busy} aria-disabled={busy} className="rounded-lg bg-indigo-600 px-5 py-2.5 font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                {busy ? 'در حال صدور…' : 'صدور دعوت'}
              </button>
            </div>
          </form>

          {notice && <p role="status" className={`mt-4 rounded-xl p-3 text-sm leading-7 ${deliveryStatus === 'failed' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>{notice}</p>}

          {oneTimeLink && (
            <div className="mt-4 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
              <p className="font-bold">پیوند یک‌بار دعوت — محرمانه</p>
              <p>این پیوند فقط همین یک‌بار نمایش داده می‌شود و پس از صدور قابل بازیابی نیست. آن را فقط برای گیرنده بفرستید و در هیچ سامانه‌ای ثبت نکنید.</p>
              <div className="flex gap-2">
                <input readOnly dir="ltr" value={oneTimeLink} aria-label="پیوند یک‌بار دعوت" className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-xs" />
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(oneTimeLink); }} className="shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-2 font-bold hover:bg-amber-100">کپی</button>
                <button type="button" onClick={() => setOneTimeLink(null)} className="shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-2 font-bold hover:bg-amber-100">پنهان‌کردن</button>
              </div>
            </div>
          )}

          <section aria-label="دعوت‌های این محدوده" className="mt-8 border-t border-slate-100 pt-5 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">دعوت‌های محدوده</h2>
              <button type="button" onClick={loadInvitations} className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold hover:bg-slate-50">به‌روزرسانی</button>
            </div>
            {listError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-red-800">{listError}</p>}
            {invitations.length === 0 && !listError && <p className="mt-3 text-slate-500">برای مشاهده، شناسهٔ سازمان یا فضای کاری را وارد کنید.</p>}
            <ul className="mt-3 divide-y divide-slate-100">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium" dir="ltr">{invitation.email}</p>
                    <p className="text-xs text-slate-500">
                      {invitation.type === 'organization' ? 'سازمان' : invitation.type === 'workspace' ? 'فضای کاری' : 'سازمان + فضای کاری'}
                      {' · '}
                      {invitation.status === 'pending' ? 'در انتظار پذیرش' : invitation.status === 'accepted' ? 'پذیرفته‌شده' : invitation.status === 'revoked' ? 'لغوشده' : invitation.status === 'expired' ? 'منقضی‌شده' : invitation.status}
                    </p>
                  </div>
                  {invitation.status === 'pending' && (
                    <button type="button" onClick={() => void revoke(invitation)} className="rounded-lg border border-red-300 px-3 py-1.5 font-bold text-red-700 hover:bg-red-50">لغو دعوت</button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
