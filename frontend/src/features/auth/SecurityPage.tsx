import React, { useCallback, useEffect, useState } from 'react';
import { authErrorMessage, authExtApi } from './api';
import { PublicAuthShell } from './AuthPages';

const inputClassName = 'w-full rounded-lg border border-[#dbe7ec] bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39677C]';
const buttonClassName = 'rounded-lg bg-[#39677C] px-4 py-2 text-sm font-bold text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39677C] focus-visible:ring-offset-2';

/**
 * Account & security settings (AUTH-EXT-01 A04–A07). Sensitive operations
 * require a fresh reauthentication first; deletion (A08) shows the Persian
 * pending date and cancellation state per AMB-05=A.
 */
export default function SecurityPage() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthenticated, setReauthenticated] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [mobileCode, setMobileCode] = useState('');
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([]);
  const [deletion, setDeletion] = useState<{ pending: boolean; deletion_at: string | null }>({ pending: false, deletion_at: null });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const report = (fn: () => Promise<{ message: string }>) => async () => {
    setError(''); setMessage('');
    try { setMessage((await fn()).message); } catch (e) { setError(authErrorMessage(e, 'انجام عملیات ناموفق بود.')); }
  };
  const refresh = useCallback(() => {
    authExtApi.sessions().then((r) => setSessions(r.sessions)).catch(() => setSessions([]));
    authExtApi.deletionStatus().then(setDeletion).catch(() => undefined);
  }, []);
  useEffect(refresh, [refresh]);

  return (
    <PublicAuthShell title="حساب و امنیت">
      <div className="space-y-6" data-account-security>
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}

        <section aria-label="تأیید هویت دوباره" className="space-y-3 border-b border-[#eef3f6] pb-5">
          <h2 className="font-bold">تأیید هویت دوباره</h2>
          <p className="text-xs text-slate-600">عملیات حساس (تغییر رمز، ایمیل، موبایل و حذف حساب) به تأیید تازه رمز عبور نیاز دارند.</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void report(async () => { const r = await authExtApi.reauthenticate(reauthPassword); setReauthenticated(true); return r; })(); }}>
            <input dir="ltr" aria-label="رمز عبور فعلی" className={inputClassName} type="password" value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} />
            <button className={buttonClassName} type="submit">تأیید</button>
          </form>
          {reauthenticated && <p className="text-xs text-emerald-700">هویت شما برای عملیات حساس تأیید شد.</p>}
        </section>

        <section aria-label="تغییر رمز عبور" className="space-y-3 border-b border-[#eef3f6] pb-5">
          <h2 className="font-bold">تغییر رمز عبور</h2>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void report(() => authExtApi.changePassword({ current_password: currentPassword, password: newPassword, password_confirmation: newPasswordConfirmation }))(); }}>
            <input dir="ltr" aria-label="رمز عبور فعلی" className={inputClassName} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <input dir="ltr" aria-label="رمز عبور جدید" className={inputClassName} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <input dir="ltr" aria-label="تکرار رمز عبور جدید" className={inputClassName} type="password" value={newPasswordConfirmation} onChange={(e) => setNewPasswordConfirmation(e.target.value)} />
            <button className={buttonClassName} type="submit">تغییر رمز عبور</button>
          </form>
        </section>

        <section aria-label="ایمیل و موبایل" className="space-y-3 border-b border-[#eef3f6] pb-5">
          <h2 className="font-bold">ایمیل و موبایل تأییدشده</h2>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void report(() => authExtApi.changeEmail(email))(); }}>
            <input dir="ltr" aria-label="ایمیل جدید" className={inputClassName} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className={buttonClassName} type="submit">تغییر ایمیل</button>
          </form>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void report(() => authExtApi.changeMobile(mobile))(); }}>
            <input dir="ltr" aria-label="شماره موبایل جدید" className={inputClassName} inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            <button className={buttonClassName} type="submit">ارسال کد</button>
          </form>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void report(() => authExtApi.confirmMobile(mobile, mobileCode))(); }}>
            <input dir="ltr" aria-label="کد تأیید موبایل" className={inputClassName} inputMode="numeric" value={mobileCode} onChange={(e) => setMobileCode(e.target.value)} />
            <button className={buttonClassName} type="submit">تأیید موبایل</button>
          </form>
          <p className="text-xs text-slate-600">شناسهٔ تأییدنشده هرگز برای ورود یا بازیابی استفاده نمی‌شود.</p>
        </section>

        <section aria-label="نشست‌ها و دستگاه‌ها" className="space-y-3 border-b border-[#eef3f6] pb-5">
          <h2 className="font-bold">نشست‌ها و دستگاه‌ها</h2>
          <ul className="space-y-2 text-sm">
            {sessions.map((session) => (
              <li key={String(session.id)} className="flex items-center justify-between gap-2">
                <span>{String(session.device_label ?? 'دستگاه')} — {String(session.last_active ?? '')}</span>
                <button type="button" className="text-rose-700 font-bold" onClick={() => void report(() => authExtApi.revokeSession(String(session.id)))()}>پایان نشست</button>
              </li>
            ))}
            {sessions.length === 0 && <li className="text-slate-500">نشست فعالی یافت نشد.</li>}
          </ul>
          <button type="button" className={buttonClassName} onClick={() => void report(() => authExtApi.revokeOtherSessions())()}>پایان همه نشست‌های دیگر</button>
          <a className={buttonClassName + ' inline-block'} href="/api/v1/auth/google/link">پیوند حساب گوگل</a>
        </section>

        <section aria-label="حذف حساب" className="space-y-3">
          <h2 className="font-bold text-rose-800">حذف حساب</h2>
          {deletion.pending ? (
            <div className="space-y-2">
              <p role="status" className="text-sm">حذف حساب برای تاریخ <span dir="ltr">{deletion.deletion_at}</span> زمان‌بندی شده است. در این بازه ورود محدود است و می‌توانید درخواست را لغو کنید.</p>
              <button type="button" className={buttonClassName} onClick={() => void report(() => authExtApi.cancelDeletion())()}>لغو درخواست حذف</button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-600">حذف حساب پس از ۱۴ روز نهایی می‌شود. سوابق سازمان‌های مشترک حذف نمی‌شوند.</p>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} /> درخواست حذف حساب را تأیید می‌کنم.</label>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void report(() => authExtApi.requestDeletion(deletePassword))(); }}>
                <input dir="ltr" aria-label="رمز عبور برای تأیید حذف" className={inputClassName} type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
                <button className={buttonClassName} type="submit" disabled={!confirmDelete}>ثبت درخواست حذف</button>
              </form>
            </div>
          )}
        </section>
      </div>
    </PublicAuthShell>
  );
}
