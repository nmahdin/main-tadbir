<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Server-only authentication gateway shared by every Google Workspace API.
 * Credentials and access tokens are deliberately never exposed by this class.
 */
final class GoogleWorkspaceClient
{
    public const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

    public const DOCUMENTS_SCOPE = 'https://www.googleapis.com/auth/documents';

    public const SPREADSHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

    public const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

    public function configured(): bool
    {
        if ($this->accessToken() !== '') {
            return true;
        }

        $credentials = $this->credentials();

        return is_array($credentials)
            && trim((string) ($credentials['client_email'] ?? '')) !== ''
            && trim((string) ($credentials['private_key'] ?? '')) !== '';
    }

    /** @return array{serverConfigured:bool,connectionMessage:string} */
    public function connectionStatus(): array
    {
        $configured = $this->configured();

        return [
            'serverConfigured' => $configured,
            'connectionMessage' => $configured
                ? 'اتصال امن Google Workspace روی سرور آماده است.'
                : 'اتصال امن Google Workspace هنوز روی سرور آماده نشده است.',
        ];
    }

    /** @param list<string> $scopes */
    public function authorized(array $scopes, ?string $delegatedUser = null): PendingRequest
    {
        $token = $this->accessToken();
        if ($token === '') {
            $credentials = $this->credentials();
            if ($credentials === null) {
                throw ValidationException::withMessages([
                    'googleWorkspace' => 'اتصال Google Workspace هنوز روی سرور پیکربندی نشده است.',
                ]);
            }
            $token = $this->serviceAccountToken($credentials, array_values(array_unique($scopes)), $delegatedUser);
        }

        return Http::acceptJson()
            ->withToken($token)
            ->timeout(max(5, min(60, (int) config('google_workspace.request_timeout', 25))));
    }

    private function accessToken(): string
    {
        return trim((string) (config('google_workspace.access_token') ?: config('google_calendar.access_token')));
    }

    /** @return array<string, mixed>|null */
    private function credentials(): ?array
    {
        $path = trim((string) (config('google_workspace.credentials_path') ?: config('google_calendar.credentials_path')));
        $raw = $path !== '' && is_readable($path)
            ? file_get_contents($path)
            : (config('google_workspace.credentials_json') ?: config('google_calendar.credentials_json'));
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

    /** @param array<string, mixed> $credentials @param list<string> $scopes */
    private function serviceAccountToken(array $credentials, array $scopes, ?string $delegatedUser): string
    {
        $email = trim((string) ($credentials['client_email'] ?? ''));
        $privateKey = str_replace('\\n', "\n", (string) ($credentials['private_key'] ?? ''));
        $tokenUri = trim((string) ($credentials['token_uri'] ?? 'https://oauth2.googleapis.com/token'));
        if ($email === '' || $privateKey === '' || $scopes === []) {
            throw ValidationException::withMessages(['googleWorkspace' => 'اعتبارنامه Google Workspace ناقص است.']);
        }

        $now = time();
        $claims = [
            'iss' => $email,
            'scope' => implode(' ', $scopes),
            'aud' => $tokenUri,
            'iat' => $now,
            'exp' => $now + 3600,
        ];
        $delegatedUser = trim((string) ($delegatedUser ?: config('google_workspace.delegated_user') ?: config('google_calendar.delegated_user')));
        if ($delegatedUser !== '') {
            $claims['sub'] = $delegatedUser;
        }

        $unsigned = $this->base64Url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR))
            .'.'.$this->base64Url(json_encode($claims, JSON_THROW_ON_ERROR));
        if (! openssl_sign($unsigned, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
            throw ValidationException::withMessages(['googleWorkspace' => 'امضای اعتبارنامه Google Workspace ناموفق بود.']);
        }

        $response = Http::asForm()->acceptJson()->timeout(15)->post($tokenUri, [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $unsigned.'.'.$this->base64Url($signature),
        ])->throw()->json();
        $token = trim((string) ($response['access_token'] ?? ''));
        if ($token === '') {
            throw new RuntimeException('Google OAuth did not return an access token.');
        }

        return $token;
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
