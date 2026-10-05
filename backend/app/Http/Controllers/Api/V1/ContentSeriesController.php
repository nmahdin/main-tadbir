<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ContentResource;
use App\Http\Resources\ContentSeriesResource;
use App\Models\ActivityLog;
use App\Models\ContentSeries;
use App\Models\Project;
use App\Models\User;
use App\Services\ProjectScopeAccess;
use App\Services\SeriesAccess;
use App\Services\SeriesOccurrenceService;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ContentSeriesController extends Controller
{
    public function index(Request $request)
    {
        $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'between:1,100'],
            'search' => ['sometimes', 'string', 'max:120'], 'status' => ['sometimes', Rule::in(['active', 'paused', 'archived'])],
            'project_id' => ['sometimes', 'integer', 'exists:projects,id'], 'content_type' => ['sometimes', 'string', 'max:80'],
        ]);
        $actor = $request->user();
        abort_unless($actor?->isActive() && app(\App\Services\ContentAccess::class)->canEnter($actor), 403);
        $projectIds = $actor->role?->key === 'admin'
            ? Project::pluck('id')
            : Project::where('project_manager_id', $actor->id)
                ->orWhereHas('members', fn ($members) => $members->where('users.id', $actor->id))->pluck('id');
        $departmentIds = app(\App\Services\ContentAccess::class)->departmentIds($actor);
        $query = ContentSeries::query()->with(['project', 'contents' => fn ($contents) => $contents->orderByDesc('series_sequence')->limit(1)])->withCount('contents')
            ->where(function ($scope) use ($actor, $projectIds, $departmentIds): void {
                $scope->whereIn('project_id', $projectIds)
                    ->orWhere(function ($standalone) use ($actor, $departmentIds): void {
                        $standalone->whereNull('project_id')->where(function ($visible) use ($actor, $departmentIds): void {
                            if ($actor->hasPermission('content.view')) $visible->whereRaw('1=1');
                            else $visible->where('owner_id', $actor->id)->orWhereIn('department_id', $departmentIds);
                        });
                    });
            })
            ->when($request->filled('project_id'), fn ($q) => $q->where('project_id', $request->integer('project_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')), fn ($q) => $q->where('status', '!=', 'archived'))
            ->when($request->filled('content_type'), fn ($q) => $q->where('content_type', $request->input('content_type')))
            ->when($request->filled('search'), function ($q) use ($request): void {
                $term = $request->string('search')->toString();
                $q->where(fn ($search) => $search->where('name', 'like', "%{$term}%")->orWhere('description', 'like', "%{$term}%"));
            })->latest('updated_at');

        return ContentSeriesResource::collection($query->paginate($request->integer('per_page', 20)));
    }

    public function store(Request $request)
    {
        $data = $this->validateSeries($request, true);
        $project = ! empty($data['projectId']) ? app(\App\Services\ActiveProjectGuard::class)->project((int) $data['projectId']) : null;
        abort_unless(app(SeriesAccess::class)->canCreate($request->user(), $project), 403);
        if (! empty($data['ownerId'])) abort_unless(User::whereKey($data['ownerId'])->where('status', 'active')->exists(), 422);

        $series = DB::transaction(function () use ($request, $data): ContentSeries {
            $series = ContentSeries::create($this->attributes($data, $request->user()->id));
            ActivityLog::create([
                'user_id' => $request->user()->id, 'project_id' => $series->project_id,
                'type' => 'series_created', 'action' => 'ایجاد مجموعه محتوا', 'details' => 'series:'.$series->id,
                'metadata' => ['recordType' => 'series', 'recordId' => (string) $series->id,
                    'changes' => [['field' => 'status', 'from' => null, 'to' => 'active']]],
            ]);
            return $series;
        });

        return (new ContentSeriesResource($series->load('project')->loadCount('contents')))->response()->setStatusCode(201);
    }

    public function show(Request $request, ContentSeries $series): ContentSeriesResource
    {
        abort_unless(app(SeriesAccess::class)->canView($request->user(), $series->load('project')), 403);
        $series->loadCount('contents')->load(['contents' => fn ($q) => $q->latest('series_sequence')->limit(1)]);
        return new ContentSeriesResource($series);
    }

    public function update(Request $request, ContentSeries $series): ContentSeriesResource
    {
        $data = $this->validateSeries($request, false);
        return DB::transaction(function () use ($request, $series, $data): ContentSeriesResource {
            $series = ContentSeries::with('project')->whereKey($series->id)->lockForUpdate()->firstOrFail();
            abort_unless(app(SeriesAccess::class)->canEdit($request->user(), $series), 403);
            if (array_key_exists('projectId', $data)) {
                $projectChanged = (string) ($data['projectId'] ?? '') !== (string) ($series->project_id ?? '');
                $project = $data['projectId']
                    ? ($projectChanged
                        ? app(\App\Services\ActiveProjectGuard::class)->project((int) $data['projectId'])
                        : Project::findOrFail((int) $data['projectId']))
                    : null;
                abort_unless(! $project || app(ProjectScopeAccess::class)->canEdit($request->user(), $project), 403);
                abort_if($projectChanged && $series->contents()->exists(), 409,
                    'پس از ایجاد رخداد، پروژه مجموعه تغییر نمی‌کند؛ رخدادها باید پروژه یکسان داشته باشند.');
            }
            $before = Arr::only($series->getAttributes(), ['name', 'status', 'recurrence_type', 'content_type', 'project_id']);
            $series->update($this->attributes($data));
            $changes = [];
            foreach (['name', 'status', 'recurrence_type', 'content_type', 'project_id'] as $field) {
                if (array_key_exists($field, $before) && $before[$field] != $series->{$field}) {
                    $changes[] = ['field' => $field, 'from' => $before[$field], 'to' => $series->{$field}];
                }
            }
            if ($changes) ActivityLog::create([
                'user_id' => $request->user()->id, 'project_id' => $series->project_id,
                'type' => 'series_updated', 'action' => 'ویرایش مجموعه محتوا', 'details' => 'series:'.$series->id,
                'metadata' => ['recordType' => 'series', 'recordId' => (string) $series->id, 'changes' => $changes],
            ]);
            return new ContentSeriesResource($series->refresh()->load('project')->loadCount('contents'));
        }, 3);
    }

    public function archive(Request $request, ContentSeries $series)
    {
        return DB::transaction(function () use ($request, $series) {
            $series = ContentSeries::with('project')->whereKey($series->id)->lockForUpdate()->firstOrFail();
            abort_unless(app(SeriesAccess::class)->canArchive($request->user(), $series), 403);
            if ($series->status !== 'archived') {
                $from = $series->status;
                $series->update(['status' => 'archived', 'archived_at' => now()]);
                ActivityLog::create(['user_id' => $request->user()->id, 'project_id' => $series->project_id,
                    'type' => 'series_archived', 'action' => 'بایگانی مجموعه بدون حذف رخدادها', 'details' => 'series:'.$series->id,
                    'metadata' => ['recordType' => 'series', 'recordId' => (string) $series->id,
                        'changes' => [['field' => 'status', 'from' => $from, 'to' => 'archived']]]]);
            }
            return new ContentSeriesResource($series->refresh()->loadCount('contents'));
        }, 3);
    }

    public function preview(Request $request, ContentSeries $series, SeriesOccurrenceService $occurrences)
    {
        abort_unless(app(SeriesAccess::class)->canView($request->user(), $series->load('project')), 403);
        return response()->json(['data' => $occurrences->preview($series)]);
    }

    public function createNext(Request $request, ContentSeries $series, SeriesOccurrenceService $occurrences)
    {
        $data = $request->validate(['periodKey' => ['required', 'string', 'max:120']]);
        $content = $occurrences->createNext($request->user(), $series, $data['periodKey']);
        return (new ContentResource($content))->response()->setStatusCode($content->wasRecentlyCreated ? 201 : 200);
    }

    public function batch(Request $request, ContentSeries $series, SeriesOccurrenceService $occurrences)
    {
        $data = $request->validate(['requestKey' => ['required', 'uuid'], 'count' => ['required', 'integer', 'between:1,52']]);
        $contents = $occurrences->createBatch($request->user(), $series, $data['requestKey'], (int) $data['count']);
        return response()->json(['data' => ContentResource::collection($contents)->resolve($request)], 201);
    }

    public function occurrences(Request $request, ContentSeries $series)
    {
        abort_unless(app(SeriesAccess::class)->canView($request->user(), $series->load('project')), 403);
        $request->validate(['page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'between:1,100'],
            'status' => ['sometimes', 'string', 'max:80'], 'search' => ['sometimes', 'string', 'max:120']]);
        $query = $series->contents()->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('search'), fn ($q) => $q->where('title', 'like', '%'.$request->input('search').'%'))
            ->orderByDesc('series_sequence');
        return ContentResource::collection($query->paginate($request->integer('per_page', 20)));
    }

    public function summary(Request $request, ContentSeries $series)
    {
        abort_unless(app(SeriesAccess::class)->canView($request->user(), $series->load('project')), 403);
        $base = $series->contents();
        return response()->json(['data' => [
            'total' => (clone $base)->count(),
            'published' => (clone $base)->where('status', 'published')->count(),
            'inProgress' => (clone $base)->whereIn('status', ['planning', 'producing', 'reviewing', 'revising', 'ready_to_publish'])->count(),
            'producing' => (clone $base)->whereIn('status', ['planning', 'producing', 'revising'])->count(),
            'waitingReview' => (clone $base)->where('status', 'reviewing')->count(),
            'readyPublish' => (clone $base)->where('status', 'ready_to_publish')->count(),
            'overdue' => (clone $base)->whereDate('deadline', '<', today())->whereNotIn('status', ['published', 'archived', 'cancelled'])->count(),
            'planned' => (clone $base)->whereNotNull('payload->_seriesPlanning->activateAt')->whereNull('payload->_seriesPlanning->activatedAt')->count(),
            'archived' => (clone $base)->where('status', 'archived')->count(),
            'latestCode' => (clone $base)->orderByDesc('series_sequence')->value('code'),
            'next' => app(SeriesOccurrenceService::class)->preview($series),
        ]]);
    }

    private function validateSeries(Request $request, bool $create): array
    {
        $required = $create ? 'required' : 'sometimes';
        return $request->validate([
            'name' => [$required, 'string', 'max:255'], 'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'codePrefix' => ['sometimes', 'nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9][A-Za-z0-9._-]*$/'],
            'contentType' => [$required, 'string', 'max:80'], 'projectId' => ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
            'departmentId' => ['sometimes', 'nullable', 'integer', 'exists:departments,id'], 'ownerId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'processTemplateId' => ['sometimes', 'nullable', 'string', 'max:120'],
            'status' => ['sometimes', Rule::in(['active', 'paused'])],
            'recurrenceType' => [$required, Rule::in(['weekly', 'monthly', 'project_based', 'manual'])],
            'recurrenceConfig' => ['sometimes', 'array'], 'recurrenceConfig.startDate' => ['sometimes', 'date'],
            'recurrenceConfig.interval' => ['sometimes', 'integer', 'between:1,120'], 'recurrenceConfig.deadlineOffsetDays' => ['sometimes', 'integer', 'between:0,3650'],
            'defaultContentPayload' => ['sometimes', 'array'], 'defaultPublicationConfig' => ['sometimes', 'array'],
        ]);
    }

    private function attributes(array $data, ?int $creatorId = null): array
    {
        $map = [
            'name' => 'name', 'description' => 'description', 'codePrefix' => 'code_prefix', 'contentType' => 'content_type',
            'projectId' => 'project_id', 'departmentId' => 'department_id', 'ownerId' => 'owner_id',
            'processTemplateId' => 'process_template_id', 'status' => 'status', 'recurrenceType' => 'recurrence_type',
            'recurrenceConfig' => 'recurrence_config', 'defaultContentPayload' => 'default_content_payload',
            'defaultPublicationConfig' => 'default_publication_config',
        ];
        $attributes = [];
        foreach ($map as $input => $column) if (array_key_exists($input, $data)) $attributes[$column] = $data[$input];
        if ($creatorId) {
            $attributes += ['created_by' => $creatorId, 'owner_id' => $attributes['owner_id'] ?? $creatorId,
                'status' => $attributes['status'] ?? 'active', 'next_sequence_number' => 1];
        }
        return $attributes;
    }
}
