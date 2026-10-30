<?php

namespace App\Bot\Bale;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;
use App\Bot\Bale\Notifications\NotificationAccess;
use App\Bot\Bale\Support\PanelLinks;
use App\Models\BaleOutbox;
use App\Models\BaleUserLink;
use App\Models\DamDataTable;
use App\Models\Department;
use App\Models\DomainRecord;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Services\DamTableAccess;
use App\Services\Access\UserPermissionGate;
use App\Services\Organization\DepartmentConsolidation;
use App\Services\TaskOperations;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

final class Outbox
{
    public function __construct(private Settings $settings, private BaleClient $client) {}

    public function enqueue(string $key, string $chatId, array $payload, ?BaleUserLink $link = null, ?string $subjectType = null, ?int $subjectId = null): BaleOutbox
    {
        return BaleOutbox::firstOrCreate(['deduplication_key' => $key], [
            'bot_id' => (string) $this->settings->read()['bot_id'], 'chat_id' => $chatId,
            'link_id' => $link?->id, 'requires_link' => $link !== null, 'payload' => $payload,
            'subject_type' => $subjectType, 'subject_id' => $subjectId, 'available_at' => now(),
        ]);
    }

    public function enqueueCallbackCleanup(string $key, string $chatId, int $messageId, BaleUserLink $link): BaleOutbox
    {
        return $this->enqueue($key, $chatId, [
            '_method' => 'deleteMessage',
            '_ui_cleanup' => true,
            'message_id' => $messageId,
        ], $link);
    }

    /** The caller holds the runtime lock. No automatic retry of ambiguous sends. */
    public function flush(float $deadline, ?array $onlyIds = null): int
    {
        $sent = 0;
        $notBefore = $this->settings->read()['send_not_before'] ?? null;
        if ($notBefore && now()->lt($notBefore)) {
            return 0;
        }
        BaleOutbox::where('status', 'sending')->where('updated_at', '<', now()->subMinutes(2))
            ->update(['status' => 'unknown', 'error_code' => 'worker_interrupted']);
        foreach (BaleOutbox::where('status', 'pending')->when($onlyIds !== null, fn ($q) => $q->whereIn('id', $onlyIds))->where('available_at', '<=', now())->orderBy('id')->limit(10)->get() as $message) {
            if (microtime(true) + config('bale.request_timeout') >= $deadline || ! $this->settings->ready()) {
                break;
            }
            // Do not replay a delayed main-menu screen after a newer response.
            // Other replies (including a successful save) must still be sent.
            if ($this->supersededMenuResponse($message)) {
                $message->update(['status' => 'cancelled', 'error_code' => 'superseded_flow_reply']);

                continue;
            }
            if (! $this->authorized($message)) {
                $message->update(['status' => 'cancelled', 'error_code' => 'access_revoked']);

                continue;
            }
            // A bot response held for a long outage can expose stale state. Do not send it.
            if ($message->created_at->lt($message->subject_type === 'notification' ? now()->subHours(24) : now()->subMinutes(15))) {
                $message->update(['status' => 'cancelled', 'error_code' => 'expired']);

                continue;
            }
            $message->update(['status' => 'sending', 'attempts' => $message->attempts + 1]);
            $cleanup = ($message->payload['_method'] ?? null) === 'deleteMessage' && ($message->payload['_ui_cleanup'] ?? false) === true;
            try {
                $outbound = Arr::except($message->payload, ['_method', '_ui_cleanup', '_subject_ids', '_department_id', '_task_id', '_asset_text', '_automation', '_file_disk', '_file_path', '_file_name']);
                if (! $cleanup) {
                    $outbound = app(PanelLinks::class)->materialize($outbound, $message->link_id ? BaleUserLink::find($message->link_id) : null);
                }
                if ($this->sendsDocument($message->payload)) {
                    // ارسال پروندهٔ خروجی انتشار: محتوا همان لحظه از دیسک خوانده
                    // می‌شود و در مسیر ارسال، در پایگاه داده نمی‌ماند.
                    $file = $this->readFile($message->payload);
                    if (! $file) {
                        $message->update(['status' => 'failed', 'error_code' => 'file_unavailable']);

                        continue;
                    }
                    $result = $this->client->call($this->settings->token(), 'sendDocument', ['chat_id' => $message->chat_id, ...$outbound, '_file' => $file]);
                } else {
                    $result = $cleanup
                        ? $this->client->call($this->settings->token(), 'deleteMessage', ['chat_id' => $message->chat_id, 'message_id' => $message->payload['message_id']])
                        : $this->client->call($this->settings->token(), 'sendMessage', ['chat_id' => $message->chat_id, ...$outbound]);
                }
                if (($cleanup && $result !== true) || (! $cleanup && (! is_array($result) || ! isset($result['message_id'])))) {
                    throw new BaleApiException('response_unknown');
                }
                $message->update(['status' => 'sent', 'remote_message_id' => $cleanup ? null : (string) $result['message_id'], 'error_code' => null]);
                if (! $cleanup) {
                    $this->settings->write(['last_sent_at' => now()->toIso8601String()]);
                    $sent++;
                }
            } catch (BaleApiException $e) {
                $retry = $e->reason === 'rate_limited' && $message->attempts < 3;
                $unknown = in_array($e->reason, ['transport_unknown', 'response_unknown'], true);
                $message->update([
                    'status' => $retry ? 'pending' : ($unknown ? 'unknown' : 'failed'),
                    'error_code' => $e->reason, 'available_at' => now()->addSeconds($e->retryAfter ?? 60),
                ]);
                // Back off globally within this tick, rather than hammering other destinations.
                if ($e->reason === 'rate_limited') {
                    $this->settings->write(['send_not_before' => now()->addSeconds($e->retryAfter ?? 60)->toIso8601String()]);
                }
                // Menu cleanup is best-effort: a missing/old message must not suppress the
                // newly generated screen. Provider rate limits still stop the whole tick.
                if ($cleanup && $e->reason !== 'rate_limited') {
                    continue;
                }
                break;
            }
        }

        return $sent;
    }

    /**
     * Only queued HOME screens are dropped when a newer user reply exists.
     * Never suppress confirmation/success messages: they can be semantically
     * important even if another callback arrived before delivery.
     */
    private function supersededMenuResponse(BaleOutbox $message): bool
    {
        if (! $message->link_id
            || ! str_starts_with((string) ($message->payload['text'] ?? ''), 'به تدبیر خوش آمدید.')) {
            return false;
        }

        $pattern = '/^'.preg_quote((string) $message->bot_id, '/').':[0-9]+$/D';
        if (! preg_match($pattern, (string) $message->deduplication_key)) {
            return false;
        }

        return BaleOutbox::query()
            ->where('bot_id', $message->bot_id)
            ->where('chat_id', $message->chat_id)
            ->where('link_id', $message->link_id)
            ->where('id', '>', $message->id)
            ->whereNotIn('status', ['cancelled', 'failed'])
            ->where('deduplication_key', 'like', $message->bot_id.':%')
            ->orderByDesc('id')
            ->limit(50)
            ->get(['deduplication_key'])
            ->contains(fn (BaleOutbox $newer) => (bool) preg_match($pattern, (string) $newer->deduplication_key));
    }

    /** آیا این پیام باید به‌جای متن، یک پرونده بفرستد؟ */
    private function sendsDocument(array $payload): bool
    {
        return ($payload['_method'] ?? null) === 'sendDocument';
    }

    /**
     * خواندن پروندهٔ پیام از همان دیسک دارایی‌ها.
     *
     * @return array{contents: string, name: string}|null
     */
    private function readFile(array $payload): ?array
    {
        $disk = (string) ($payload['_file_disk'] ?? '');
        $path = (string) ($payload['_file_path'] ?? '');
        if ($disk === '' || $path === '' || ! Storage::disk($disk)->exists($path)) {
            return null;
        }
        $size = (int) Storage::disk($disk)->size($path);
        // سقف ۲۰ مگابایت: پرونده‌های بزرگ‌تر در بات ارسال نمی‌شوند.
        if ($size <= 0 || $size > 20 * 1024 * 1024) {
            return null;
        }

        return ['contents' => Storage::disk($disk)->get($path), 'name' => (string) ($payload['_file_name'] ?? 'file')];
    }

    private function authorized(BaleOutbox $message): bool
    {
        if ($message->bot_id !== (string) ($this->settings->read()['bot_id'] ?? '')) {
            return false;
        }
        if (! $message->requires_link) {
            return true; // Only fixed, non-sensitive connection/help responses use this path.
        }
        $link = BaleUserLink::find($message->link_id);
        $user = $link ? User::find($link->user_id) : null;
        if (! $user?->isActive() || $link->chat_id !== $message->chat_id) {
            return false;
        }
        $permissions = app(UserPermissionGate::class);

        if ($message->subject_type === 'asset_teams' || array_key_exists('_team_id', $message->payload)) {
            return false;
        }
        $organization = app(DepartmentConsolidation::class)->status();
        if (! $organization['installed'] || $organization['phase'] !== 'done') {
            return false;
        }
        if (isset($message->payload['_automation']) && ! app(Automations::class)->valid($message->payload['_automation'], $user)) {
            return false;
        }
        if (($message->payload['_asset_text'] ?? false) && ! $permissions->all($user, ['assets.view', 'assets.upload'])) {
            return false;
        }
        if ($taskId = ($message->payload['_task_id'] ?? null)) {
            if (! app(TaskOperations::class)->visibleTo($user)->whereKey($taskId)->where('assignee_id', $user->id)->exists()) {
                return false;
            }
        }
        if (str_starts_with($message->subject_type ?? '', 'asset_') && ! Schema::hasTable('dam_data_table_department')) {
            return false;
        }

        if (in_array($message->subject_type, ['task', 'tasks'], true) && ! $permissions->any($user, 'tasks.view')) {
            return false;
        }
        if (in_array($message->subject_type, ['project', 'projects'], true) && ! $permissions->any($user, 'projects.view')) {
            return false;
        }

        if (in_array($message->subject_type, ['meeting', 'meetings'], true)) {
            $ids = $message->subject_type === 'meeting' ? [$message->subject_id] : ($message->payload['_subject_ids'] ?? []);
            if (! $permissions->any($user, 'meetings.view')) {
                return false;
            }
            foreach ($ids as $id) {
                $meeting = WorkspaceRecord::find($id);
                if (! $meeting || ! app(NotificationAccess::class)->meetingMember($user, $meeting)) {
                    return false;
                }
            }

            return true;
        }
        if ($message->subject_type === 'notification') {
            $record = DomainRecord::find($message->subject_id);

            return $link->notifications_enabled && $record && app(NotificationAccess::class)->canDeliver($user, $record);
        }
        if ($message->subject_type === 'asset_departments') {
            if (! $permissions->any($user, 'assets.view')) {
                return false;
            }
            foreach (($message->payload['_subject_ids'] ?? []) as $id) {
                if (! Department::whereKey($id)->where('departments.status', 'active')->forMember($user)->exists()) {
                    return false;
                }
            }

            return true;
        }
        if ($message->subject_type === 'asset_tables') {
            // فهرستِ جدول‌ها می‌تواند بدون دپارتمان باشد (قاعدهٔ خودکارسازی و
            // مسیر «اطلاعات جدول» در منوی دارایی)؛ در آن حالت همان قاعدهٔ
            // ویرایشِ کاربر سنجیده می‌شود، نه یک دپارتمانِ اجباری.
            if (! $permissions->any($user, 'assets.view')) {
                return false;
            }
            $department = (int) ($message->payload['_department_id'] ?? 0);
            if ($department > 0 && ! Department::whereKey($department)->where('departments.status', 'active')->forMember($user)->exists()) {
                return false;
            }
            foreach (($message->payload['_subject_ids'] ?? []) as $id) {
                $table = DamDataTable::find($id);
                $allowed = $table && ($department > 0
                    ? app(DamTableAccess::class)->botAllowed($user, $table, $department)
                    : app(DamTableAccess::class)->canEdit($user, $table));
                if (! $allowed) {
                    return false;
                }
            }

            return true;
        }
        if ($message->subject_type === 'asset_table') {
            $table = DamDataTable::find($message->subject_id);
            $department = (int) ($message->payload['_department_id'] ?? 0);

            return $table && ($department > 0
                ? app(DamTableAccess::class)->botAllowed($user, $table, $department)
                : app(DamTableAccess::class)->canEdit($user, $table));
        }

        return match ($message->subject_type) {
            'auth_challenge' => (int) $message->subject_id === (int) $user->id,
            'task' => Task::whereKey($message->subject_id)->where('assignee_id', $user->id)->exists(),
            'tasks' => Task::whereIn('id', $message->payload['_subject_ids'] ?? [])->where('assignee_id', $user->id)->count() === count($message->payload['_subject_ids'] ?? []),
            'projects' => Project::whereIn('id', $message->payload['_subject_ids'] ?? [])->where(fn ($q) => $q->where('project_manager_id', $user->id)->orWhereHas('members', fn ($q) => $q->where('users.id', $user->id)))->count() === count($message->payload['_subject_ids'] ?? []),
            'project' => Project::whereKey($message->subject_id)->where(fn ($q) => $q->where('project_manager_id', $user->id)->orWhereHas('members', fn ($q) => $q->where('users.id', $user->id)))->exists(),
            default => $message->subject_type === null,
        };
    }
}
