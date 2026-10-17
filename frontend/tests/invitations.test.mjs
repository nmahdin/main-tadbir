import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptanceErrorMessage,
  buildAcceptPayload,
  buildVerificationConfirmPayload,
  cleanedSearch,
  cleanedUrl,
  extractSecretParam,
  invitationAdminErrorMessage,
  invitationMessageValid,
  invitationStatusKind,
  postAcceptancePath,
  validateInviteeEmail,
} from '../src/invitations/invitationLogic.ts';
import {
  clearInvitationToken,
  clearVerificationChallenge,
  currentInvitationToken,
  currentVerificationChallenge,
  rememberInvitationToken,
  rememberVerificationChallenge,
} from '../src/invitations/invitationSession.ts';

test('token extraction is bounded and exact', () => {
  assert.equal(extractSecretParam('?token=abc123'), 'abc123');
  assert.equal(extractSecretParam('?other=1&token=xyz'), 'xyz');
  assert.equal(extractSecretParam('?token='), null);
  assert.equal(extractSecretParam(''), null);
  assert.equal(extractSecretParam(`?token=${'a'.repeat(513)}`), null);
  assert.equal(extractSecretParam('?email=a%40b.co', 'email'), 'a@b.co');
});

test('URL cleaning removes secrets but preserves the rest', () => {
  assert.equal(cleanedSearch('?token=secret&foo=bar'), '?foo=bar');
  assert.equal(cleanedSearch('?token=secret'), '');
  assert.equal(cleanedUrl('/invitations/accept', '?token=secret&foo=bar'), '/invitations/accept?foo=bar');
  assert.equal(cleanedUrl('/verify-email', '?token=s&email=a%40b.co', ['token', 'email']), '/verify-email');
  // The cleaned URL never contains the secret.
  assert.ok(!cleanedUrl('/invitations/accept', '?token=TOPSECRET').includes('TOPSECRET'));
});

test('request payloads are token-only (no actor/role/scope overrides possible)', () => {
  assert.deepEqual(Object.keys(buildAcceptPayload('tkn')), ['token']);
  assert.deepEqual(buildAcceptPayload('tkn'), { token: 'tkn' });
  assert.deepEqual(Object.keys(buildVerificationConfirmPayload('tkn')), ['token']);
});

test('in-memory session keeps secrets only until cleared', () => {
  clearInvitationToken();
  assert.equal(currentInvitationToken(), null);
  rememberInvitationToken('  abc  ');
  assert.equal(currentInvitationToken(), 'abc');
  rememberInvitationToken('');
  assert.equal(currentInvitationToken(), null);
  rememberInvitationToken('zzz');
  clearInvitationToken();
  assert.equal(currentInvitationToken(), null);

  rememberVerificationChallenge('vt', 'a@b.co');
  assert.deepEqual(currentVerificationChallenge(), { token: 'vt', email: 'a@b.co' });
  clearVerificationChallenge();
  assert.deepEqual(currentVerificationChallenge(), { token: null, email: null });
});

test('status mapping covers every preview state', () => {
  assert.equal(invitationStatusKind('pending'), 'pending');
  assert.equal(invitationStatusKind('expired'), 'expired');
  assert.equal(invitationStatusKind('revoked'), 'revoked');
  assert.equal(invitationStatusKind('accepted'), 'accepted');
  assert.equal(invitationStatusKind('something-else'), 'unknown');
  assert.equal(invitationStatusKind(null), 'unknown');
});

test('acceptance messages are stable, safe, and non-enumerating', () => {
  for (const code of [
    'invitation_email_mismatch',
    'invitation_expired',
    'invitation_revoked',
    'invitation_already_accepted',
    'invitation_organization_unavailable',
    'invitation_prerequisite_missing',
    'invitation_membership_conflict',
    'invitation_inviter_authority_lost',
    'invitation_grant_ceiling',
    'invitation_not_found',
  ]) {
    const message = acceptanceErrorMessage(code);
    assert.ok(message.length > 10, code);
    assert.ok(!message.includes('token'), code);
    assert.ok(!message.includes('@'), code);
  }
  assert.ok(acceptanceErrorMessage(null, 429).length > 5);
  assert.ok(acceptanceErrorMessage('unknown_code', 500).length > 5);
});

test('admin messages and validation bounds', () => {
  assert.ok(invitationAdminErrorMessage('invitation_duplicate_pending').includes('لغو'));
  assert.ok(invitationAdminErrorMessage('invitation_grant_ceiling').length > 5);
  assert.equal(validateInviteeEmail('a@b.co'), true);
  assert.equal(validateInviteeEmail('  a@b.co  '), true);
  assert.equal(validateInviteeEmail('not-an-email'), false);
  assert.equal(validateInviteeEmail('a@b'), false);
  assert.equal(validateInviteeEmail(''), false);
  assert.equal(invitationMessageValid('x'.repeat(1000)), true);
  assert.equal(invitationMessageValid('x'.repeat(1001)), false);
});

test('post-acceptance navigation never embeds the token', () => {
  const path = postAcceptancePath({ type: 'workspace', id: 42 });
  assert.equal(path, '/dashboard');
  assert.ok(!path.includes('token'));
  assert.equal(postAcceptancePath(null), '/dashboard');
});
