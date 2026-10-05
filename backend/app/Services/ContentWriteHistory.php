<?php

namespace App\Services;

use App\Models\Content;
use App\Models\User;
use Illuminate\Support\Str;

/** Keep legacy history, but never accept a new actor/time audit entry from a client. */
final class ContentWriteHistory
{
    public function apply(User $actor, array $input, ?Content $content): array
    {
        if (array_key_exists('targetAudiences', $input)) {
            $input['targetAudiences'] = collect((array) $input['targetAudiences'])
                ->filter(fn ($item) => is_string($item))->map(fn ($item) => mb_substr(trim($item), 0, 80))
                ->filter()->unique()->take(30)->values()->all();
            // Preserve the old singular contract for older detail views, API
            // filters and exports while making the array authoritative.
            $input['targetAudience'] = $input['targetAudiences'][0] ?? null;
        }
        $event = ['id' => (string) Str::uuid(), 'userId' => (string) $actor->id, 'userName' => $actor->name,
            'action' => $content ? 'ویرایش پروندهٔ محتوا' : 'ایجاد پروندهٔ محتوا', 'timestamp' => now()->toIso8601String()];
        $input['history'] = [...($content?->payload['history'] ?? []), $event];
        if (isset($input['stages'])) {
            $old = collect($content?->payload['stages'] ?? [])->keyBy('id');
            $input['stages'] = array_map(function ($stage) use ($old, $event) {
                $before = $old->get($stage['id'], []);
                $history = $before['activityLog'] ?? [];
                $compare = fn ($s) => array_diff_key($s, ['activityLog' => true]);
                $stage['activityLog'] = $compare($before) != $compare($stage) ? [...$history, $event] : $history;

                return $stage;
            }, $input['stages']);
        }

        return $input;
    }
}
