{{ $inviterName }} has invited you to join TADBIR.
@if ($organizationName)
Organization: {{ $organizationName }}
@endif
@if ($workspaceName)
Workspace: {{ $workspaceName }}
@endif
@if ($message)

{{ $message }}
@endif

View and accept the invitation:
{{ $invitationUrl }}
@if ($expiresAt)

This invitation expires at {{ $expiresAt }} (UTC).
@endif

Accepting requires signing in with an account whose verified email address matches the address this message was sent to. If you were not expecting this invitation, you can ignore this message.
