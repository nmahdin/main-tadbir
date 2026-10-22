/**
 * In-memory-only storage for invitation / email-verification
 * secrets (Stage C6-4).
 *
 * Bearer tokens arriving in emailed links are kept ONLY in module
 * memory for the current page session. They are never written to
 * localStorage, sessionStorage, cookies, analytics, or navigation
 * URLs. A full page reload intentionally loses them: the user
 * simply reopens the original emailed link (opening a link never
 * consumes anything).
 */

let invitationToken: string | null = null;
let verificationToken: string | null = null;
let verificationEmail: string | null = null;

export function rememberInvitationToken(token: string | null): void {
  invitationToken = token && token.trim() ? token.trim() : null;
}

export function currentInvitationToken(): string | null {
  return invitationToken;
}

export function clearInvitationToken(): void {
  invitationToken = null;
}

export function rememberVerificationChallenge(token: string | null, email: string | null): void {
  verificationToken = token && token.trim() ? token.trim() : null;
  verificationEmail = email && email.trim() ? email.trim() : null;
}

export function currentVerificationChallenge(): { token: string | null; email: string | null } {
  return { token: verificationToken, email: verificationEmail };
}

export function clearVerificationChallenge(): void {
  verificationToken = null;
  verificationEmail = null;
}
