import { initSanctum, request } from '../../shared/api/client';

export interface AuthMessage { message: string; code?: string; next?: string }

/** AUTH-EXT-01 public + account-security API (SPEC §8). */
export const authExtApi = {
  async confirmEmail(token: string) { await initSanctum(); return request<AuthMessage>('/auth/email/confirm', { method: 'POST', body: { token } }); },
  async forgotPassword(email: string) { await initSanctum(); return request<AuthMessage>('/auth/password/forgot', { method: 'POST', body: { email } }); },
  async resetPassword(payload: { email: string; token: string; password: string; password_confirmation: string }) { await initSanctum(); return request<AuthMessage>('/auth/password/reset', { method: 'POST', body: payload }); },
  async otpChallenge(phone: string) { await initSanctum(); return request<AuthMessage & { expires_in?: number }>('/auth/otp/challenge', { method: 'POST', body: { phone } }); },
  async otpLogin(phone: string, code: string) { await initSanctum(); return request<AuthMessage>('/auth/otp/login', { method: 'POST', body: { phone, code } }); },
  async completeStepUp() { await initSanctum(); return request<AuthMessage>('/auth/step-up', { method: 'POST', body: {} }); },
  googleRedirectUrl() { return '/api/v1/auth/google/redirect'; },
  reauthenticate(password: string) { return request<AuthMessage>('/account/reauthenticate', { method: 'POST', body: { password } }); },
  changePassword(payload: { current_password: string; password: string; password_confirmation: string }) { return request<AuthMessage>('/account/security/password', { method: 'POST', body: payload }); },
  changeEmail(email: string) { return request<AuthMessage>('/account/security/email', { method: 'POST', body: { email } }); },
  confirmEmailChange(token: string) { return request<AuthMessage>('/account/security/email/confirm', { method: 'POST', body: { token } }); },
  changeMobile(phone: string) { return request<AuthMessage>('/account/security/mobile', { method: 'POST', body: { phone } }); },
  confirmMobile(phone: string, code: string) { return request<AuthMessage>('/account/security/mobile/confirm', { method: 'POST', body: { phone, code } }); },
  sessions() { return request<{ sessions: Array<Record<string, unknown>> }>('/account/sessions'); },
  revokeSession(id: string | number) { return request<AuthMessage>(`/account/sessions/${id}`, { method: 'DELETE' }); },
  revokeOtherSessions() { return request<AuthMessage>('/account/sessions/revoke-others', { method: 'POST', body: {} }); },
  requestDeletion(password: string) { return request<AuthMessage & { deletion_at?: string }>('/account/deletion-request', { method: 'POST', body: { password } }); },
  cancelDeletion() { return request<AuthMessage>('/account/deletion-request/cancel', { method: 'POST', body: {} }); },
  deletionStatus() { return request<{ pending: boolean; deletion_at: string | null }>('/account/deletion-status'); },
  welcomeState() { return request<{ welcomed: boolean; invitations: number; personal_workspace: boolean }>('/account/welcome'); },
  welcomeComplete() { return request<AuthMessage>('/account/welcome/complete', { method: 'POST', body: {} }); },
};

export function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return fallback;
}
