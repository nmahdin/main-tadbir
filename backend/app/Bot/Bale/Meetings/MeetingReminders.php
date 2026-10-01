<?php

namespace App\Bot\Bale\Meetings;

use App\Bot\Bale\Notifications\NotificationAccess;
use App\Bot\Bale\Notifications\NotificationDelivery;
use App\Bot\Bale\Support\OperationsSchema;
use App\Models\ActivityLog;
use App\Models\BaleOutbox;
use App\Models\DomainRecord;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Services\Access\UserPermissionGate;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class MeetingReminders
{
    public static function snapshot(WorkspaceRecord $meeting): string
    {
        $p = $meeting->payload ?? [];

        return hash('sha256', json_encode([$meeting->title, $meeting->status, $meeting->owner_id,
            $p['date'] ?? '', $p['time'] ?? '', $p['duration'] ?? '', $p['locationDetails'] ?? '', $p['attendeeIds'] ?? []], JSON_UNESCAPED_UNICODE));
    }

    public function authorize(User $actor, WorkspaceRecord $meeting): void
    {
        abort_unless(app(UserPermissionGate::class)->any($actor, 'meetings.edit') && $meeting->kind === WorkspaceRecord::KIND_MEETING && (int) $meeting->owner_id === (int) $actor->id, 403);
        app(OperationsSchema::class)->require('reminders');
        abort_unless(in_array($meeting->status, ['scheduled', 'in_progress'], true), 422, 'جلسه لغو یا تمام شده است.');
    }

    public function preview(User $actor, WorkspaceRecord $meeting): array
    {
        $this->authorize($actor, $meeting);

        return ['version' => self::snapshot($meeting), 'text' => $this->text($meeting), 'recipients' => $this->recipients($meeting)->count()];
    }

    public function send(User $actor, WorkspaceRecord $meeting, string $requestId, string $version): array
    {
        $delivery = app(NotificationDelivery::class);
        $runId = $delivery->deferred(fn () => DB::transaction(function () use ($actor, $meeting, $requestId, $version) {
            $meeting = WorkspaceRecord::whereKey($meeting->id)->lockForUpdate()->firstOrFail();
            $this->authorize($actor->fresh(), $meeting);
            $key = hash('sha256', $actor->id.':'.$requestId);
            $existing = DB::table('bale_reminder_runs')->where('request_key', $key)->first();
            if ($existing) {
                abort_unless((int) $existing->meeting_id === (int) $meeting->id && $existing->snapshot === $version, 409);

                return $existing->id;
            }
            abort_unless(hash_equals(self::snapshot($meeting), $version), 409, 'اطلاعات جلسه تغییر کرده؛ پیش‌نمایش جدید بگیرید.');
            abort_if(DB::table('bale_reminder_runs')->where('meeting_id', $meeting->id)->where('created_at', '>', now()->subMinute())->exists(), 429, 'برای ارسال دوباره یک دقیقه صبر کنید.');
            $recipients = $this->recipients($meeting);
            abort_if($recipients->count() > 200, 422, 'هر نوبت یادآوری حداکثر ۲۰۰ شرکت‌کننده دارد.');
            $ids = [];
            foreach ($recipients as $recipient) {
                $record = DomainRecord::create([
                    'notification_key' => hash('sha256', 'reminder:'.$key.':'.$recipient->id),
                    'domain' => DomainRecord::DOMAIN_NOTIFICATION, 'user_id' => $recipient->id,
                    'title' => 'یادآوری جلسه: '.$meeting->title,
                    'payload' => ['userId' => (string) $recipient->id, 'title' => 'یادآوری جلسه', 'message' => $this->text($meeting),
                        'type' => 'deadline', '_bale_kind' => 'meeting_reminder', 'read' => false, 'timestamp' => now()->toIso8601String(),
                        'linkMeetingId' => (string) $meeting->id, '_meeting_snapshot' => $version, '_reminder_actor' => $actor->id],
                ]);
                $ids[] = $record->id;
            }
            $id = DB::table('bale_reminder_runs')->insertGetId([
                'meeting_id' => $meeting->id, 'actor_id' => $actor->id, 'request_key' => $key, 'snapshot' => $version,
                'notification_ids' => json_encode($ids), 'created_at' => now(), 'updated_at' => now(),
            ]);
            ActivityLog::create(['user_id' => $actor->id, 'type' => 'bale_meeting_reminder', 'action' => 'ارسال دستی یادآوری جلسه', 'details' => 'meeting:'.$meeting->id.'; run:'.$id]);

            return $id;
        }));

        return $this->deliver($actor, $meeting, $runId);
    }

    public function deliver(User $actor, WorkspaceRecord $meeting, int $runId): array
    {
        $this->authorize($actor, $meeting->fresh());
        $run = DB::table('bale_reminder_runs')->where('id', $runId)->where('meeting_id', $meeting->id)->first();
        abort_unless($run, 404);
        $ids = json_decode($run->notification_ids, true);
        $messages = BaleOutbox::where('subject_type', 'notification')->whereIn('subject_id', $ids);
        app(NotificationDelivery::class)->sendNow($messages->pluck('id')->all());
        $counts = (clone $messages)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status')->all();

        return ['run_id' => $runId, 'recipients' => count($ids), 'skipped' => count($ids) - $messages->count(), 'counts' => $counts];
    }

    private function recipients(WorkspaceRecord $meeting): Collection
    {
        $ids = array_unique([(string) $meeting->owner_id, ...array_filter((array) ($meeting->payload['attendeeIds'] ?? []), fn ($id) => is_scalar($id) && ctype_digit((string) $id))]);

        return User::whereIn('id', $ids)->get()->filter(fn ($u) => app(NotificationAccess::class)->meetingMember($u, $meeting));
    }

    private function text(WorkspaceRecord $meeting): string
    {
        $p = $meeting->payload ?? [];

        return '📅 یادآوری جلسه «'.$meeting->title.'»'."\n\n🗓 تاریخ: ".\App\Bot\Bale\Support\PersianDate::format($p['date'] ?? null)
            ."\n🕒 ساعت: ".($p['time'] ?? 'نامشخص')."\n⏱ مدت: ".($p['duration'] ?? 'نامشخص')."\n📍 محل: ".($p['locationDetails'] ?? 'نامشخص');
    }
}
