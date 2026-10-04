<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\WorkspaceRecordRequest;
use App\Http\Resources\TaskResource;
use App\Http\Resources\WorkspaceRecordResource;
use App\Models\ActivityLog;
use App\Models\DamRelation;
use App\Models\Project;
use App\Models\SystemSetting;
use App\Models\WorkspaceRecord;
use App\Services\GoogleMeetService;
use App\Services\MeetingActionTasks;
use App\Services\MeetingNotifications;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class WorkspaceRecordController extends Controller
{
    /**
     * @var array<string, array{view: string, create: string, edit: string, delete: string}>
     */
    private const PERMISSIONS = [
        WorkspaceRecord::KIND_IDEA => [
            'view' => 'thinktank.view',
            'create' => 'thinktank.create_idea',
            'edit' => 'thinktank.edit_idea',
            'delete' => 'thinktank.delete_idea',
        ],
        WorkspaceRecord::KIND_MEETING => [
            'view' => 'meetings.view',
            'create' => 'meetings.create',
            'edit' => 'meetings.edit',
            'delete' => 'meetings.delete',
        ],
        WorkspaceRecord::KIND_LETTER => [
            'view' => 'secretariat.view',
            'create' => 'secretariat.create_letter',
            'edit' => 'secretariat.edit_letter',
            'delete' => 'secretariat.delete_letter',
        ],
        WorkspaceRecord::KIND_RESOLUTION => [
            'view' => 'secretariat.view',
            'create' => 'secretariat.manage_resolutions',
            'edit' => 'secretariat.manage_resolutions',
            'delete' => 'secretariat.manage_resolutions',
        ],
        WorkspaceRecord::KIND_DOSSIER => [
            'view' => 'secretariat.view',
            'create' => 'secretariat.archive_letter',
            'edit' => 'secretariat.archive_letter',
            'delete' => 'secretariat.archive_letter',
        ],
    ];

    public function convertAction(Request $request, WorkspaceRecord $meeting, string $action)
    {
        $this->assertRecordProject($request, $meeting);
        $data = $request->validate(['projectId' => 'nullable|integer|exists:projects,id']);
        [$task, $record] = app(MeetingActionTasks::class)->convert($request->user(), $meeting, $action, isset($data['projectId']) ? (int) $data['projectId'] : null);

        return response()->json(['data' => ['task' => new TaskResource($task->load(['comments.user', 'attachments', 'activityLogs'])), 'meeting' => new WorkspaceRecordResource($record)]]);
    }

    public function createGoogleMeet(Request $request, WorkspaceRecord $meeting, GoogleMeetService $googleMeet): WorkspaceRecordResource
    {
        abort_unless($meeting->kind === WorkspaceRecord::KIND_MEETING, 404);
        $this->assertRecordProject($request, $meeting);
        abort_unless($request->user()?->hasPermission('meetings.edit'), 403);
        abort_unless((int) $meeting->owner_id === (int) $request->user()->id, 403, 'فقط برگزارکننده می‌تواند لینک جلسه را ایجاد کند.');

        try {
            $conference = $googleMeet->createFor($meeting);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (\Throwable $exception) {
            report($exception);
            abort(502, 'ایجاد جلسه در Google Calendar انجام نشد؛ تنظیمات اتصال را بررسی کنید.');
        }

        $meeting->update(['payload' => [
            ...($meeting->payload ?? []),
            'locationType' => 'online',
            'locationDetails' => $conference['meetLink'],
            'googleCalendarEventId' => $conference['eventId'],
            'googleCalendarLink' => $conference['calendarLink'],
        ]]);

        return new WorkspaceRecordResource($meeting->refresh());
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $kind = $this->kind($request);
        $this->authorizePermission($request, $kind, 'view');
        $request->validate(['project_id' => ['sometimes', 'integer', 'exists:projects,id']]);

        $projectId = $request->integer('project_id') ?: null;
        if ($projectId) {
            $project = Project::findOrFail($projectId);
            app(\App\Services\ProjectScopeAccess::class)->assertView($request->user(), $project);
        }
        $actor = $request->user();
        $projectIds = $actor->role?->key === 'admin' ? null : Project::where('project_manager_id', $actor->id)
            ->orWhereHas('members', fn ($members) => $members->where('users.id', $actor->id))->pluck('id');
        $records = WorkspaceRecord::query()
            ->when($kind === WorkspaceRecord::KIND_IDEA, fn ($query) => $query->with('comments.user'))
            ->where('kind', $kind)
            ->when(in_array($kind, [WorkspaceRecord::KIND_IDEA, WorkspaceRecord::KIND_MEETING], true) && $projectIds !== null,
                fn ($query) => $query->where(fn ($scope) => $scope->whereNull('project_id')->orWhereIn('project_id', $projectIds)))
            ->when($projectId, fn ($query) => $query->where('project_id', $projectId))
            ->when($kind === WorkspaceRecord::KIND_LETTER && $request->input('inbox') === 'me', function ($query) use ($request): void {
                $needle = '%"toUserId":"'.(int) $request->user()->id.'"%';
                $query->where(fn ($letters) => $letters->where('owner_id', $request->user()->id)->orWhere('payload', 'like', $needle));
            })
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('title', 'like', "%{$search}%")
                        ->orWhere('status', 'like', "%{$search}%");
                });
            })
            ->latest()
            ->paginate(min(max($request->integer('per_page', 100), 1), 100));

        return WorkspaceRecordResource::collection($records);
    }

    public function store(WorkspaceRecordRequest $request): JsonResponse
    {
        $kind = $this->kind($request);
        $this->authorizePermission($request, $kind, 'create');

        if ($kind === WorkspaceRecord::KIND_MEETING) {
            abort_if($request->filled('organizerId') && (int) $request->input('organizerId') !== (int) $request->user()->id, 403);
        }
        if ($kind === WorkspaceRecord::KIND_IDEA) {
            abort_if($request->filled('creatorId') && (int) $request->input('creatorId') !== (int) $request->user()->id, 403);
        }
        $this->assertProjectLink($request, $kind);
        $payload = $request->all();
        if ($kind === WorkspaceRecord::KIND_IDEA && empty($payload['status'])) {
            $payload['status'] = 'submitted';
        }
        if ($kind === WorkspaceRecord::KIND_MEETING && isset($payload['actionItems'])) {
            $payload['actionItems'] = array_map(fn ($item) => [...Arr::except($item, ['convertedTaskId']), 'status' => 'pending'], $payload['actionItems']);
        }

        $requestKey = $request->string('clientRequestId')->toString() ?: null;
        $existing = $requestKey ? WorkspaceRecord::query()
            ->where('client_request_id', $requestKey)
            ->where('kind', $kind)
            ->where('owner_id', $request->user()->id)
            ->first() : null;
        $replayed = $existing !== null;
        if ($existing) {
            $record = $existing;
        } else {
            try {
                $record = DB::transaction(function () use ($request, $kind, $payload, $requestKey) {
                    $record = WorkspaceRecord::create([
                        ...$this->attributes($request, $kind, $payload),
                        'client_request_id' => $requestKey,
                    ]);
                    if ($kind === WorkspaceRecord::KIND_MEETING) {
                        app(MeetingNotifications::class)->created($record);
                    }
                    $this->logProjectRecordLink($record, $request->user()->id);

                    return $record;
                });
            } catch (QueryException $exception) {
                $record = $requestKey ? WorkspaceRecord::query()
                    ->where('client_request_id', $requestKey)
                    ->where('kind', $kind)
                    ->where('owner_id', $request->user()->id)
                    ->first() : null;
                if (! $record) {
                    throw $exception;
                }
                $replayed = true;
            }
        }

        if ($kind === WorkspaceRecord::KIND_IDEA) {
            $record->load('comments.user');
        }

        return (new WorkspaceRecordResource($record))->response()->setStatusCode($replayed ? 200 : 201);
    }

    public function show(Request $request, WorkspaceRecord $workspaceRecord): WorkspaceRecordResource
    {
        $kind = $this->kind($request);
        abort_unless($workspaceRecord->kind === $kind, 404);
        $this->authorizePermission($request, $kind, 'view');
        $this->assertRecordProject($request, $workspaceRecord);

        if ($kind === WorkspaceRecord::KIND_IDEA) {
            $workspaceRecord->load('comments.user');
        }

        return new WorkspaceRecordResource($workspaceRecord);
    }

    public function update(WorkspaceRecordRequest $request, WorkspaceRecord $workspaceRecord): WorkspaceRecordResource
    {
        return DB::transaction(function () use ($request, $workspaceRecord) {
            $workspaceRecord = WorkspaceRecord::whereKey($workspaceRecord->id)->lockForUpdate()->firstOrFail();
            $kind = $this->kind($request);
            abort_unless($workspaceRecord->kind === $kind, 404);
            $this->assertRecordProject($request, $workspaceRecord);
            $this->authorizeUpdate($request, $workspaceRecord, $kind);
            if ($request->has('projectId') && (string) $request->input('projectId') !== (string) ($workspaceRecord->project_id ?? '')) {
                $this->assertProjectLink($request, $kind);
            }
            if ($kind === WorkspaceRecord::KIND_MEETING) {
                abort_unless((int) $workspaceRecord->owner_id === (int) $request->user()->id, 403);
                abort_if($request->filled('organizerId') && (int) $request->input('organizerId') !== (int) $workspaceRecord->owner_id, 403);
            }
            $previousProjectId = $workspaceRecord->project_id;
            $existingPayload = $workspaceRecord->payload ?? [];
            $changedKeys = $this->changedKeys($existingPayload, $request->all());
            $merged = [...$existingPayload, ...$request->all()];
            if (in_array($kind, [WorkspaceRecord::KIND_IDEA, WorkspaceRecord::KIND_MEETING], true) && ! $request->has('projectId')) {
                $merged['projectId'] = $workspaceRecord->project_id;
            }
            if ($kind === WorkspaceRecord::KIND_MEETING && $request->has('actionItems')) {
                $saved = collect($workspaceRecord->payload['actionItems'] ?? [])->keyBy('id');
                $incoming = $request->input('actionItems', []);
                $incomingIds = array_column($incoming, 'id');
                foreach ($saved as $item) {
                    if (! empty($item['convertedTaskId']) && ! in_array($item['id'], $incomingIds, true)) {
                        throw ValidationException::withMessages(['actionItems' => 'اقدام تبدیل‌شده به تسک حذف نمی‌شود؛ صورت‌جلسه را دوباره باز کنید.']);
                    }
                }
                $merged['actionItems'] = array_map(function ($item) use ($saved) {
                    $old = $saved->get($item['id']);
                    unset($item['convertedTaskId']);
                    if (! empty($old['convertedTaskId'])) {
                        return [...$item, 'convertedTaskId' => $old['convertedTaskId'], 'status' => 'converted'];
                    }

                    return [...$item, 'status' => 'pending'];
                }, $incoming);
            }
            if ($kind === WorkspaceRecord::KIND_IDEA) {
                $previousStatus = (string) ($workspaceRecord->status ?? $existingPayload['status'] ?? 'submitted');
                $nextStatus = $this->smartIdeaStatus($workspaceRecord, $merged, $changedKeys);
                $merged['status'] = $nextStatus;
                if ($nextStatus !== $previousStatus) {
                    $merged['activities'] = [...($merged['activities'] ?? []), [
                        'id' => 'status-'.(string) Str::uuid(),
                        'userId' => (string) $request->user()->id,
                        'action' => $changedKeys === ['status'] ? 'وضعیت ایده را تغییر داد.' : 'وضعیت ایده به‌صورت خودکار تغییر کرد.',
                        'details' => $previousStatus.' → '.$nextStatus,
                        'timestamp' => now()->toIso8601String(),
                        'type' => 'status_change',
                    ]];
                }
            }
            $workspaceRecord->update($this->attributes($request, $kind, $merged));
            app(\App\Services\DamService::class)->syncWorkspaceFolderName($workspaceRecord);

            $workspaceRecord->refresh();
            if ((string) ($workspaceRecord->project_id ?? '') !== (string) ($previousProjectId ?? '')) {
                $this->logProjectRecordLink($workspaceRecord, $request->user()->id);
            }
            if ($kind === WorkspaceRecord::KIND_IDEA) {
                $workspaceRecord->load('comments.user');
            }

            return new WorkspaceRecordResource($workspaceRecord);
        });
    }

    public function destroy(Request $request, WorkspaceRecord $workspaceRecord): Response
    {
        $kind = $this->kind($request);
        abort_unless($workspaceRecord->kind === $kind, 404);
        $this->assertRecordProject($request, $workspaceRecord);
        $this->authorizePermission($request, $kind, 'delete');
        DB::transaction(function () use ($workspaceRecord, $kind): void {
            $locked = WorkspaceRecord::query()->whereKey($workspaceRecord->id)->lockForUpdate()->firstOrFail();
            $relationType = $kind === WorkspaceRecord::KIND_IDEA ? 'idea' : ($kind === WorkspaceRecord::KIND_MEETING ? 'meeting' : null);
            if ($relationType) {
                DamRelation::query()->where('related_type', $relationType)->where('related_id', $locked->id)->delete();
            }
            $locked->delete();
        }, 3);

        return response()->noContent();
    }

    /**
     * @param  array<string, mixed>|null  $payload
     * @return array<string, mixed>
     */
    private function attributes(Request $request, string $kind, ?array $payload = null): array
    {
        $payload ??= $request->all();
        $owner = $payload['creatorId']
            ?? $payload['organizerId']
            ?? $payload['senderUserId']
            ?? $payload['responsibleUserId']
            ?? $request->user()?->id;

        if ($kind === WorkspaceRecord::KIND_MEETING) {
            $owner = $payload['organizerId'] ?? $request->user()?->id;
            $payload['organizerId'] = (string) $owner;
        }

        return [
            'kind' => $kind,
            'title' => $payload['title'] ?? $payload['subject'] ?? '',
            'status' => $payload['status'] ?? null,
            'owner_id' => is_numeric($owner) ? (int) $owner : $request->user()?->id,
            'project_id' => in_array($kind, [WorkspaceRecord::KIND_IDEA, WorkspaceRecord::KIND_MEETING], true)
                && is_numeric($payload['projectId'] ?? null) ? (int) $payload['projectId'] : null,
            'payload' => Arr::except($payload, ['id', 'clientRequestId', 'comments', 'createdAt', 'updatedAt']),
        ];
    }

    private function kind(Request $request): string
    {
        $kind = (string) $request->route('kind');
        if (in_array($kind, [WorkspaceRecord::KIND_LETTER, WorkspaceRecord::KIND_RESOLUTION, WorkspaceRecord::KIND_DOSSIER], true)) {
            $general = SystemSetting::query()->where('key', 'general')->value('value');
            if (is_string($general)) {
                $general = json_decode($general, true);
            }
            abort_if(is_array($general) && ($general['secretariatEnabled'] ?? true) === false, 404, 'ماژول دبیرخانه غیرفعال است.');
        }

        return $kind;
    }

    private function authorizePermission(Request $request, string $kind, string $action): void
    {
        $permission = self::PERMISSIONS[$kind][$action] ?? null;
        abort_unless($permission && $request->user()?->hasAnyPermission($permission), 403, 'دسترسی لازم برای این بخش را ندارید.');
    }

    /**
     * بررسی دسترسی به‌روزرسانی با در نظر گرفتن اکشن‌های اختصاصی.
     *
     * ویرایش کامل رکورد مستلزم دسترسی edit همان ماژول است؛ اما اگر تغییرات
     * ارسالی محدود به فیلدهای یک اکشن خاص باشد (رأی‌دهی روی ایده، تأیید/تبدیل
     * ایده، ارجاع یا بایگانی نامه)، داشتن دسترسی اختصاصی همان اکشن کافی است.
     */
    private function authorizeUpdate(Request $request, WorkspaceRecord $record, string $kind): void
    {
        $user = $request->user();
        $editPermission = self::PERMISSIONS[$kind]['edit'] ?? null;

        abort_unless($user !== null && $editPermission !== null, 403, 'دسترسی لازم برای این بخش را ندارید.');

        if ($user->hasAnyPermission($editPermission)) {
            return;
        }

        $changedKeys = $this->changedKeys($record->payload ?? [], $request->all());

        // به‌روزرسانی بدون تغییر مؤثر (همگام‌سازی رکورد دست‌نخورده) خطایی ندارد.
        if ($changedKeys === []) {
            return;
        }

        foreach ($this->actionPermissions($kind, $changedKeys) as $permission) {
            if ($user->hasPermission($permission)) {
                return;
            }
        }

        abort(403, 'دسترسی لازم برای این بخش را ندارید.');
    }

    /**
     * دسترسی‌های اختصاصی قابل قبول برای تغییرات فعلی؛ در صورت محدود نبودن
     * تغییرات به فیلدهای اکشن خاص، فهرست خالی بازگشت داده می‌شود.
     *
     * @param  array<int, string>  $changedKeys
     * @return array<int, string>
     */
    private function actionPermissions(string $kind, array $changedKeys): array
    {
        return match ($kind) {
            WorkspaceRecord::KIND_IDEA => $this->ideaActionPermissions($changedKeys),
            WorkspaceRecord::KIND_MEETING => $this->meetingActionPermissions($changedKeys),
            WorkspaceRecord::KIND_LETTER => $this->letterActionPermissions($changedKeys),
            default => [],
        };
    }

    /**
     * @param  array<int, string>  $changedKeys
     * @return array<int, string>
     */
    private function ideaActionPermissions(array $changedKeys): array
    {
        if ($this->onlyTouches($changedKeys, ['votes', 'comments', 'activities', 'hasPoll', 'pollQuestion', 'pollOptions', 'updatedAt'])) {
            return ['thinktank.vote'];
        }

        if ($this->onlyTouches($changedKeys, ['status', 'convertedProjectId', 'convertedTaskId', 'activities', 'updatedAt'])) {
            return ['thinktank.approve_convert'];
        }

        return [];
    }

    /**
     * @param  array<int, string>  $changedKeys
     * @return array<int, string>
     */
    private function meetingActionPermissions(array $changedKeys): array
    {
        if ($this->onlyTouches($changedKeys, ['status', 'minutesSummary', 'decisions', 'actionItems', 'presentIds', 'attachments', 'updatedAt'])) {
            return ['meetings.minutes'];
        }

        return [];
    }

    /**
     * Keep explicit status-only decisions manual while advancing obvious lifecycle events.
     *
     * @param  array<string, mixed>  $payload
     * @param  array<int, string>  $changedKeys
     */
    private function smartIdeaStatus(WorkspaceRecord $idea, array $payload, array $changedKeys): string
    {
        $requested = (string) ($payload['status'] ?? $idea->status ?? 'submitted');
        if ($changedKeys === ['status']) {
            return $requested;
        }
        if (array_intersect($changedKeys, ['convertedProjectId', 'convertedTaskId'])
            && (! empty($payload['convertedProjectId']) || ! empty($payload['convertedTaskId']))) {
            return 'in_progress';
        }
        if (in_array('flowStages', $changedKeys, true)) {
            $stages = collect($payload['flowStages'] ?? [])->filter(fn ($stage) => is_array($stage));
            if ($stages->isNotEmpty() && $stages->every(fn ($stage) => ($stage['status'] ?? '') === 'completed')) {
                return 'completed';
            }
        }
        if (in_array('votes', $changedKeys, true) && ! empty($payload['votes'])
            && in_array((string) ($idea->status ?? $requested), ['draft', 'submitted'], true)) {
            return 'under_review';
        }

        return $requested;
    }

    private function letterActionPermissions(array $changedKeys): array
    {
        if ($this->onlyTouches($changedKeys, ['referrals', 'status', 'updatedAt'])) {
            return ['secretariat.refer_letter'];
        }

        if ($this->onlyTouches($changedKeys, ['status', 'archiveDossierId', 'archiveBox', 'archivedAt', 'updatedAt'])) {
            return ['secretariat.archive_letter'];
        }

        return [];
    }

    /**
     * @param  array<int, string>  $changedKeys
     * @param  array<int, string>  $allowed
     */
    private function onlyTouches(array $changedKeys, array $allowed): bool
    {
        return $changedKeys !== [] && array_diff($changedKeys, $allowed) === [];
    }

    /**
     * کلیدهایی که مقدار آن‌ها نسبت به رکورد ذخیره‌شده تغییر کرده یا جدید است.
     *
     * کلیدهای شناسه/درخواست و زمان‌سنج (id/clientRequestId/createdAt/updatedAt) فراداده محسوب می‌شوند و
     * در تشخیص نوع تغییر نقشی ندارند.
     *
     * @param  array<string, mixed>  $existing
     * @param  array<string, mixed>  $incoming
     * @return array<int, string>
     */
    private function assertRecordProject(Request $request, WorkspaceRecord $record): void
    {
        if ($record->project_id && in_array($record->kind, [WorkspaceRecord::KIND_IDEA, WorkspaceRecord::KIND_MEETING], true)) {
            app(\App\Services\ProjectScopeAccess::class)->assertView($request->user(), Project::findOrFail($record->project_id));
        }
    }

    private function assertProjectLink(Request $request, string $kind): void
    {
        if (! in_array($kind, [WorkspaceRecord::KIND_IDEA, WorkspaceRecord::KIND_MEETING], true)
            || ! $request->filled('projectId')) {
            return;
        }
        $project = Project::findOrFail((int) $request->input('projectId'));
        app(\App\Services\ProjectScopeAccess::class)->assertView($request->user(), $project);
    }

    private function logProjectRecordLink(WorkspaceRecord $record, int $actorId): void
    {
        if (! $record->project_id || ! in_array($record->kind, [WorkspaceRecord::KIND_IDEA, WorkspaceRecord::KIND_MEETING], true)) {
            return;
        }
        $isIdea = $record->kind === WorkspaceRecord::KIND_IDEA;
        $label = $isIdea ? 'ایده' : 'جلسه';
        ActivityLog::create([
            'user_id' => $actorId,
            'project_id' => $record->project_id,
            'type' => 'project_'.($isIdea ? 'idea' : 'meeting').'_linked',
            'action' => 'افزودن '.$label.' به پروژه',
            'details' => $record->kind.':'.$record->id,
            'metadata' => ['record_id' => $record->id, 'record_kind' => $record->kind],
        ]);
    }

    private function changedKeys(array $existing, array $incoming): array
    {
        $ignoredKeys = ['id', 'clientRequestId', 'createdAt', 'updatedAt'];

        $changed = [];
        foreach ($incoming as $key => $value) {
            if (in_array($key, $ignoredKeys, true)) {
                continue;
            }

            if (! array_key_exists($key, $existing) || $existing[$key] !== $value) {
                $changed[] = $key;
            }
        }

        return $changed;
    }
}
