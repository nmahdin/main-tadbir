/**
 * Pure invitation-flow logic (Stage C6-4) — deliberately free of
 * DOM and network access so the security-sensitive decisions
 * (secret extraction, URL cleaning, payload shapes, status and
 * error mapping, navigation targets) are unit-testable.
 */

export const MAX_TOKEN_LENGTH = 512;

export function extractSecretParam(search: string, key = 'token'): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const value = params.get(key)?.trim();
  if (!value || value.length > MAX_TOKEN_LENGTH) return null;
  return value;
}

/**
 * Returns the URL search string with secret-bearing parameters
 * removed, so the token never stays in the address bar, browser
 * history, or any copied link. Non-secret params are preserved.
 */
export function cleanedSearch(search: string, secretKeys: string[] = ['token']): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const key of secretKeys) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

export function cleanedUrl(pathname: string, search: string, secretKeys: string[] = ['token']): string {
  return `${pathname}${cleanedSearch(search, secretKeys)}`;
}

/** The acceptance request body is token-only BY DESIGN. */
export function buildAcceptPayload(token: string): { token: string } {
  return { token };
}

/** The verification-confirm request body is token-only BY DESIGN. */
export function buildVerificationConfirmPayload(token: string): { token: string } {
  return { token };
}

export type InvitationStatusKind = 'pending' | 'expired' | 'revoked' | 'accepted' | 'unknown';

export function invitationStatusKind(status: string | null | undefined): InvitationStatusKind {
  switch (status) {
    case 'pending': return 'pending';
    case 'expired': return 'expired';
    case 'revoked': return 'revoked';
    case 'accepted': return 'accepted';
    default: return 'unknown';
  }
}

export function apiErrorCode(error: unknown): string | null {
  // Structural (not instanceof) so this module stays import-free
  // and unit-testable; ApiError carries the flat {code} payload.
  if (error && typeof error === 'object' && 'payload' in error) {
    const payload = (error as { payload?: unknown }).payload;
    if (payload && typeof payload === 'object' && 'code' in payload) {
      const code = (payload as { code?: unknown }).code;
      return typeof code === 'string' ? code : null;
    }
  }
  return null;
}

export function apiErrorStatus(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : 0;
  }
  return 0;
}

const ACCEPTANCE_MESSAGES: Record<string, string> = {
  invitation_email_mismatch: 'نشانی ایمیل تأییدشدهٔ حساب شما با گیرندهٔ این دعوت مطابقت ندارد. با حسابی وارد شوید که دعوت برای آن ارسال شده است، یا همان نشانی را در حساب خود تأیید کنید.',
  invitation_expired: 'مهلت این دعوت به پایان رسیده است. از دعوت‌کننده بخواهید دعوت تازه‌ای ارسال کند.',
  invitation_revoked: 'این دعوت لغو شده است و دیگر قابل پذیرش نیست.',
  invitation_already_accepted: 'این دعوت قبلاً پذیرفته شده است.',
  invitation_organization_unavailable: 'سازمان در حال حاضر فعال نیست و پذیرش دعوت ممکن نیست.',
  invitation_prerequisite_missing: 'برای پذیرش دعوت فضای کاری، ابتدا باید عضو سازمان باشید. دعوت سازمان را جداگانه بپذیرید یا از مدیر سازمان کمک بگیرید.',
  invitation_membership_conflict: 'عضویت فعلی شما با نقش تعیین‌شده در این دعوت سازگار نیست. برای حل آن با مدیر سازمان در تماس باشید.',
  invitation_inviter_authority_lost: 'اختیار صادرکنندهٔ این دعوت تغییر کرده است و پذیرش آن ممکن نیست. از دعوت‌کننده بخواهید دعوت تازه‌ای ارسال کند.',
  invitation_grant_ceiling: 'نقش تعیین‌شده در این دعوت دیگر در سقف اختیارات صادرکننده نیست. از دعوت‌کننده بخواهید دعوت تازه‌ای ارسال کند.',
  invitation_not_found: 'این پیوند دعوت معتبر نیست.',
};

export function acceptanceErrorMessage(code: string | null, status = 0): string {
  if (code && ACCEPTANCE_MESSAGES[code]) return ACCEPTANCE_MESSAGES[code];
  if (status === 401) return 'برای ادامه ابتدا وارد حساب خود شوید.';
  if (status === 429) return 'تعداد تلاش‌ها زیاد است. کمی بعد دوباره تلاش کنید.';
  if (status === 403) return 'پذیرش این دعوت برای حساب شما مجاز نیست.';
  return 'پذیرش دعوت انجام نشد. دوباره تلاش کنید؛ اگر مشکل ادامه داشت با دعوت‌کننده در تماس باشید.';
}

const ADMIN_MESSAGES: Record<string, string> = {
  invitation_forbidden: 'شما اختیار مدیریت دعوت‌ها در این محدوده را ندارید.',
  invitation_grant_ceiling: 'نقش انتخاب‌شده فراتر از سقف اختیارات شما در این محدوده است.',
  invitation_duplicate_pending: 'برای این نشانی و نقش، یک دعوت فعال از قبل وجود دارد. برای ارسال دوباره، ابتدا دعوت قبلی را لغو کنید.',
  invitation_organization_unavailable: 'سازمان فعال نیست و صدور دعوت ممکن نیست.',
  invitation_role_invalid: 'نقش انتخاب‌شده معتبر نیست.',
  invitation_role_scope_mismatch: 'نقش انتخاب‌شده متعلق به این محدوده نیست.',
  invitation_email_invalid: 'نشانی ایمیل معتبر نیست.',
  invitation_expiry_invalid: 'تاریخ انقضای دعوت معتبر نیست.',
};

export function invitationAdminErrorMessage(code: string | null, status = 0): string {
  if (code && ADMIN_MESSAGES[code]) return ADMIN_MESSAGES[code];
  if (status === 403) return 'شما مجوز انجام این عملیات را ندارید.';
  if (status === 404) return 'سازمان یا فضای کاری مورد نظر پیدا نشد.';
  if (status === 422) return 'اطلاعات واردشده معتبر نیست.';
  return 'عملیات انجام نشد. دوباره تلاش کنید.';
}

export interface NavigationTargetLike {
  type: 'organization' | 'workspace';
  id: number;
}

/**
 * Maps the backend's safe navigation target to an application
 * route. The legacy SPA has no Core scope pages yet, so both
 * targets land on the dashboard; the target is preserved in the
 * returned value for the day scope routes exist. The target never
 * contains (and is never combined with) the invitation token.
 */
export function postAcceptancePath(target: NavigationTargetLike | null | undefined): string {
  void target;
  return '/dashboard';
}

export function validateInviteeEmail(email: string): boolean {
  const value = email.trim();
  if (value.length < 3 || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function invitationMessageValid(message: string): boolean {
  return message.length <= 1000;
}

export function formatExpiry(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}
