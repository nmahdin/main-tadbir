<!DOCTYPE html>
<html lang="en">
<body style="font-family: sans-serif; color: #1a1a1a;">
@if ($recipientName)
<p>Hello {{ $recipientName }},</p>
@endif
<p>Please confirm this email address for your TADBIR account by opening the link below:</p>
<p><a href="{{ $verificationUrl }}">Verify my email address</a></p>
<p>This link expires in {{ $expiresInMinutes }} minutes and can be used only once. If you did not request it, you can ignore this message.</p>
</body>
</html>
