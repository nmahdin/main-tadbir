<?php

namespace App\Services;

use App\Models\WorkspaceRecord;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;

final class GoogleMeetService
{
    /** @return array{meetLink:string,eventId:string,calendarLink:?string} */
    public function createFor(WorkspaceRecord $meeting): array
    {
        $payload = $meeting->payload ?? [];
        $title = trim((string) ($meeting->title ?: ($payload['title'] ?? '')));
        $date = $this->asciiDigits((string) ($payload['date'] ?? ''));
        $time = $this->asciiDigits((string) ($payload['time'] ?? ''));
        $duration = max(15, $this->durationMinutes((string) ($payload['duration'] ?? '60')));

        $dateMatches = [];
        $timeMatches = [];
        $validDate = preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $dateMatches) === 1
            && checkdate((int) $dateMatches[2], (int) $dateMatches[3], (int) $dateMatches[1]);
        $validTime = preg_match('/^(\d{1,2}):(\d{2})$/', $time, $timeMatches) === 1
            && (int) $timeMatches[1] <= 23
            && (int) $timeMatches[2] <= 59;
        if ($title === '' || ! $validDate || ! $validTime) {
            throw ValidationException::withMessages([
                'meeting' => 'برای ایجاد Google Meet، عنوان، تاریخ و ساعت معتبر جلسه را ثبت کنید.',
            ]);
        }

        $timezone = (string) config('google_calendar.timezone', 'Asia/Tehran');
        $normalizedTime = sprintf('%02d:%02d', (int) $timeMatches[1], (int) $timeMatches[2]);
        try {
            $start = CarbonImmutable::createFromFormat('!Y-m-d H:i', "{$date} {$normalizedTime}", $timezone);
        } catch (\Throwable) {
            throw ValidationException::withMessages(['meeting' => 'تاریخ یا ساعت جلسه معتبر نیست.']);
        }
        if ($start === false) {
            throw ValidationException::withMessages(['meeting' => 'تاریخ یا ساعت جلسه معتبر نیست.']);
        }

        $calendarId = trim((string) config('google_calendar.calendar_id', 'primary')) ?: 'primary';
        $response = $this->client()->post(
            'https://www.googleapis.com/calendar/v3/calendars/'.rawurlencode($calendarId).'/events',
            [
                'summary' => $title,
                'description' => trim((string) ($payload['description'] ?? '')),
                'start' => ['dateTime' => $start->toRfc3339String(), 'timeZone' => $timezone],
                'end' => ['dateTime' => $start->addMinutes($duration)->toRfc3339String(), 'timeZone' => $timezone],
                'conferenceData' => [
                    'createRequest' => [
                        'requestId' => (string) Str::uuid(),
                        'conferenceSolutionKey' => ['type' => 'hangoutsMeet'],
                    ],
                ],
            ],
        )->throw()->json();

        $meetLink = (string) ($response['hangoutLink'] ?? collect($response['conferenceData']['entryPoints'] ?? [])->firstWhere('entryPointType', 'video')['uri'] ?? '');
        if ($meetLink === '') {
            throw new RuntimeException('Google Calendar did not return a Meet link.');
        }

        return [
            'meetLink' => $meetLink,
            'eventId' => (string) ($response['id'] ?? ''),
            'calendarLink' => isset($response['htmlLink']) ? (string) $response['htmlLink'] : null,
        ];
    }

    private function client(): PendingRequest
    {
        $token = trim((string) config('google_calendar.access_token'));
        if ($token === '') {
            $credentials = $this->credentials();
            if ($credentials === null) {
                throw ValidationException::withMessages([
                    'googleMeet' => 'اتصال Google Calendar هنوز در تنظیمات سرور پیکربندی نشده است.',
                ]);
            }
            $token = $this->serviceAccountToken($credentials);
        }

        return Http::acceptJson()
            ->withToken($token)
            ->timeout(20)
            // Event creation is not safely retryable: a lost response could
            // otherwise create duplicate calendar events and Meet rooms.
            ->withQueryParameters([
                'conferenceDataVersion' => 1,
                'sendUpdates' => (string) config('google_calendar.send_updates', 'none'),
            ]);
    }

    /** @return array<string, mixed>|null */
    private function credentials(): ?array
    {
        $path = trim((string) config('google_calendar.credentials_path'));
        $raw = $path !== '' && is_readable($path) ? file_get_contents($path) : config('google_calendar.credentials_json');
        if (! is_string($raw) || trim($raw) === '') {
            return null;
        }

        $decoded = json_decode($raw, true);
        if (! is_array($decoded)) {
            $base64 = base64_decode($raw, true);
            $decoded = is_string($base64) ? json_decode($base64, true) : null;
        }

        return is_array($decoded) ? $decoded : null;
    }

    /** @param array<string, mixed> $credentials */
    private function serviceAccountToken(array $credentials): string
    {
        $email = (string) ($credentials['client_email'] ?? '');
        $privateKey = str_replace('\\n', "\n", (string) ($credentials['private_key'] ?? ''));
        $tokenUri = (string) ($credentials['token_uri'] ?? 'https://oauth2.googleapis.com/token');
        if ($email === '' || $privateKey === '') {
            throw ValidationException::withMessages(['googleMeet' => 'اعتبارنامه Google Calendar ناقص است.']);
        }

        $now = time();
        $claims = [
            'iss' => $email,
            'scope' => 'https://www.googleapis.com/auth/calendar.events',
            'aud' => $tokenUri,
            'iat' => $now,
            'exp' => $now + 3600,
        ];
        $delegatedUser = trim((string) config('google_calendar.delegated_user'));
        if ($delegatedUser !== '') {
            $claims['sub'] = $delegatedUser;
        }
        $unsigned = $this->base64Url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR))
            .'.'.$this->base64Url(json_encode($claims, JSON_THROW_ON_ERROR));
        if (! openssl_sign($unsigned, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
            throw ValidationException::withMessages(['googleMeet' => 'امضای اعتبارنامه Google Calendar ناموفق بود.']);
        }

        $assertion = $unsigned.'.'.$this->base64Url($signature);
        $response = Http::asForm()->acceptJson()->timeout(15)->post($tokenUri, [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $assertion,
        ])->throw()->json();
        $token = (string) ($response['access_token'] ?? '');
        if ($token === '') {
            throw new RuntimeException('Google OAuth did not return an access token.');
        }

        return $token;
    }

    private function durationMinutes(string $duration): int
    {
        $normalized = $this->asciiDigits($duration);
        preg_match('/\d+/', $normalized, $matches);

        return isset($matches[0]) ? (int) $matches[0] : 60;
    }

    private function asciiDigits(string $value): string
    {
        return strtr(trim($value), [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
