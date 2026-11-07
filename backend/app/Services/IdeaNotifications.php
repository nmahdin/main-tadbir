<?php

namespace App\Services;

use App\Models\DomainRecord;
use App\Models\User;
use App\Models\WorkspaceRecord;
use Illuminate\Support\Facades\Schema;

final class IdeaNotifications
{
    public function created(WorkspaceRecord $idea): void
    {
        if ($idea->kind !== WorkspaceRecord::KIND_IDEA) {
            return;
        }

        $payload = $idea->payload ?? [];
        $projectId = $idea->project_id ?: ($payload['projectId'] ?? null);

        // همه کاربران مربوط: کاربران فعال با دسترسی thinktank.view
        // اگر پروژه دارد، اعضای همان پروژه هم شامل می‌شوند
        $query = User::query()->where('status', 'active')->whereKeyNot($idea->owner_id);

        // فقط کاربرانی که مجوز مشاهده ایده دارند
        $userIds = $query->get()->filter(function (User $user) {
            return $user->hasPermission('thinktank.view');
        })->pluck('id')->all();

        // اگر پروژه دارد، اعضای پروژه را هم اضافه کن
        if ($projectId) {
            $projectMemberIds = \App\Models\Project::find($projectId)?->members()->pluck('users.id')->all() ?? [];
            $managerId = \App\Models\Project::find($projectId)?->project_manager_id;
            if ($managerId) {
                $projectMemberIds[] = $managerId;
            }
            $userIds = array_unique(array_merge($userIds, $projectMemberIds));
        }

        // حذف سازنده ایده
        $userIds = array_values(array_filter($userIds, fn ($id) => (int) $id !== (int) $idea->owner_id));

        if (empty($userIds)) {
            return;
        }

        // محدودیت برای جلوگیری از اسپم
        $userIds = array_slice($userIds, 0, 100);

        $title = 'ایده جدید';
        $projectName = '';
        if ($projectId) {
            $project = \App\Models\Project::find($projectId);
            $projectName = $project ? ' در پروژه «'.$project->name.'»' : '';
        }

        foreach (User::whereIn('id', $userIds)->where('status', 'active')->get() as $recipient) {
            $attributes = [
                'domain' => DomainRecord::DOMAIN_NOTIFICATION,
                'user_id' => $recipient->id,
                'title' => $title,
                'payload' => [
                    'userId' => (string) $recipient->id,
                    'title' => $title,
                    'type' => 'system',
                    'notificationCategory' => 'ideas',
                    'read' => false,
                    'linkIdeaId' => (string) $idea->id,
                    'timestamp' => now()->toIso8601String(),
                    'message' => '💡 ایده جدید: «'.$idea->title.'»'.$projectName.' توسط '.($idea->owner?->name ?? 'کاربر').' ثبت شد.',
                ],
            ];

            if (Schema::hasColumn('domain_records', 'notification_key')) {
                DomainRecord::firstOrCreate([
                    'notification_key' => hash('sha256', 'idea-created:'.$idea->id.':'.$recipient->id),
                ], $attributes);
            } else {
                DomainRecord::create($attributes);
            }
        }
    }
}
