<?php

namespace App\Services;

use App\Models\SystemSetting;
use App\Models\WorkspaceRecord;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;

final class GoogleMeetService
{
    public function __construct(private readonly GoogleWorkspaceClient $google) {}

    /**
     * Report only whether usable server credentials exist. No secret, token,
     * credential path or provider response is returned to clients.
     *
     * @return array{serverConfigured:bool,connectionMessage:string}
     */
    public function connectionStatus(): array
    {
        return $this->google->connectionStatus();
    }

    /** @return array{meetLink:string,eventId:string,calendarLink:?string} */
    public function createFor(WorkspaceRecord $meeting): array
    {
        $payload = $meeting->payload ?? [];
        $settings = $this->settings();
        if (! ($settings['enabled'] ?? true)) {
            throw ValidationException::withMessages(['googleMeet' => 'ایجاد Google Meet در تنظیمات سامانه غیرفعال است.']);
        }
        $title = trim((string) ($meeting->title ?: ($payload['title'] ?? '')));
        $date = $this->asciiDigits((string) ($payload['date'] ?? ''));
        $time = $this->asciiDigits((string) ($payload['time'] ?? ''));
        $duration = max(15, $this->durationMinutes((string) ($payload['duration'] ?? $settings['defaultDurationMinutes'] ?? 60)));

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

        $timezone = (string) ($settings['timezone'] ?? config('google_calendar.timezone', 'Asia/Tehran'));
        $normalizedTime = sprintf('%02d:%02d', (int) $timeMatches[1], (int) $timeMatches[2]);
        try {
            $start = CarbonImmutable::createFromFormat('!Y-m-d H:i', "{$date} {$normalizedTime}", $timezone);
        } catch (\Throwable) {
            throw ValidationException::withMessages(['meeting' => 'تاریخ یا ساعت جلسه معتبر نیست.']);
        }
        if ($start === false) {
            throw ValidationException::withMessages(['meeting' => 'تاریخ یا ساعت جلسه معتبر نیست.']);
        }

        $calendarId = trim((string) ($settings['calendarId'] ?? config('google_calendar.calendar_id', 'primary'))) ?: 'primary';
        $response = $this->google
            ->authorized([GoogleWorkspaceClient::CALENDAR_EVENTS_SCOPE], (string) ($settings['delegatedUser'] ?? ''))
            // Event creation is intentionally not retried. A lost response could
            // otherwise create a duplicate Calendar event and Meet room.
            ->withQueryParameters([
                'conferenceDataVersion' => 1,
                'sendUpdates' => (string) ($settings['sendUpdates'] ?? config('google_calendar.send_updates', 'none')),
            ])
            ->post(
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

    /** @return array<string, mixed> */
    private function settings(): array
    {
        $defaults = [
            'enabled' => true,
            'calendarId' => (string) config('google_calendar.calendar_id', 'primary'),
            'delegatedUser' => (string) (config('google_workspace.delegated_user') ?: config('google_calendar.delegated_user', '')),
            'timezone' => (string) config('google_calendar.timezone', 'Asia/Tehran'),
            'sendUpdates' => (string) config('google_calendar.send_updates', 'none'),
            'defaultDurationMinutes' => 60,
        ];
        $stored = SystemSetting::query()->where('key', 'google_meet')->value('value');
        if (is_string($stored)) {
            $stored = json_decode($stored, true);
        }

        return is_array($stored) ? [...$defaults, ...$stored] : $defaults;
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
}
