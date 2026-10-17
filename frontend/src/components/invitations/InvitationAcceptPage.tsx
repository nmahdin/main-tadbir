import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { invitationsApi, type AcceptanceResult, type EmailVerificationState, type InvitationPresentation } from '../../api/invitations';
import {
  acceptanceErrorMessage,
  apiErrorCode,
  cleanedUrl,
  extractSecretParam,
  formatExpiry,
  invitationStatusKind,
  postAcceptancePath,
  validateInviteeEmail,
} from '../../invitations/invitationLogic';
import {
  clearInvitationToken,
  currentInvitationToken,
  rememberInvitationToken,
} from '../../invitations/invitationSession';
import { ApiError } from '../../api/errors';

/**
 * Stage C6-4 — public invitation acceptance page
 * (/invitations/accept?token=...).
 *
 * The token is extracted once, kept only in module memory, and
 * immediately stripped from the address bar via history
 * replacement. Preview, login, registration, and email
 * verification NEVER consume it; only the explicit acceptance
 * button posts it (token-only body) to the C6-3 endpoint. The
 * signed-in identity survives the login detour because the SPA
 * never reloads and the token never leaves memory.
 */
export function InvitationAcceptPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, isSessionLoading, currentUser, logoutSession } = useAuth();

  const [phase, setPhase] = React.useState<'loading' | 'ready' | 'missing' | 'invalid' | 'unavailable'>('loading');
  const [presentation, setPresentation] = React.useState<InvitationPresentation | null>(null);
  const [statusOnly, setStatusOnly] = React.useState<string | null>(null);
  const [verification, setVerification] = React.useState<EmailVerificationState | null>(null);
  const [verificationPhase, setVerificationPhase] = React.useState<'idle' | 'loading' | 'error'>('idle');
  const [emailInput, setEmailInput] = React.useState('');
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [emailSent, setEmailSent] = React.useState(false);
  const [accepting, setAccepting] = React.useState(false);
  const [acceptError, setAcceptError] = React.useState<string | null>(null);
  const [accepted, setAccepted] = React.useState<AcceptanceResult | null>(null);
  const acceptingRef = React.useRef(false);

  // Keep token-bearing pages out of referrers for this document.
  React.useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'referrer';
      document.head.appendChild(meta);
    }
    const previous = meta.content;
    meta.content = 'no-referrer';
    return () => {
      if (meta) meta.content = previous;
      if (created && meta) meta.remove();
    };
  }, []);

  // Extract + hide the token exactly once per mount/link change.
  React.useEffect(() => {
    const fromUrl = extractSecretParam(location.search);
    if (fromUrl) {
      rememberInvitationToken(fromUrl);
      window.history.replaceState(null, '', cleanedUrl(window.location.pathname, location.search));
    }
    const token = fromUrl ?? currentInvitationToken();
    if (!token) {
      setPhase('missing');
      return;
    }
    let active = true;
    setPhase('loading');
    invitationsApi.preview(token)
      .then((response) => {
        if (!active) return;
        const data = response.data;
        if ('organization' in data || 'workspace' in data || 'inviter' in data) {
          setPresentation(data as InvitationPresentation);
        } else {
          setStatusOnly((data as { invitation: { status: string } }).invitation.status);
        }
        setPhase('ready');
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404) {
          setPhase('invalid');
        } else {
          setPhase('unavailable');
        }
      });
    return () => { active = false; };
    // location.search intentionally excluded: the token was already
    // stripped; re-running on search changes would lose the flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadVerification = React.useCallback(() => {
    setVerificationPhase('loading');
    invitationsApi.emailVerification()
      .then((response) => {
        setVerification(response.data);
        setVerificationPhase('idle');
      })
      .catch(() => setVerificationPhase('error'));
  }, []);

  React.useEffect(() => {
    if (isLoggedIn && presentation) loadVerification();
  }, [isLoggedIn, presentation, loadVerification]);

  const requestVerification = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = emailInput.trim();
    if (!validateInviteeEmail(email)) {
      setEmailError('نشانی ایمیل معتبر نیست.');
      return;
    }
    setEmailError(null);
    try {
      await invitationsApi.requestEmailVerification(email);
      setEmailSent(true);
    } catch (error) {
      const code = apiErrorCode(error);
      setEmailError(code === 'email_already_claimed'
        ? 'این نشانی ایمیل به حساب دیگری تعلق دارد. با همان حساب وارد شوید یا نشانی دیگری وارد کنید.'
        : code === 'email_delivery_unavailable' || code === 'email_delivery_failed'
          ? 'ارسال ایمیل تأیید در حال حاضر ممکن نیست. کمی بعد دوباره تلاش کنید.'
          : 'ارسال ایمیل تأیید انجام نشد. دوباره تلاش کنید.');
    }
  };

  const accept = async () => {
    const token = currentInvitationToken();
    if (!token || acceptingRef.current) return;
    acceptingRef.current = true;
    setAccepting(true);
    setAcceptError(null);
    try {
      const response = await invitationsApi.accept(token);
      clearInvitationToken();
      setAccepted(response.data);
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === 'invitation_already_accepted') {
        clearInvitationToken();
        setStatusOnly('accepted');
        return;
      }
      setAcceptError(acceptanceErrorMessage(code, error instanceof ApiError ? error.status : 0));
    } finally {
      acceptingRef.current = false;
      setAccepting(false);
    }
  };

  const switchAccount = async () => {
    try { await logoutSession(); } catch { /* session may already be gone */ }
    navigate('/login', { state: { from: '/invitations/accept' } });
  };

  const statusKind = invitationStatusKind(presentation?.invitation.status ?? statusOnly);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800">
      <main className="mx-auto w-full max-w-xl" aria-label="پذیرش دعوت">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">دعوت به تدبیر</h1>

          {phase === 'loading' && (
            <p role="status" className="mt-6 text-sm text-slate-500">در حال بررسی دعوت…</p>
          )}

          {phase === 'missing' && (
            <div role="alert" className="mt-6 space-y-3 text-sm leading-7">
              <p className="font-semibold text-slate-900">پیوند دعوت یافت نشد.</p>
              <p>این صفحه باید از پیوند داخل ایمیل دعوت باز شود. اگر پیوند را بسته‌اید، همان ایمیل را دوباره باز کنید و روی پیوند دعوت بزنید؛ باز کردن پیوند به‌تنهایی دعوت را مصرف نمی‌کند.</p>
            </div>
          )}

          {phase === 'invalid' && (
            <div role="alert" className="mt-6 space-y-3 text-sm leading-7">
              <p className="font-semibold text-slate-900">این پیوند دعوت معتبر نیست.</p>
              <p>ممکن است پیوند ناقص کپی شده باشد. پیوند کامل داخل ایمیل دعوت را دوباره باز کنید.</p>
            </div>
          )}

          {phase === 'unavailable' && (
            <div role="alert" className="mt-6 space-y-3 text-sm leading-7">
              <p className="font-semibold text-slate-900">بررسی دعوت انجام نشد.</p>
              <p>ارتباط با سرور برقرار نشد. دوباره تلاش کنید.</p>
              <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">تلاش دوباره</button>
            </div>
          )}

          {phase === 'ready' && statusKind !== 'pending' && !accepted && (
            <div role="alert" className="mt-6 space-y-3 text-sm leading-7">
              {statusKind === 'expired' && (<><p className="font-semibold text-slate-900">مهلت این دعوت به پایان رسیده است.</p><p>از دعوت‌کننده بخواهید دعوت تازه‌ای برای شما ارسال کند.</p></>)}
              {statusKind === 'revoked' && (<><p className="font-semibold text-slate-900">این دعوت لغو شده است.</p><p>اگر فکر می‌کنید اشتباهی رخ داده است، با دعوت‌کننده در تماس باشید.</p></>)}
              {statusKind === 'accepted' && (<><p className="font-semibold text-slate-900">این دعوت قبلاً پذیرفته شده است.</p><p>عضویت شما قبلاً ثبت شده است؛ می‌توانید وارد سامانه شوید.</p></>)}
              {statusKind === 'unknown' && (<><p className="font-semibold text-slate-900">این دعوت دیگر قابل استفاده نیست.</p></>)}
            </div>
          )}

          {phase === 'ready' && statusKind === 'pending' && presentation && !accepted && (
            <div className="mt-6 space-y-5">
              <section aria-label="جزئیات دعوت" className="space-y-3 text-sm leading-7">
                <div className="flex items-start gap-3">
                  {presentation.organization?.logo_url && (
                    <img src={presentation.organization.logo_url} alt="" className="h-12 w-12 rounded-xl border border-slate-200 object-cover" />
                  )}
                  <div>
                    {presentation.organization && <p className="font-bold text-slate-900">{presentation.organization.name}</p>}
                    {presentation.workspace && <p className="text-slate-700">فضای کاری: {presentation.workspace.name}</p>}
                    {presentation.organization?.description && <p className="text-slate-500">{presentation.organization.description}</p>}
                    {presentation.workspace?.description && <p className="text-slate-500">{presentation.workspace.description}</p>}
                  </div>
                </div>
                <dl className="space-y-1">
                  {presentation.intended_organization_role && (
                    <div className="flex gap-2"><dt className="text-slate-500">نقش سازمانی:</dt><dd className="font-medium">{presentation.intended_organization_role.name}</dd></div>
                  )}
                  {presentation.intended_workspace_role && (
                    <div className="flex gap-2"><dt className="text-slate-500">نقش فضای کاری:</dt><dd className="font-medium">{presentation.intended_workspace_role.name}</dd></div>
                  )}
                  {presentation.intended_organization_role?.summary && <p className="text-slate-500">{presentation.intended_organization_role.summary}</p>}
                  {presentation.intended_workspace_role?.summary && <p className="text-slate-500">{presentation.intended_workspace_role.summary}</p>}
                  {presentation.inviter && (
                    <div className="flex gap-2"><dt className="text-slate-500">دعوت‌کننده:</dt><dd className="font-medium">{presentation.inviter.name}</dd></div>
                  )}
                  <div className="flex gap-2"><dt className="text-slate-500">انقضا:</dt><dd className="font-medium">{formatExpiry(presentation.invitation.expires_at)}</dd></div>
                </dl>
                {presentation.message && (
                  <blockquote className="rounded-xl bg-slate-50 p-3 text-slate-600">«{presentation.message}»</blockquote>
                )}
                {presentation.invitation.type === 'combined' && (
                  <p className="rounded-xl bg-indigo-50 p-3 text-indigo-900">با پذیرش این دعوت، هم عضو سازمان می‌شوید و هم به فضای کاری مشخص‌شده دسترسی پیدا می‌کنید.</p>
                )}
                {presentation.invitation.type === 'workspace' && presentation.invitation.will_create_organization_membership === false && (
                  <p className="rounded-xl bg-slate-50 p-3 text-slate-600">این دعوت فقط عضویت فضای کاری ایجاد می‌کند و به عضویت سازمان نیاز دارد.</p>
                )}
              </section>

              {isSessionLoading && <p role="status" className="text-sm text-slate-500">در حال بررسی نشست…</p>}

              {!isSessionLoading && !isLoggedIn && (
                <section aria-label="ورود یا ثبت‌نام" className="space-y-3 border-t border-slate-100 pt-4 text-sm leading-7">
                  <p>برای پذیرش دعوت، ابتدا وارد حساب خود شوید یا ثبت‌نام کنید. پذیرش فقط پس از ورود و با زدن دکمهٔ «پذیرش دعوت» انجام می‌شود؛ ورود به‌تنهایی دعوت را نمی‌پذیرد.</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => navigate('/login', { state: { from: '/invitations/accept' } })} className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">ورود یا ثبت‌نام</button>
                  </div>
                </section>
              )}

              {!isSessionLoading && isLoggedIn && (
                <section aria-label="پذیرش دعوت" className="space-y-3 border-t border-slate-100 pt-4 text-sm leading-7">
                  <p className="text-slate-600">وارد شده‌اید به‌عنوان <span className="font-semibold text-slate-900">{currentUser.name || 'کاربر'}</span></p>

                  {verificationPhase === 'loading' && <p role="status" className="text-slate-500">در حال بررسی وضعیت تأیید ایمیل…</p>}
                  {verificationPhase === 'error' && (
                    <div role="alert" className="space-y-2">
                      <p>بررسی وضعیت ایمیل انجام نشد.</p>
                      <button type="button" onClick={loadVerification} className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold hover:bg-slate-50">تلاش دوباره</button>
                    </div>
                  )}

                  {verification && !verification.email_verified && (
                    <div className="space-y-3 rounded-xl bg-amber-50 p-4 text-amber-900">
                      <p className="font-semibold">تأیید ایمیل لازم است.</p>
                      <p>پذیرش دعوت فقط با حسابی ممکن است که نشانی ایمیل تأییدشده‌اش همان نشانی گیرندهٔ دعوت باشد. نشانی را وارد کنید تا پیوند تأیید برایتان ایمیل شود؛ سپس از همان ایمیل، تأیید را کامل کنید و به این صفحه برگردید.</p>
                      {emailSent ? (
                        <div className="space-y-2">
                          <p role="status">ایمیل تأیید ارسال شد. صندوق ورودی (و پوشهٔ هرزنامه) را بررسی کنید؛ پیوند تا ۳۰ دقیقه معتبر است.</p>
                          <button type="button" onClick={loadVerification} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-900 hover:bg-amber-100">تأیید کردم؛ بررسی دوباره</button>
                        </div>
                      ) : (
                        <form onSubmit={requestVerification} className="space-y-2">
                          <label htmlFor="invite-email" className="block font-medium">نشانی ایمیل</label>
                          <input id="invite-email" type="email" dir="ltr" autoComplete="email" value={emailInput} onChange={(event) => setEmailInput(event.target.value)} className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600" placeholder="name@example.com" />
                          {emailError && <p role="alert" className="text-red-700">{emailError}</p>}
                          <button type="submit" className="rounded-lg bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">ارسال پیوند تأیید</button>
                        </form>
                      )}
                    </div>
                  )}

                  {verification?.email_verified && (
                    <div className="space-y-3">
                      <p className="rounded-xl bg-emerald-50 p-3 text-emerald-900">ایمیل حساب شما تأیید شده است: <span dir="ltr" className="font-medium">{verification.email}</span></p>
                      {acceptError && (
                        <div role="alert" className="space-y-2 rounded-xl bg-red-50 p-3 text-red-800">
                          <p>{acceptError}</p>
                          {acceptError.includes('مطابقت ندارد') && (
                            <button type="button" onClick={switchAccount} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 font-bold text-red-800 hover:bg-red-100">خروج و ورود با حساب دیگر</button>
                          )}
                        </div>
                      )}
                      <button type="button" disabled={accepting} onClick={accept} aria-disabled={accepting} className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                        {accepting ? 'در حال پذیرش…' : 'پذیرش دعوت'}
                      </button>
                      <p className="text-xs text-slate-500">با زدن این دکمه، عضویت‌های مشخص‌شده در بالا برای حساب شما ایجاد می‌شود. این کار فقط یک‌بار انجام می‌شود.</p>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {accepted && (
            <div role="status" className="mt-6 space-y-4 text-sm leading-7">
              <p className="font-semibold text-emerald-700">دعوت با موفقیت پذیرفته شد.</p>
              <p>{accepted.created_organization_membership || accepted.created_workspace_membership
                ? 'عضویت‌های شما ایجاد شد. خوش آمدید!'
                : 'عضویت شما تأیید شد. خوش آمدید!'}</p>
              <button type="button" onClick={() => navigate(postAcceptancePath(accepted.navigation_target), { replace: true })} className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">ورود به سامانه</button>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">پیوند این صفحه محرمانه است؛ آن را با دیگران به اشتراک نگذارید.</p>
      </main>
    </div>
  );
}
