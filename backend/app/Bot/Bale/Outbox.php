<?php

namespace App\Bot\Bale;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;
use App\Bot\Bale\Notifications\NotificationAccess;
use App\Models\BaleOutbox;
use App\Models\BaleUserLink;
use App\Models\DamDataTable;
use App\Models\DomainRecord;
use App\Models\Project;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Services\DamTableAccess;
use App\Services\TaskOperations;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Schema;

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
            try {
                $result = $this->client->call($this->settings->token(), 'sendMessage', ['chat_id' => $message->chat_id, ...Arr::except($message->payload, ['_subject_ids', '_team_id', '_task_id', '_asset_text', '_automation'])]);
                if (! is_array($result) || ! isset($result['message_id'])) {
                    throw new BaleApiException('response_unknown');
                }
                $message->update(['status' => 'sent', 'remote_message_id' => (string) $result['message_id'], 'error_code' => null]);
                $this->settings->write(['last_sent_at' => now()->toIso8601String()]);
                $sent++;
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
                break;
            }
        }

        return $sent;
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

        if (isset($message->payload['_automation']) && ! app(Automations::class)->valid($message->payload['_automation'], $user)) {
            return false;
        }
        if (($message->payload['_asset_text'] ?? false) && (! $user->hasPermission('assets.view') || ! $user->hasPermission('assets.upload'))) {
            return false;
        }
        if ($taskId = ($message->payload['_task_id'] ?? null)) {
            if (! app(TaskOperations::class)->visibleTo($user)->whereKey($taskId)->where('assignee_id', $user->id)->exists()) {
                return false;
            }
        }
        if (str_starts_with($message->subject_type ?? '', 'asset_') && ! Schema::hasTable('dam_data_table_team')) {
            return false;
        }

        if (in_array($message->subject_type, ['task', 'tasks'], true) && ! $user->hasPermission('tasks.view')) {
            return false;
        }
        if (in_array($message->subject_type, ['project', 'projects'], true) && ! $user->hasPermission('projects.view')) {
            return false;
        }

        if (in_array($message->subject_type, ['meeting', 'meetings'], true)) {
            $ids = $message->subject_type === 'meeting' ? [$message->subject_id] : ($message->payload['_subject_ids'] ?? []);
            if (! $user->hasPermission('thinktank.view')) {
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
        if ($message->subject_type === 'asset_teams') {
            if (! $user->hasPermission('assets.view')) {
                return false;
            }
            foreach (($message->payload['_subject_ids'] ?? []) as $id) {
                if (! Team::whereKey($id)->where('teams.status', 'active')->whereHas('users', fn ($q) => $q->where('users.id', $user->id))->exists()) {
                    return false;
                }
            }

            return true;
        }
        if ($message->subject_type === 'asset_tables') {
            $team = (int) ($message->payload['_team_id'] ?? 0);
            if (! $user->hasPermission('assets.view') || ! Team::whereKey($team)->where('teams.status', 'active')->whereHas('users', fn ($q) => $q->where('users.id', $user->id))->exists()) {
                return false;
            }
            foreach (($message->payload['_subject_ids'] ?? []) as $id) {
                $table = DamDataTable::find($id);
                if (! $table || ! app(DamTableAccess::class)->botAllowed($user, $table, $team)) {
                    return false;
                }
            }

            return true;
        }
        if ($message->subject_type === 'asset_table') {
            $table = DamDataTable::find($message->subject_id);

            return $table && app(DamTableAccess::class)->botAllowed($user, $table, (int) ($message->payload['_team_id'] ?? 0));
        }

        return match ($message->subject_type) {
            'task' => Task::whereKey($message->subject_id)->where('assignee_id', $user->id)->exists(),
            'tasks' => Task::whereIn('id', $message->payload['_subject_ids'] ?? [])->where('assignee_id', $user->id)->count() === count($message->payload['_subject_ids'] ?? []),
            'projects' => Project::whereIn('id', $message->payload['_subject_ids'] ?? [])->where(fn ($q) => $q->where('project_manager_id', $user->id)->orWhereHas('members', fn ($q) => $q->where('users.id', $user->id)))->count() === count($message->payload['_subject_ids'] ?? []),
            'project' => Project::whereKey($message->subject_id)->where(fn ($q) => $q->where('project_manager_id', $user->id)->orWhereHas('members', fn ($q) => $q->where('users.id', $user->id)))->exists(),
            default => $message->subject_type === null,
        };
    }
}
