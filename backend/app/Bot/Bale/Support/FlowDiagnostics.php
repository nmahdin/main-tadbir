<?php

namespace App\Bot\Bale\Support;

use App\Models\BaleUserLink;
use Illuminate\Support\Facades\Log;

/**
 * Explicitly opt-in, content-free lifecycle traces for Bale bot forms.
 *
 * Never log message text, callback payloads, file paths, chat IDs,
 * bot credentials, encrypted drafts, or session nonces. Use warning level
 * deliberately: the usual production LOG_LEVEL=warning will still show it.
 */
final class FlowDiagnostics
{
    public static function trace(string $event, ?BaleUserLink $link, array $details = []): void
    {
        if (! config('bale.flow_diagnostics', false)) {
            return;
        }

        $safe = [];
        foreach ($details as $key => $value) {
            if (in_array($key, ['update_id', 'field_index', 'fields_completed', 'expires_in_seconds', 'removed_sessions'], true)
                && is_int($value)) {
                $safe[$key] = $value;
            } elseif (in_array($key, ['session_present', 'recovered', 'checkpoint_present', 'has_file'], true)
                && is_bool($value)) {
                $safe[$key] = $value;
            } elseif (in_array($key, ['step', 'step_before', 'step_after'], true)
                && is_string($value) && preg_match('/^[a-z_]{1,40}$/D', $value)) {
                $safe[$key] = $value;
            } elseif ($key === 'kind' && in_array($value, ['text', 'callback', 'file', 'other'], true)) {
                $safe[$key] = $value;
            } elseif ($key === 'decision' && in_array($value, [
                'existing', 'restored', 'no_session', 'expired', 'no_checkpoint',
                'invalid_checkpoint', 'not_found', 'blocked', 'discarded', 'saved',
            ], true)) {
                $safe[$key] = $value;
            }
        }

        $safe['event'] = $event;
        if ($link) {
            $safe['conversation_ref'] = substr(hash_hmac(
                'sha256', (string) $link->id, (string) config('app.key')
            ), 0, 12);
        }

        Log::warning('bale_flow_trace', $safe);
    }
}
