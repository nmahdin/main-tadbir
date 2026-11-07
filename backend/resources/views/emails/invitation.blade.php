<!DOCTYPE html>
<html lang="en">
<body style="font-family: sans-serif; color: #1a1a1a;">
<p>{{ $inviterName }} has invited you to join TADBIR.</p>
@if ($organizationName)
<p>Organization: {{ $organizationName }}</p>
@endif
@if ($workspaceName)
<p>Workspace: {{ $workspaceName }}</p>
@endif
@if ($message)
<p>{{ $message }}</p>
@endif
<p><a href="{{ $invitationUrl }}">View and accept the invitation</a></p>
@if ($expiresAt)
<p>This invitation expires at {{ $expiresAt }} (UTC).</p>
@endif
<p>Accepting requires signing in with an account whose verified email address matches the address this message was sent to. If you were not expecting this invitation, you can ignore this message.</p>
</body>
</html>
