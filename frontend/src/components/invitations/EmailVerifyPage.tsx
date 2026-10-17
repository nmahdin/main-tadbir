import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { invitationsApi } from '../../api/invitations';
import { apiErrorCode, cleanedUrl, extractSecretParam } from '../../invitations/invitationLogic';
import {
  clearVerificationChallenge,
  currentInvitationToken,
  currentVerificationChallenge,
  rememberVerificationChallenge,
} from '../../invitations/invitationSession';
import { ApiError } from '../../api/errors';

/**
 * Stage C6-4 — email-verification continuation page
 * (/verify-email?token=...&email=...).
 *
 * The challenge token is moved into module memory and stripped
 * from the address bar on mount. Confirmation is an explicit
 * button click (never automatic on load), authenticated, and
 * token-only. After success the user returns to the invitation
 * page when an invitation flow is in progress in this tab.
 */
export function EmailVerifyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, isSessionLoading } = useAuth();

  const [phase, setPhase] = React.useState<'ready' | 'missing' | 'confirming' | 'done' | 'failed'>('ready');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const confirmingRef = React.useRef(false);

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

  React.useEffect(() => {
    const token = extractSecretParam(location.search);
    const email = extractSecretParam(location.search, 'email');
    if (token) {
      rememberVerificationChallenge(token, email);
      window.history.replaceState(null, '', cleanedUrl(window.location.pathname, location.search, ['token', 'email']));
    }
    if (!token && !currentVerificationChallenge().token) setPhase('missing');
    // Runs once on mount; the URL is already cleaned afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async () => {
    const { token } = currentVerificationChallenge();
    if (!token || confirmingRef.current) return;
    confirmingRef.current = true;
    setPhase('confirming');
    setErrorMessage(null);
    try {
      await invitationsApi.confirmEmailVerification(token);
      clearVerificationChallenge();
      setPhase('done');
    } catch (error) {
      const code = apiErrorCode(error);
      setErrorMessage(code === 'email_verification_expired'
        ? 'مهلت این پیوند تأیید به پایان رسیده است. از صفحهٔ دعوت یا حساب خود، پیوند تازه‌ای درخواست کنید.'
        : code === 'email_already_claimed'
          ? 'این نشانی ایمیل به حساب دیگری تعلق دارد.'
          : 'این پیوند تأیید معتبر نیست یا قبلاً استفاده شده است. تازه‌ترین ایمیل تأیید را باز کنید.');
      setPhase('failed');
      if (error instanceof ApiError && error.status === 401) setPhase('ready');
    } finally {
      confirmingRef.current = false;
    }
  };

  const challenge = currentVerificationChallenge();
  const hasInvitationFlow = currentInvitationToken() !== null;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800">
      <main className="mx-auto w-full max-w-xl" aria-label="تأیید ایمیل">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">تأیید نشانی ایمیل</h1>

          {phase === 'missing' && (
            <div role="alert" className="mt-6 space-y-3 text-sm leading-7">
              <p className="font-semibold text-slate-900">پیوند تأیید یافت نشد.</p>
              <p>این صفحه باید از پیوند داخل ایمیل تأیید باز شود. اگر ایمیل را در دستگاه دیگری باز کرده‌اید، همان پیوند را در همین مرورگر باز کنید.</p>
            </div>
          )}

          {phase !== 'missing' && isSessionLoading && (
            <p role="status" className="mt-6 text-sm text-slate-500">در حال بررسی نشست…</p>
          )}

          {phase !== 'missing' && !isSessionLoading && !isLoggedIn && (
            <div className="mt-6 space-y-3 text-sm leading-7">
              <p>برای تأیید ایمیل، ابتدا وارد همان حسابی شوید که با آن درخواست تأیید داده‌اید. تأیید فقط پس از ورود و با زدن دکمهٔ تأیید انجام می‌شود.</p>
              <button type="button" onClick={() => navigate('/login', { state: { from: '/verify-email' } })} className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">ورود یا ثبت‌نام</button>
            </div>
          )}

          {phase !== 'missing' && !isSessionLoading && isLoggedIn && phase !== 'done' && (
            <div className="mt-6 space-y-4 text-sm leading-7">
              {challenge.email && <p>نشانی در حال تأیید: <span dir="ltr" className="font-medium">{challenge.email}</span></p>}
              <p>با زدن دکمهٔ زیر، مالکیت این نشانی برای حساب شما تأیید می‌شود. این پیوند یک‌بارمصرف است.</p>
              {errorMessage && phase === 'failed' && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{errorMessage}</p>}
              <button type="button" disabled={phase === 'confirming'} onClick={confirm} aria-disabled={phase === 'confirming'} className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                {phase === 'confirming' ? 'در حال تأیید…' : 'تأیید ایمیل'}
              </button>
            </div>
          )}

          {phase === 'done' && (
            <div role="status" className="mt-6 space-y-4 text-sm leading-7">
              <p className="font-semibold text-emerald-700">ایمیل شما تأیید شد.</p>
              {hasInvitationFlow ? (
                <>
                  <p>اکنون می‌توانید پذیرش دعوت را کامل کنید.</p>
                  <button type="button" onClick={() => navigate('/invitations/accept', { replace: true })} className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">ادامهٔ پذیرش دعوت</button>
                </>
              ) : (
                <>
                  <p>اگر این تأیید را از صفحهٔ دعوت آغاز کرده‌اید، به همان صفحه برگردید و «بررسی دوباره» را بزنید؛ یا پیوند دعوت را دوباره باز کنید — باز کردن پیوند، دعوت را مصرف نمی‌کند.</p>
                  <button type="button" onClick={() => navigate('/dashboard', { replace: true })} className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">ورود به سامانه</button>
                </>
              )}
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">پیوند این صفحه محرمانه است؛ آن را با دیگران به اشتراک نگذارید.</p>
      </main>
    </div>
  );
}
