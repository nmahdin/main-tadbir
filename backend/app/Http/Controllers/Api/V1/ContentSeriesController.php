<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ContentResource;
use App\Http\Resources\ContentSeriesResource;
use App\Http\Resources\ContentSeriesRevisionResource;
use App\Models\ActivityLog;
use App\Models\Content;
use App\Models\ContentSeries;
use App\Models\DamAsset;
use App\Models\Project;
use App\Services\ActiveProjectGuard;
use App\Services\ContentAccess;
use App\Services\DamAssetAccess;
use App\Services\ProjectScopeAccess;
use App\Services\SeriesAccess;
use App\Services\SeriesConfigurationService;
use App\Services\SeriesOccurrenceService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ContentSeriesController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless(app(ContentAccess::class)->canEnter($request->user()), 403);
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:200'],
            'status' => ['nullable', Rule::in(['active', 'paused', 'archived'])],
            'ownerId' => ['nullable', 'integer'], 'projectId' => ['nullable', 'integer'],
            'departmentId' => ['nullable', 'integer'], 'contentType' => ['nullable', 'string', 'max:80'],
            'recurrenceType' => ['nullable', Rule::in(['weekly', 'monthly', 'manual', 'project_based'])],
            'sort' => ['nullable', Rule::in(['updated_at', 'created_at', 'name', 'next_sequence_number'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $query = $this->filteredQuery($request, $filters)
            ->with(['owner:id,name', 'project:id,name', 'department:id,name'])
            ->withMax('revisions as current_revision_version', 'version')
            ->withCount([
                'contents as occurrence_count',
                'contents as published_count' => fn ($query) => $query->where('status', 'published'),
                'contents as planned_count' => fn ($query) => $query->whereNotNull('planned_start_at')->whereNull('series_activated_at'),
                'tasks as active_task_count' => fn ($query) => $query->whereNotIn('tasks.status', ['completed', 'cancelled', 'archived']),
            ]);
        $sort = $filters['sort'] ?? 'updated_at';
        $direction = $filters['direction'] ?? 'desc';

        return ContentSeriesResource::collection($query->orderBy($sort, $direction)->orderBy('id', $direction)
            ->paginate((int) ($filters['per_page'] ?? 20))->withQueryString());
    }

    public function summary(Request $request): JsonResponse
    {
        abort_unless(app(ContentAccess::class)->canEnter($request->user()), 403);
        $query = app(SeriesAccess::class)->visibleTo($request->user());
        $statusCounts = (clone $query)->selectRaw('status, count(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');
        $ids = (clone $query)->select('content_series.id');
        $occurrences = Content::query()->whereIn('series_id', $ids);

        return response()->json([
            'data' => [
                'total' => (clone $query)->count(),
                'active' => (int) ($statusCounts['active'] ?? 0),
                'paused' => (int) ($statusCounts['paused'] ?? 0),
                'archived' => (int) ($statusCounts['archived'] ?? 0),
                'occurrences' => (clone $occurrences)->count(),
                'published' => (clone $occurrences)->where('status', 'published')->count(),
                'waitingActivation' => (clone $occurrences)->whereNotNull('planned_start_at')->whereNull('series_activated_at')->count(),
            ],
        ]);
    }

    public function itemSummary(Request $request, ContentSeries $contentSeries): JsonResponse
    {
        abort_unless(app(SeriesAccess::class)->canView($request->user(), $contentSeries), 403);
        $base = $contentSeries->contents();
        $counts = (clone $base)->selectRaw('status, count(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');

        return response()->json(['data' => [
            'total' => (clone $base)->count(),
            'published' => (int) ($counts['published'] ?? 0),
            'inProgress' => (int) (($counts['planning'] ?? 0) + ($counts['in_progress'] ?? 0)),
            'producing' => (int) ($counts['producing'] ?? 0),
            'waitingReview' => (int) (($counts['reviewing'] ?? 0) + ($counts['waiting_review'] ?? 0)),
            'readyPublish' => (int) (($counts['ready_to_publish'] ?? 0) + ($counts['ready_publish'] ?? 0)),
            'archived' => (int) ($counts['archived'] ?? 0),
            'overdue' => (clone $base)->whereNotIn('status', ['published', 'archived'])->whereDate('deadline', '<', today())->count(),
            'planned' => (clone $base)->whereNotNull('planned_start_at')->whereNull('series_activated_at')->count(),
            'latestCode' => (clone $base)->orderByDesc('series_sequence')->value('code'),
            'next' => app(SeriesOccurrenceService::class)->preview($contentSeries),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $project = ! empty($data['projectId']) ? Project::findOrFail((int) $data['projectId']) : null;
        abort_unless(app(SeriesAccess::class)->canCreate($request->user(), $project), 403);
        if (($data['recurrenceType'] ?? null) === 'project_based' && empty($data['projectId'])) {
            throw ValidationException::withMessages(['projectId' => 'برای برنامه‌ریزی پروژه‌محور انتخاب پروژه الزامی است.']);
        }
        $canonical = app(SeriesConfigurationService::class)->canonicalize($data);
        $this->validateReferenceAssets($request, $canonical['defaultContentPayload']);
        $series = DB::transaction(function () use ($request, $data, $canonical): ContentSeries {
            if (! empty($data['projectId'])) {
                app(ActiveProjectGuard::class)->project((int) $data['projectId']);
            }
            $series = ContentSeries::create([
                'name' => $data['name'], 'description' => $data['description'] ?? null,
                'code_prefix' => mb_strtoupper($data['codePrefix']), 'content_type' => $canonical['contentType'],
                'project_id' => $data['projectId'] ?? null, 'department_id' => $data['departmentId'] ?? null,
                'owner_id' => $data['ownerId'] ?? $request->user()->id, 'process_template_id' => $canonical['processTemplateId'],
                'recurrence_type' => $canonical['recurrenceType'], 'recurrence_config' => $canonical['recurrenceConfig'],
                'status' => 'active', 'default_content_payload' => $canonical['defaultContentPayload'],
                'default_publication_config' => $canonical['defaultPublicationConfig'], 'next_sequence_number' => 1,
                'lock_version' => 1, 'created_by' => $request->user()->id,
            ]);
            app(SeriesConfigurationService::class)->createInitial($series, $request->user(), $data['changeReason'] ?? null);
            $this->record($series, $request, 'series_created', ['name' => $series->name, 'status' => 'active']);

            return $series;
        });

        return (new ContentSeriesResource($this->detail($series)))->response()->setStatusCode(201);
    }

    public function show(Request $request, ContentSeries $contentSeries): ContentSeriesResource
    {
        abort_unless(app(SeriesAccess::class)->canView($request->user(), $contentSeries), 403);

        return new ContentSeriesResource($this->detail($contentSeries));
    }

    public function update(Request $request, ContentSeries $contentSeries): ContentSeriesResource
    {
        abort_unless(app(SeriesAccess::class)->canEdit($request->user(), $contentSeries), 403);
        $data = $this->validated($request, $contentSeries);
        $series = DB::transaction(function () use ($request, $contentSeries, $data): ContentSeries {
            $series = ContentSeries::whereKey($contentSeries->id)->lockForUpdate()->firstOrFail();
            abort_unless(app(SeriesAccess::class)->canEdit($request->user(), $series), 403);
            $this->assertVersion($series, (int) $data['lockVersion']);
            $targetProjectId = array_key_exists('projectId', $data) ? $data['projectId'] : $series->project_id;
            $targetDepartmentId = array_key_exists('departmentId', $data) ? $data['departmentId'] : $series->department_id;
            $targetOwnerId = $data['ownerId'] ?? $series->owner_id;
            $targetProject = $targetProjectId ? Project::findOrFail((int) $targetProjectId) : null;
            abort_unless(! $targetProject || app(ProjectScopeAccess::class)->canEdit($request->user(), $targetProject), 403);
            if ($targetProject) {
                app(ActiveProjectGuard::class)->project($targetProject->id);
            }
            $projectChanged = (string) ($series->project_id ?? '') !== (string) ($targetProjectId ?? '');
            abort_if($projectChanged && $series->contents()->exists(), 409,
                'پس از ایجاد نخستین رخداد، پروژه مجموعه برای حفظ یکپارچگی رخدادها تغییر نمی‌کند.');
            if (($data['recurrenceType'] ?? $series->recurrence_type) === 'project_based'
                && ! $targetProjectId) {
                throw ValidationException::withMessages(['projectId' => 'برای برنامه‌ریزی پروژه‌محور انتخاب پروژه الزامی است.']);
            }
            $canonical = app(SeriesConfigurationService::class)->canonicalize($data, $series);
            $this->validateReferenceAssets($request, $canonical['defaultContentPayload']);
            $before = $this->auditable($series);
            $series->update([
                'name' => $data['name'], 'description' => $data['description'] ?? null,
                'code_prefix' => mb_strtoupper($data['codePrefix']), 'content_type' => $canonical['contentType'],
                'project_id' => $targetProjectId, 'department_id' => $targetDepartmentId,
                'owner_id' => $targetOwnerId, 'process_template_id' => $canonical['processTemplateId'],
                'recurrence_type' => $canonical['recurrenceType'], 'recurrence_config' => $canonical['recurrenceConfig'],
                'default_content_payload' => $canonical['defaultContentPayload'],
                'default_publication_config' => $canonical['defaultPublicationConfig'],
                'lock_version' => (int) $series->lock_version + 1,
            ]);
            app(SeriesConfigurationService::class)->publishIfChanged($series, $request->user(), $data['changeReason'] ?? null);
            $series->refresh();
            $changes = $this->diff($before, $this->auditable($series));
            $this->record($series, $request, 'series_updated', ['changes' => $changes]);

            return $series;
        }, 3);

        return new ContentSeriesResource($this->detail($series));
    }

    public function destroy(Request $request, ContentSeries $contentSeries): JsonResponse
    {
        abort_unless(app(SeriesAccess::class)->canArchive($request->user(), $contentSeries), 403);
        $series = DB::transaction(function () use ($request, $contentSeries): ContentSeries {
            $series = ContentSeries::whereKey($contentSeries->id)->lockForUpdate()->firstOrFail();
            abort_unless(app(SeriesAccess::class)->canArchive($request->user(), $series), 403);
            if ($series->status !== 'archived') {
                $from = $series->status;
                $series->update(['status' => 'archived', 'archived_at' => now(), 'lock_version' => (int) $series->lock_version + 1]);
                $this->record($series, $request, 'series_archived', ['from' => $from, 'to' => 'archived']);
            }

            return $series;
        }, 3);

        return (new ContentSeriesResource($this->detail($series)))->response();
    }

    public function transition(Request $request, ContentSeries $contentSeries, string $command): ContentSeriesResource
    {
        abort_unless($command === 'archive'
            ? app(SeriesAccess::class)->canArchive($request->user(), $contentSeries)
            : app(SeriesAccess::class)->canEdit($request->user(), $contentSeries), 403);
        $data = $request->validate(['lockVersion' => ['required', 'integer', 'min:1'], 'reason' => ['nullable', 'string', 'max:500']]);
        $transitions = [
            'pause' => ['active', 'paused'], 'resume' => ['paused', 'active'],
            'archive' => ['*', 'archived'], 'restore' => ['archived', 'paused'],
        ];
        abort_unless(isset($transitions[$command]), 404);
        $series = DB::transaction(function () use ($request, $contentSeries, $command, $data, $transitions): ContentSeries {
            $series = ContentSeries::whereKey($contentSeries->id)->lockForUpdate()->firstOrFail();
            abort_unless($command === 'archive'
                ? app(SeriesAccess::class)->canArchive($request->user(), $series)
                : app(SeriesAccess::class)->canEdit($request->user(), $series), 403);
            $this->assertVersion($series, (int) $data['lockVersion']);
            [$expected, $next] = $transitions[$command];
            abort_if($series->status === $next || ($expected !== '*' && $series->status !== $expected), 409,
                'این فرمان با وضعیت فعلی مجموعه سازگار نیست.');
            $from = $series->status;
            $series->update([
                'status' => $next,
                'archived_at' => $next === 'archived' ? now() : ($command === 'restore' ? null : $series->archived_at),
                'lock_version' => (int) $series->lock_version + 1,
            ]);
            $this->record($series, $request, 'series_'.$command, [
                'from' => $from, 'to' => $next, 'reason' => $data['reason'] ?? null,
            ]);

            return $series;
        }, 3);

        return new ContentSeriesResource($this->detail($series));
    }

    public function preview(Request $request, ContentSeries $contentSeries): JsonResponse
    {
        abort_unless(app(SeriesAccess::class)->canView($request->user(), $contentSeries), 403);

        return response()->json(['data' => app(SeriesOccurrenceService::class)->preview($contentSeries)]);
    }

    public function previewRange(Request $request, ContentSeries $contentSeries): JsonResponse
    {
        abort_unless(app(SeriesAccess::class)->canView($request->user(), $contentSeries), 403);
        $data = $request->validate(['count' => ['nullable', 'integer', 'min:1', 'max:24']]);

        return response()->json(['data' => app(SeriesOccurrenceService::class)->previewRange($contentSeries, (int) ($data['count'] ?? 6))]);
    }

    public function createNext(Request $request, ContentSeries $contentSeries): JsonResponse
    {
        abort_unless(app(SeriesAccess::class)->canEdit($request->user(), $contentSeries), 403);
        $data = $request->validate([
            'periodKey' => ['required', 'string', 'max:120'], 'requestKey' => ['nullable', 'uuid'],
            'lockVersion' => ['nullable', 'integer', 'min:1'], 'startDate' => ['nullable', 'date'],
            'deadline' => ['nullable', 'date'], 'title' => ['nullable', 'string', 'max:255'],
        ]);
        if ($contentSeries->recurrence_type === 'manual' && (empty($data['startDate']) || empty($data['deadline']))) {
            throw ValidationException::withMessages(['startDate' => 'تاریخ شروع و مهلت رخداد دستی الزامی است.']);
        }
        $content = app(SeriesOccurrenceService::class)->createNext(
            $request->user(), $contentSeries, $data['periodKey'],
            Arr::only($data, ['startDate', 'deadline', 'title']),
            isset($data['lockVersion']) ? (int) $data['lockVersion'] : null, $data['requestKey'] ?? null,
        );

        return (new ContentResource($content))->response()->setStatusCode($content->wasRecentlyCreated ? 201 : 200);
    }

    public function createBatch(Request $request, ContentSeries $contentSeries): JsonResponse
    {
        abort_unless(app(SeriesAccess::class)->canEdit($request->user(), $contentSeries), 403);
        abort_if($contentSeries->recurrence_type === 'manual', 422, 'برای تکرار دستی هر رخداد را با تاریخ و مهلت صریح بسازید.');
        $data = $request->validate([
            'requestKey' => ['required', 'uuid'], 'count' => ['required', 'integer', 'min:1', 'max:24'],
            'lockVersion' => ['nullable', 'integer', 'min:1'],
        ]);
        $contents = app(SeriesOccurrenceService::class)->createBatch(
            $request->user(), $contentSeries, $data['requestKey'], (int) $data['count'],
            isset($data['lockVersion']) ? (int) $data['lockVersion'] : null,
        );

        return ContentResource::collection($contents)->response()->setStatusCode(201);
    }

    public function contents(Request $request, ContentSeries $contentSeries): AnonymousResourceCollection
    {
        abort_unless(app(SeriesAccess::class)->canView($request->user(), $contentSeries), 403);
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:200'], 'status' => ['nullable', 'string', 'max:50'],
            'revisionId' => ['nullable', 'integer'], 'activation' => ['nullable', Rule::in(['active', 'waiting'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $query = $contentSeries->contents()->with(['project:id,name'])
            ->when($data['search'] ?? null, fn ($query, $value) => $query->where(fn ($nested) => $nested
                ->where('title', 'like', '%'.$value.'%')->orWhere('code', 'like', '%'.$value.'%')))
            ->when($data['status'] ?? null, fn ($query, $value) => $query->where('status', $value))
            ->when($data['revisionId'] ?? null, fn ($query, $value) => $query->where('series_revision_id', $value))
            ->when(($data['activation'] ?? null) === 'active', fn ($query) => $query->whereNotNull('series_activated_at'))
            ->when(($data['activation'] ?? null) === 'waiting', fn ($query) => $query->whereNull('series_activated_at'))
            ->orderByDesc('series_sequence')->paginate((int) ($data['per_page'] ?? 20))->withQueryString();

        return ContentResource::collection($query);
    }

    public function revisions(Request $request, ContentSeries $contentSeries): JsonResponse
    {
        abort_unless(app(SeriesAccess::class)->canView($request->user(), $contentSeries), 403);
        $data = $request->validate(['per_page' => ['nullable', 'integer', 'min:1', 'max:50']]);
        $revisions = $contentSeries->revisions()->with('author:id,name')->orderByDesc('version')
            ->paginate((int) ($data['per_page'] ?? 20))->withQueryString();

        return ContentSeriesRevisionResource::collection($revisions)->response();
    }

    public function activity(Request $request, ContentSeries $contentSeries): JsonResponse
    {
        abort_unless(app(SeriesAccess::class)->canView($request->user(), $contentSeries), 403);
        $logs = ActivityLog::query()->with('user:id,name')
            ->where('metadata->seriesId', (string) $contentSeries->id)
            ->latest('id')->paginate(min(100, max(1, $request->integer('per_page', 25))));

        return response()->json([
            'data' => $logs->getCollection()->map(fn ($log) => [
                'id' => (string) $log->id, 'event' => $log->type,
                'action' => $log->action,
                'actor' => $log->user ? ['id' => (string) $log->user->id, 'name' => $log->user->name] : null,
                'properties' => $this->safeProperties((array) (($log->metadata ?? [])['properties'] ?? [])),
                'createdAt' => optional($log->created_at)->toIso8601String(),
            ]),
            'meta' => ['current_page' => $logs->currentPage(), 'last_page' => $logs->lastPage(), 'total' => $logs->total()],
        ]);
    }

    public function integrity(Request $request, ContentSeries $contentSeries): JsonResponse
    {
        abort_unless($request->user()->hasPermission('integrity.view'), 403);
        abort_unless(app(SeriesAccess::class)->canView($request->user(), $contentSeries), 403);
        $duplicatePeriods = $contentSeries->contents()->selectRaw('period_key, count(*) as aggregate')
            ->whereNotNull('period_key')->groupBy('period_key')->havingRaw('count(*) > 1')->pluck('aggregate', 'period_key');
        $missingRevisions = $contentSeries->contents()->whereNull('series_revision_id')->count();
        $lateActivation = $contentSeries->contents()->whereNull('series_activated_at')
            ->whereNotNull('planned_start_at')->where('planned_start_at', '<=', now())->count();
        $issues = collect();
        if ($duplicatePeriods->isNotEmpty()) {
            $issues->push(['code' => 'duplicate_period', 'count' => $duplicatePeriods->sum(), 'message' => 'کلید دوره تکراری مشاهده شد.']);
        }
        if ($missingRevisions) {
            $issues->push(['code' => 'missing_revision', 'count' => $missingRevisions, 'message' => 'برخی رخدادهای قدیمی پیوند نسخه ندارند.']);
        }
        if ($lateActivation) {
            $issues->push(['code' => 'late_activation', 'count' => $lateActivation, 'message' => 'رخداد سررسیدشده در انتظار فعال‌سازی است.']);
        }

        return response()->json(['data' => ['healthy' => $issues->isEmpty(), 'issues' => $issues, 'checkedAt' => now()->toIso8601String()]]);
    }

    private function validated(Request $request, ?ContentSeries $series = null): array
    {
        $id = $series?->id;

        return $request->validate([
            'name' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:5000'],
            'codePrefix' => ['required', 'string', 'max:30', 'regex:/^[A-Za-z0-9][A-Za-z0-9_-]*$/'],
            'contentType' => ['required', 'string', 'max:80'], 'projectId' => ['nullable', 'integer', 'exists:projects,id'],
            'departmentId' => ['nullable', 'integer', Rule::exists('departments', 'id')->where(function ($query) use ($series): void {
                $query->where('status', 'active');
                if ($series?->department_id) {
                    $query->orWhere('id', $series->department_id);
                }
            })],
            'ownerId' => ['nullable', 'integer', Rule::exists('users', 'id')->where(function ($query) use ($series): void {
                $query->where('status', 'active');
                if ($series?->owner_id) {
                    $query->orWhere('id', $series->owner_id);
                }
            })],
            'processTemplateId' => ['nullable', 'string', 'max:120'],
            'recurrenceType' => ['required', Rule::in(['weekly', 'monthly', 'manual', 'project_based'])],
            'recurrenceConfig' => ['nullable', 'array'], 'recurrenceConfig.startDate' => ['nullable', 'date'],
            'recurrenceConfig.interval' => ['nullable', 'integer', 'min:1', 'max:120'],
            'recurrenceConfig.deadlineOffsetDays' => ['nullable', 'integer', 'min:0', 'max:3650'],
            'recurrenceConfig.calendar' => ['nullable', Rule::in(['jalali', 'gregorian'])],
            'recurrenceConfig.dayOfMonth' => ['nullable', 'integer', 'min:1', 'max:31'],
            'recurrenceConfig.activationTime' => ['nullable', 'date_format:H:i'],
            'defaultContentPayload' => ['nullable', 'array'], 'defaultPublicationConfig' => ['nullable', 'array'],
            'applyTemplate' => ['nullable', 'boolean'], 'changeReason' => ['nullable', 'string', 'max:500'],
            'lockVersion' => [$series ? 'required' : 'nullable', 'integer', 'min:1'],
        ]);
    }

    /** @param array<string,mixed> $filters */
    private function filteredQuery(Request $request, array $filters): Builder
    {
        return app(SeriesAccess::class)->visibleTo($request->user())
            ->when($filters['search'] ?? null, fn ($query, $search) => $query->where(fn ($nested) => $nested
                ->where('name', 'like', '%'.$search.'%')->orWhere('code_prefix', 'like', '%'.$search.'%')
                ->orWhere('description', 'like', '%'.$search.'%')))
            ->when($filters['status'] ?? null, fn ($query, $value) => $query->where('status', $value))
            ->when($filters['ownerId'] ?? null, fn ($query, $value) => $query->where('owner_id', $value))
            ->when($filters['projectId'] ?? null, fn ($query, $value) => $query->where('project_id', $value))
            ->when($filters['departmentId'] ?? null, fn ($query, $value) => $query->where('department_id', $value))
            ->when($filters['contentType'] ?? null, fn ($query, $value) => $query->where('content_type', $value))
            ->when($filters['recurrenceType'] ?? null, fn ($query, $value) => $query->where('recurrence_type', $value));
    }

    private function detail(ContentSeries $series): ContentSeries
    {
        return $series->fresh()->load(['owner:id,name', 'project:id,name', 'department:id,name', 'currentRevision'])
            ->loadCount([
                'contents as occurrence_count', 'contents as published_count' => fn ($query) => $query->where('status', 'published'),
                'contents as planned_count' => fn ($query) => $query->whereNotNull('planned_start_at')->whereNull('series_activated_at'),
                'tasks as active_task_count' => fn ($query) => $query->whereNotIn('tasks.status', ['completed', 'cancelled', 'archived']),
            ]);
    }

    private function assertVersion(ContentSeries $series, int $expected): void
    {
        abort_unless((int) $series->lock_version === $expected, 409,
            'این مجموعه هم‌زمان تغییر کرده است؛ صفحه را تازه کنید و تغییرات را دوباره بررسی کنید.');
    }

    /** @return array<string,mixed> */
    private function auditable(ContentSeries $series): array
    {
        return [
            'name' => $series->name, 'description' => $series->description, 'contentType' => $series->content_type,
            'projectId' => $series->project_id, 'departmentId' => $series->department_id, 'ownerId' => $series->owner_id,
            'processTemplateId' => $series->process_template_id, 'recurrenceType' => $series->recurrence_type,
            'recurrenceConfig' => $series->recurrence_config, 'defaultPublicationConfig' => $series->default_publication_config,
        ];
    }

    /** @return array<int,array<string,mixed>> */
    private function diff(array $before, array $after): array
    {
        $redacted = ['description', 'recurrenceConfig', 'defaultPublicationConfig'];

        return collect($before)->filter(fn ($value, $key) => $value !== ($after[$key] ?? null))->take(20)
            ->map(fn ($value, $key) => in_array($key, $redacted, true)
                ? ['field' => $key, 'changed' => true]
                : ['field' => $key, 'before' => $value, 'after' => $after[$key] ?? null])
            ->values()->all();
    }

    /** @param array<string,mixed> $payload */
    private function validateReferenceAssets(Request $request, array $payload): void
    {
        foreach (collect($payload['assetIds'] ?? [])->unique() as $assetId) {
            $asset = DamAsset::query()->find((int) $assetId);
            if (! $asset || ! app(DamAssetAccess::class)->canView($request->user(), $asset)) {
                throw ValidationException::withMessages(['defaultContentPayload.assetIds' => 'دارایی مرجع انتخاب‌شده در دسترس نیست.']);
            }
        }
    }

    /** @param array<string,mixed> $properties */
    private function record(ContentSeries $series, Request $request, string $event, array $properties): void
    {
        ActivityLog::create([
            'user_id' => $request->user()->id,
            'project_id' => $series->project_id,
            'type' => $event,
            'action' => match ($event) {
                'series_created' => 'ایجاد مجموعه محتوا', 'series_updated' => 'ویرایش مجموعه محتوا',
                'series_pause' => 'توقف مجموعه محتوا', 'series_resume' => 'ادامه مجموعه محتوا',
                'series_archive', 'series_archived' => 'بایگانی مجموعه محتوا',
                'series_restore' => 'بازگردانی مجموعه محتوا', default => 'عملیات مجموعه محتوا',
            },
            'details' => 'series:'.$series->id,
            'metadata' => [
                'recordType' => 'content_series', 'recordId' => (string) $series->id,
                'seriesId' => (string) $series->id, 'properties' => $this->safeProperties($properties),
            ],
        ]);
    }

    /** @return array<string,mixed> */
    private function safeProperties(array $properties): array
    {
        return Arr::only($properties, ['name', 'status', 'from', 'to', 'reason', 'changes', 'contentId', 'sequence', 'periodKey']);
    }
}
