<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\WorkspaceRecordRequest;
use App\Http\Resources\TaskResource;
use App\Http\Resources\WorkspaceRecordResource;
use App\Models\WorkspaceRecord;
use App\Services\GoogleMeetService;
use App\Services\MeetingActionTasks;
use App\Services\MeetingNotifications;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
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
            'view' => 'thinktank.view',
            'create' => 'thinktank.manage_meetings',
            'edit' => 'thinktank.manage_meetings',
            'delete' => 'thinktank.manage_meetings',
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
        $data = $request->validate(['projectId' => 'nullable|integer|exists:projects,id']);
        [$task, $record] = app(MeetingActionTasks::class)->convert($request->user(), $meeting, $action, isset($data['projectId']) ? (int) $data['projectId'] : null);

        return response()->json(['data' => ['task' => new TaskResource($task->load(['comments.user', 'attachments', 'activityLogs'])), 'meeting' => new WorkspaceRecordResource($record)]]);
    }

    public function createGoogleMeet(Request $request, WorkspaceRecord $meeting, GoogleMeetService $googleMeet): WorkspaceRecordResource
    {
        abort_unless($meeting->kind === WorkspaceRecord::KIND_MEETING, 404);
        abort_unless($request->user()?->hasPermission('thinktank.manage_meetings'), 403);
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

        $records = WorkspaceRecord::query()
            ->when($kind === WorkspaceRecord::KIND_IDEA, fn ($query) => $query->with('comments.user'))
            ->where('kind', $kind)
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
        $payload = $request->all();
        if ($kind === WorkspaceRecord::KIND_MEETING && isset($payload['actionItems'])) {
            $payload['actionItems'] = array_map(fn ($item) => [...Arr::except($item, ['convertedTaskId']), 'status' => 'pending'], $payload['actionItems']);
        }
        $record = DB::transaction(function () use ($request, $kind, $payload) {
            $record = WorkspaceRecord::create($this->attributes($request, $kind, $payload));
            if ($kind === WorkspaceRecord::KIND_MEETING) {
                app(MeetingNotifications::class)->created($record);
            }

            return $record;
        });

        if ($kind === WorkspaceRecord::KIND_IDEA) {
            $record->load('comments.user');
        }

        return (new WorkspaceRecordResource($record))->response()->setStatusCode(201);
    }

    public function show(Request $request, WorkspaceRecord $workspaceRecord): WorkspaceRecordResource
    {
        $kind = $this->kind($request);
        abort_unless($workspaceRecord->kind === $kind, 404);
        $this->authorizePermission($request, $kind, 'view');

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
            $this->authorizeUpdate($request, $workspaceRecord, $kind);
            if ($kind === WorkspaceRecord::KIND_MEETING) {
                abort_unless((int) $workspaceRecord->owner_id === (int) $request->user()->id, 403);
                abort_if($request->filled('organizerId') && (int) $request->input('organizerId') !== (int) $workspaceRecord->owner_id, 403);
            }
            $merged = [...($workspaceRecord->payload ?? []), ...$request->all()];
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
            $workspaceRecord->update($this->attributes($request, $kind, $merged));

            $workspaceRecord->refresh();
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
        $this->authorizePermission($request, $kind, 'delete');
        $workspaceRecord->delete();

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
            'payload' => Arr::except($payload, ['id', 'comments', 'createdAt', 'updatedAt']),
        ];
    }

    private function kind(Request $request): string
    {
        return (string) $request->route('kind');
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

        if ($this->onlyTouches($changedKeys, ['status', 'projectId', 'convertedProjectId', 'convertedTaskId', 'activities', 'updatedAt'])) {
            return ['thinktank.approve_convert'];
        }

        return [];
    }

    /**
     * @param  array<int, string>  $changedKeys
     * @return array<int, string>
     */
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
     * کلیدهای شناسه و زمان‌سنج (id/createdAt/updatedAt) فراداده محسوب می‌شوند و
     * در تشخیص نوع تغییر نقشی ندارند.
     *
     * @param  array<string, mixed>  $existing
     * @param  array<string, mixed>  $incoming
     * @return array<int, string>
     */
    private function changedKeys(array $existing, array $incoming): array
    {
        $ignoredKeys = ['id', 'createdAt', 'updatedAt'];

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
