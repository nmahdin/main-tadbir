@if ($recipientName)Hello {{ $recipientName }},

@endif
Please confirm this email address for your TADBIR account by opening this link:

{{ $verificationUrl }}

This link expires in {{ $expiresInMinutes }} minutes and can be used only once. If you did not request it, you can ignore this message.
