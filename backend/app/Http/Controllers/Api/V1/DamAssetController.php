<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Content;
use App\Models\DamActivity;
use App\Models\DamAsset;
use App\Models\DamFile;
use App\Models\DamFolder;
use App\Models\DamTag;
use App\Models\Department;
use App\Models\Project;
use App\Models\SystemSetting;
use App\Models\Task;
use App\Models\User;
use App\Services\ContentAccess;
use App\Services\DamFolderStorage;
use App\Services\DamService;
use App\Services\TaskOperations;
use App\Support\Dam\DamRelationRole;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DamAssetController extends Controller
{
    /** @return list<string> */
    private function allowedStatuses(): array
    {
        $stored = SystemSetting::query()->where('key', 'dam_statuses')->value('value');
        if (is_string($stored)) {
            $stored = json_decode($stored, true);
        }
        $statuses = collect(is_array($stored) ? $stored : [])
            ->pluck('id')
            ->filter(fn ($id) => is_string($id) && preg_match('/^[A-Za-z0-9_-]+$/', $id) === 1)
            ->unique()
            ->values()
            ->all();

        return $statuses ?: ['draft', 'review', 'approved', 'published', 'archived', 'rejected'];
    }

    private function permitted(Request $request, string $permission, ?DamAsset $asset = null): void
    {
        $actor = $request->user()?->fresh();
        $contentMemberAccess = $asset && in_array($permission, ['assets.view', 'assets.preview', 'assets.download'], true)
            && $this->canAccessLinkedContent($actor, $asset);
        abort_unless($actor?->isActive() && ($actor->hasAnyPermission($permission) || $contentMemberAccess), 403);

        if ($asset && $asset->confidentiality === 'confidential') {
            abort_unless($this->canAccessConfidential($actor, $asset), 403);
        }
    }

    private function permittedCollection(Request $request, ?Content $content): void
    {
        $actor = $request->user()?->fresh();
        $contentMemberAccess = $actor && $content && app(ContentAccess::class)->canView($actor, $content);

        abort_unless($actor?->isActive() && ($actor->hasPermission('assets.view') || $contentMemberAccess), 403);
    }

    private function canAccessLinkedContent(?User $user, DamAsset $asset): bool
    {
        return $user ? app(\App\Services\DamAssetAccess::class)->canAccessLinkedContent($user, $asset) : false;
    }

    private function canAccessConfidential(User $user, DamAsset $asset): bool
    {
        return app(\App\Services\DamAssetAccess::class)->canView($user, $asset);
    }

    /** Apply one visibility scope to lists, duplicate checks, counters and feeds. */
    private function visibleAssets(Request $request): Builder
    {
        return app(\App\Services\DamAssetAccess::class)->visibleTo($request->user());
    }

    public function index(Request $request)
    {
        $data = $request->validate([
            'type' => ['nullable', Rule::in(['file', 'content'])],
            'search' => 'nullable|string|max:200',
            'project_id' => 'nullable|integer',
            'task_id' => 'nullable|integer',
            'department_id' => 'nullable|integer',
            'content_id' => 'nullable|integer|exists:contents,id',
            'folder_id' => 'nullable|integer',
            'category_id' => 'nullable|integer',
            'status' => ['nullable', Rule::in($this->allowedStatuses())],
            'owner_id' => 'nullable|integer',
            'confidentiality' => ['nullable', Rule::in(['public', 'internal', 'confidential'])],
            'created_from' => ['nullable', 'date_format:Y-m-d'],
            'created_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:created_from'],
            'orphan' => ['nullable', 'boolean'],
            'sort' => ['nullable', Rule::in(['updated_at', 'created_at', 'title', 'file_size'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => 'nullable|integer|min:1|max:100',
            'page' => 'sometimes|integer|between:1,100000',
        ]);

        $content = ! empty($data['content_id']) ? Content::query()->find((int) $data['content_id']) : null;
        $this->permittedCollection($request, $content);
        $query = $this->visibleAssets($request)->with([
            'latestFile', 'latestVersion', 'contentItem', 'relations', 'tags', 'category', 'folder',
            'owner:id,name,username,avatar,title', 'creator:id,name,username,avatar,title',
        ])->withMax('latestFile', 'file_size')->withMax('versions', 'version_number');

        if (! empty($data['type'])) {
            $query->where('type', $data['type']);
        }
        if (! empty($data['search'])) {
            $term = '%'.addcslashes($data['search'], '%_\\').'%';
            $query->where(fn (Builder $assets) => $assets
                ->where('title', 'like', $term)
                ->orWhere('description', 'like', $term)
                ->orWhereHas('latestFile', fn (Builder $file) => $file->where('original_filename', 'like', $term))
                ->orWhereHas('tags', fn (Builder $tags) => $tags->where('name', 'like', $term))
                ->orWhereHas('contentItem', fn (Builder $content) => $content->where('content_plain_text', 'like', $term))
                ->orWhereHas('relations', fn (Builder $relations) => $relations
                    ->where('related_type', 'content')
                    ->whereIn('related_id', Content::query()
                        ->where(fn (Builder $contents) => $contents->where('code', 'like', $term)->orWhere('title', 'like', $term))
                        ->select('id'))));
        }

        foreach (['project', 'task', 'department', 'content'] as $type) {
            if (! empty($data[$type.'_id'])) {
                $query->whereHas('relations', fn (Builder $relations) => $relations
                    ->where('related_type', $type)
                    ->where('related_id', $data[$type.'_id']));
            }
        }

        foreach (['category_id', 'owner_id', 'status', 'confidentiality'] as $field) {
            if (isset($data[$field])) {
                $query->where($field, $data[$field]);
            }
        }
        if (array_key_exists('folder_id', $data)) {
            (int) $data['folder_id'] === 0
                ? $query->whereNull('folder_id')
                : $query->where('folder_id', $data['folder_id']);
        }
        $query->when($data['created_from'] ?? null, fn (Builder $q, string $date) => $q->whereDate('created_at', '>=', $date))
            ->when($data['created_to'] ?? null, fn (Builder $q, string $date) => $q->whereDate('created_at', '<=', $date));
        if (($data['orphan'] ?? false) === true || ($data['orphan'] ?? null) === '1') {
            $query->whereDoesntHave('relations', fn (Builder $relations) => $relations
                ->whereIn('related_type', ['content', 'task', 'project', 'department']));
        }

        $sort = $data['sort'] ?? 'updated_at';
        $direction = $data['direction'] ?? 'desc';
        $sortColumn = $sort === 'file_size' ? 'latest_file_file_size' : $sort;

        $page = $query->orderBy($sortColumn, $direction)->orderBy('id', $direction)
            ->paginate($data['per_page'] ?? 20)->withQueryString();
        $page->setCollection(app(\App\Services\DamRelationPresenter::class)->attach($page->getCollection()));

        return $page;
    }

    public function summary(Request $request)
    {
        $this->permitted($request, 'assets.view');
        $visible = $this->visibleAssets($request);

        return response()->json([
            'data' => [
                'total' => (clone $visible)->count(),
                'files' => (clone $visible)->where('type', 'file')->count(),
                'contents' => (clone $visible)->where('type', 'content')->count(),
                // Quota is organization-wide, so consumed bytes must use the same scope as the configured total.
                'storage_bytes' => (int) DamFile::query()->sum('file_size'),
                'storage_limit_bytes' => (int) config('dam.storage_quota_bytes'),
                'folders' => DamFolder::query()->count(),
            ],
        ]);
    }

    public function activities(Request $request)
    {
        $this->permitted($request, 'assets.view');
        $request->validate([
            'page' => ['sometimes', 'integer', 'between:1,100000'],
            'per_page' => ['sometimes', 'integer', 'between:1,100'],
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'date_format:Y-m-d'],
        ]);
        if ($request->filled('from') && $request->filled('to') && $request->string('to')->toString() < $request->string('from')->toString()) {
            throw ValidationException::withMessages(['to' => 'تاریخ پایان باید برابر یا بعد از تاریخ شروع باشد.']);
        }

        $visibleIds = $this->visibleAssets($request)->select('dam_assets.id');
        $activities = DamActivity::query()
            ->whereIn('asset_id', $visibleIds)
            ->with(['actor:id,name', 'asset:id,title,type'])
            ->when($request->date('from'), fn ($query, $from) => $query->whereDate('created_at', '>=', $from))
            ->when($request->date('to'), fn ($query, $to) => $query->whereDate('created_at', '<=', $to))
            ->latest('created_at')
            ->paginate(min(max($request->integer('per_page', 20), 1), 100));

        return $activities;
    }

    public function store(Request $request, DamService $service)
    {
        $this->permitted($request, 'assets.upload');
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:5000',
            'file' => 'required_without:body|file|max:20480',
            'body' => 'required_without:file|string|max:1000000',
            'status' => ['nullable', Rule::in($this->allowedStatuses())],
            'confidentiality' => ['nullable', Rule::in(['public', 'internal', 'confidential'])],
            'access_grants' => 'nullable|array',
            'access_grants.projects' => 'nullable|array|max:50',
            'access_grants.projects.*' => 'integer|exists:projects,id',
            'access_grants.users' => 'nullable|array|max:100',
            'access_grants.users.*' => 'integer|exists:users,id',
            'access_grants.roles' => 'nullable|array|max:50',
            'access_grants.roles.*' => 'string|exists:roles,key',
            'project_id' => 'nullable|integer|exists:projects,id',
            'task_id' => 'nullable|integer|exists:tasks,id',
            'department_id' => 'nullable|integer|exists:departments,id',
            'content_id' => 'nullable|integer|exists:contents,id',
            'content_bucket' => ['nullable', Rule::in(['attachments', 'inputs', 'initial_input', 'working', 'outputs', 'final', 'publication'])],
            'relation_role' => ['nullable', Rule::in(DamRelationRole::ALL)],
            'stage_id' => 'nullable|string|max:120|required_with:output_id',
            'output_id' => 'nullable|string|max:120',
            'relation_metadata' => 'nullable|array|max:20',
            'folder_id' => 'nullable|integer|exists:dam_folders,id',
            'category_id' => 'nullable|integer|exists:dam_categories,id',
            'tags' => 'nullable|array|max:20',
            'tags.*' => 'string|max:50',
            'duplicate_action' => ['nullable', Rule::in(['warn', 'reuse', 'new_version', 'create'])],
            'duplicate_asset_id' => 'nullable|integer|exists:dam_assets,id',
            'change_description' => 'nullable|string|max:1000',
        ]);

        if ($request->hasFile('file') && $this->isDisallowedFilename($request->file('file')->getClientOriginalName())) {
            abort(422, 'این نوع فایل برای بارگذاری مجاز نیست.');
        }
        if (! empty($data['project_id'])) {
            $this->permitted($request, 'projects.view');
        }
        if (! empty($data['task_id'])) {
            $this->permitted($request, 'tasks.view');
        }
        if (! empty($data['department_id'])) {
            $this->permitted($request, 'departments.view');
        }
        if (! empty($data['content_id'])) {
            $linkedContent = Content::findOrFail($data['content_id']);
            abort_unless(app(ContentAccess::class)->canView($request->user(), $linkedContent), 403);
            $this->guardWorkflowContext($linkedContent, $data['stage_id'] ?? null, $data['output_id'] ?? null);
        } elseif (! empty($data['stage_id']) || ! empty($data['output_id'])) {
            throw ValidationException::withMessages(['content_id' => 'مرحله و خروجی فقط همراه محتوای مرتبط معتبر است.']);
        }
        if (! empty($data['task_id']) && ! empty($data['project_id'])) {
            abort_unless(Task::find($data['task_id'])?->project_id === (int) $data['project_id'], 422, 'وظیفه متعلق به پروژه انتخابی نیست.');
        }
        if (! empty($data['status']) && $data['status'] !== 'draft') {
            abort_unless($request->user()->isAdmin() || $request->user()->hasPermission('assets.manage_access'), 403);
        }

        abort_if($request->hasFile('file') && $request->filled('body'), 422, 'فایل و متن را جداگانه ثبت کنید.');
        abort_if(! $request->hasFile('file') && ! trim($data['body'] ?? ''), 422, 'متن نمی‌تواند خالی باشد.');
        $data['department_id'] ??= $request->user()->department_id;
        $data['status'] ??= $this->allowedStatuses()[0];

        if ($request->hasFile('file')) {
            $checksum = hash_file('sha256', $request->file('file')->getRealPath());
            $duplicate = $request->user()->hasPermission('assets.view')
                ? $this->visibleAssets($request)
                    ->whereHas('files', fn (Builder $files) => $files->where('checksum', $checksum))
                    ->with(['latestFile', 'relations', 'versions'])->first()
                : null;
            // An inaccessible checksum match behaves exactly like no match: no
            // title, id, existence flag or timing-specific response is exposed.
            if ($duplicate) {
                $action = $data['duplicate_action'] ?? 'warn';
                if ($action === 'warn') {
                    return response()->json([
                        'message' => 'فایل مشابه قبلاً در کتابخانه وجود دارد.',
                        'code' => 'dam_duplicate_detected',
                        'data' => [
                            'duplicate' => ['id' => $duplicate->id, 'title' => $duplicate->title],
                            'allowed_actions' => ['reuse', 'new_version', 'create', 'cancel'],
                        ],
                    ], 409);
                }
                if ($action === 'reuse') {
                    $this->relateUploadedContexts($service, $duplicate, $request, $data);
                    $duplicate->activities()->create([
                        'actor_id' => $request->user()->id,
                        'action' => 'duplicate_reused',
                        'metadata' => ['checksum' => $checksum],
                    ]);

                    return response()->json(['data' => $duplicate->fresh()->load(['latestFile', 'relations', 'versions']), 'reused' => true]);
                }
                if ($action === 'new_version') {
                    abort_unless($request->user()->hasPermission('assets.create_version'), 403);
                    abort_unless((int) ($data['duplicate_asset_id'] ?? $duplicate->id) === (int) $duplicate->id, 422, 'دارایی نسخه مقصد با فایل مشابه منطبق نیست.');
                    $revised = $service->revise(
                        $duplicate,
                        $request->user(),
                        $request->file('file'),
                        null,
                        $data['change_description'] ?? 'نسخه جدید از تشخیص فایل مشابه',
                    );
                    $this->relateUploadedContexts($service, $revised, $request, [
                        ...$data,
                        'asset_version_id' => $revised->versions->sortByDesc('version_number')->first()?->id,
                    ]);

                    return response()->json(['data' => $revised->fresh()->load(['latestFile', 'relations', 'versions']), 'version_created' => true]);
                }
            }
        }

        $asset = $service->create($data, $request->user(), $request->file('file'));

        return response()->json(['data' => $asset], 201);
    }

    public function show(Request $request, DamAsset $asset)
    {
        $this->permitted($request, 'assets.view', $asset);

        $asset->load([
            'latestFile', 'files', 'contentItem', 'relations.creator:id,name',
            'versions.file', 'versions.creator:id,name,username,avatar',
            'activities.actor:id,name,avatar', 'tags', 'category', 'folder',
            'owner:id,name,username,avatar,title', 'creator:id,name,username,avatar,title',
        ]);
        app(\App\Services\DamRelationPresenter::class)->attach(collect([$asset]));

        $payload = $asset->toArray();
        // آدرس واقعی فایل روی هاست فقط برای مدیر/مدیر دسترسی افشا می‌شود.
        if ($request->user()->isAdmin() || $request->user()->hasPermission('assets.manage_access')) {
            // مقادیر hidden مدل را صریحاً اضافه می‌کنیم.
            $visible = function (DamFile $file) {
                return array_merge($file->toArray(), [
                    'storage_disk' => $file->storage_disk,
                    'storage_path' => $file->storage_path,
                    'stored_filename' => $file->stored_filename,
                ]);
            };
            if ($asset->latestFile) {
                $payload['latest_file'] = $visible($asset->latestFile);
            }
            if ($asset->files) {
                $payload['files'] = $asset->files->map($visible)->all();
            }
            $payload['storage_root'] = rtrim((string) config('filesystems.disks.public.root', ''), '/');
            $payload['preview_url'] = url("/api/v1/dam/library/{$asset->id}/preview");
            $payload['download_url'] = url("/api/v1/dam/library/{$asset->id}/download");
        }

        return ['data' => $payload];
    }

    public function update(Request $request, DamAsset $asset, DamFolderStorage $storage)
    {
        $this->permitted($request, 'assets.edit_info', $asset);
        $data = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'sometimes|nullable|string|max:5000',
            'status' => ['sometimes', Rule::in($this->allowedStatuses())],
            'confidentiality' => ['sometimes', Rule::in(['public', 'internal', 'confidential'])],
            'access_grants' => 'sometimes|nullable|array',
            'access_grants.projects' => 'nullable|array|max:50',
            'access_grants.projects.*' => 'integer|exists:projects,id',
            'access_grants.users' => 'nullable|array|max:100',
            'access_grants.users.*' => 'integer|exists:users,id',
            'access_grants.roles' => 'nullable|array|max:50',
            'access_grants.roles.*' => 'string|exists:roles,key',
            'folder_id' => 'sometimes|nullable|integer|exists:dam_folders,id',
            'category_id' => 'sometimes|nullable|integer|exists:dam_categories,id',
            'owner_id' => 'sometimes|required|integer|exists:users,id',
            'tags' => 'sometimes|array|max:20',
            'tags.*' => 'string|max:50',
        ]);

        if (array_intersect(array_keys($data), ['owner_id', 'status', 'confidentiality', 'access_grants'])) {
            abort_unless($request->user()->isAdmin() || $request->user()->hasPermission('assets.manage_access'), 403);
        }
        if (array_key_exists('folder_id', $data) && ! $request->user()->hasPermission('assets.move')) {
            abort(403);
        }

        $oldFolder = $asset->folder_id;
        $oldStatus = $asset->status;
        $oldConfidentiality = $asset->confidentiality;
        $oldOwner = $asset->owner_id;
        $tagNames = $data['tags'] ?? null;
        unset($data['tags']);
        $asset->update([...$data, 'updated_by' => $request->user()->id]);

        if ($tagNames !== null) {
            $asset->tags()->sync(collect($tagNames)->map(fn (string $name) => DamTag::firstOrCreate(['name' => trim($name)])->id
            )->all());
        }

        $events = [];
        if (array_key_exists('folder_id', $data) && $oldFolder !== $asset->folder_id) {
            $storage->moveAsset($asset, $asset->folder_id);
            $events[] = ['action' => 'moved', 'metadata' => ['from' => $oldFolder, 'to' => $asset->folder_id]];
        }
        if (array_key_exists('status', $data) && $oldStatus !== $asset->status) {
            $events[] = ['action' => 'status_changed', 'metadata' => ['from' => $oldStatus, 'to' => $asset->status]];
        }
        if (array_key_exists('confidentiality', $data) && $oldConfidentiality !== $asset->confidentiality) {
            $events[] = ['action' => 'confidentiality_changed', 'metadata' => ['from' => $oldConfidentiality, 'to' => $asset->confidentiality]];
        }
        if (array_key_exists('owner_id', $data) && $oldOwner !== $asset->owner_id) {
            $events[] = ['action' => 'ownership_changed', 'metadata' => ['from' => $oldOwner, 'to' => $asset->owner_id]];
        }
        if ($events === []) {
            $events[] = ['action' => 'updated', 'metadata' => ['fields' => array_keys($data)]];
        }
        foreach ($events as $event) {
            $asset->activities()->create([
                'actor_id' => $request->user()->id,
                'action' => $event['action'],
                'metadata' => $event['metadata'],
            ]);
        }

        return ['data' => $asset->refresh()->load(['latestFile', 'contentItem', 'relations', 'tags', 'category', 'folder'])];
    }

    public function bulkMove(Request $request, DamFolderStorage $storage)
    {
        abort_unless($request->user()->hasPermission('assets.move'), 403);
        $data = $request->validate([
            'ids' => 'required|array|min:1|max:100',
            'ids.*' => 'required|integer|distinct|exists:dam_assets,id',
            'folder_id' => 'nullable|integer|exists:dam_folders,id',
        ]);
        $assets = DamAsset::query()->whereIn('id', $data['ids'])->get();
        abort_unless($assets->count() === count($data['ids']), 404);
        foreach ($assets as $asset) {
            $this->permitted($request, 'assets.move', $asset);
        }

        DB::transaction(function () use ($assets, $data, $request, $storage): void {
            foreach ($assets as $asset) {
                $asset->update(['folder_id' => $data['folder_id'] ?? null, 'updated_by' => $request->user()->id]);
                $storage->moveAsset($asset, $asset->folder_id);
                $asset->activities()->create([
                    'actor_id' => $request->user()->id,
                    'action' => 'moved',
                    'metadata' => ['folder_id' => $data['folder_id'] ?? null, 'bulk' => true],
                ]);
            }
        });

        return response()->json(['data' => ['moved' => $assets->count()]]);
    }

    public function bulkUpdate(Request $request)
    {
        $data = $request->validate([
            'ids' => 'required|array|min:1|max:100',
            'ids.*' => 'required|integer|distinct|exists:dam_assets,id',
            'tags' => 'sometimes|array|max:20',
            'tags.*' => 'required|string|max:50',
            'status' => ['sometimes', Rule::in($this->allowedStatuses())],
        ]);
        abort_if(! array_key_exists('tags', $data) && ! array_key_exists('status', $data), 422, 'حداقل یک تغییر دسته‌ای لازم است.');
        if (array_key_exists('tags', $data)) {
            abort_unless($request->user()->hasPermission('assets.edit_info'), 403);
        }
        if (array_key_exists('status', $data)) {
            abort_unless($request->user()->isAdmin() || $request->user()->hasPermission('assets.manage_access'), 403);
        }
        $assets = DamAsset::query()->whereIn('id', $data['ids'])->get();
        abort_unless($assets->count() === count($data['ids']), 404);
        foreach ($assets as $asset) {
            $this->permitted($request, array_key_exists('status', $data) ? 'assets.manage_access' : 'assets.edit_info', $asset);
        }

        DB::transaction(function () use ($assets, $data, $request): void {
            $tagIds = collect($data['tags'] ?? [])->map(
                fn (string $name) => DamTag::firstOrCreate(['name' => trim($name)])->id,
            )->all();
            foreach ($assets as $asset) {
                if ($tagIds !== []) {
                    $asset->tags()->syncWithoutDetaching($tagIds);
                }
                if (array_key_exists('status', $data)) {
                    $asset->update(['status' => $data['status'], 'updated_by' => $request->user()->id]);
                }
                $asset->activities()->create([
                    'actor_id' => $request->user()->id,
                    'action' => 'bulk_updated',
                    'metadata' => ['tags' => $data['tags'] ?? [], 'status' => $data['status'] ?? null],
                ]);
            }
        });

        return response()->json(['data' => ['updated' => $assets->count()]]);
    }

    public function bulkArchive(Request $request)
    {
        abort_unless($request->user()->hasPermission('assets.delete'), 403);
        $data = $request->validate([
            'ids' => 'required|array|min:1|max:100',
            'ids.*' => 'required|integer|distinct|exists:dam_assets,id',
        ]);
        $assets = DamAsset::query()->whereIn('id', $data['ids'])->get();
        abort_unless($assets->count() === count($data['ids']), 404);
        foreach ($assets as $asset) {
            $this->permitted($request, 'assets.delete', $asset);
        }

        DB::transaction(function () use ($assets, $request): void {
            foreach ($assets as $asset) {
                $asset->activities()->create(['actor_id' => $request->user()->id, 'action' => 'deleted', 'metadata' => ['bulk' => true]]);
                $asset->delete();
            }
        });

        return response()->json(['data' => ['archived' => $assets->count()]]);
    }

    public function destroy(Request $request, DamAsset $asset)
    {
        $this->permitted($request, 'assets.delete', $asset);
        $asset->activities()->create(['actor_id' => $request->user()->id, 'action' => 'deleted']);
        $asset->delete();

        return response()->noContent();
    }

    public function restore(Request $request, int $asset)
    {
        $record = DamAsset::onlyTrashed()->findOrFail($asset);
        $this->permitted($request, 'assets.restore', $record);
        $record->restore();
        $record->activities()->create(['actor_id' => $request->user()->id, 'action' => 'restored']);

        return ['data' => $record->load(['latestFile', 'relations'])];
    }

    public function revise(Request $request, DamAsset $asset, DamService $service)
    {
        $this->permitted($request, $asset->type === 'file' ? 'assets.create_version' : 'assets.edit_info', $asset);
        $data = $request->validate([
            'file' => $asset->type === 'file' ? 'required|file|max:20480' : 'prohibited',
            'body' => $asset->type === 'content' ? 'required|string|max:1000000' : 'prohibited',
            'change_description' => 'nullable|string|max:1000',
        ]);
        if ($request->hasFile('file') && $this->isDisallowedFilename($request->file('file')->getClientOriginalName())) {
            abort(422, 'این نوع فایل برای بارگذاری مجاز نیست.');
        }

        return ['data' => $service->revise(
            $asset,
            $request->user(),
            $request->file('file'),
            $data['body'] ?? null,
            $data['change_description'] ?? null,
        )];
    }

    public function restoreVersion(Request $request, DamAsset $asset, int $version, DamService $service)
    {
        $this->permitted($request, 'assets.restore', $asset);

        return ['data' => $service->restore($asset, $version, $request->user())];
    }

    public function attach(Request $request, DamAsset $asset, DamService $service)
    {
        $this->permitted($request, 'assets.edit_info', $asset);
        $data = $request->validate([
            'related_type' => ['required', Rule::in(['project', 'task', 'department', 'content'])],
            'related_id' => 'required|integer|min:1',
            'relation_role' => ['nullable', Rule::in(DamRelationRole::ALL)],
            'stage_id' => 'nullable|string|max:120|required_with:output_id',
            'output_id' => 'nullable|string|max:120',
            'asset_version_id' => 'nullable|integer|exists:dam_versions,id',
            'metadata' => 'nullable|array|max:20',
        ]);
        $contextPermission = match ($data['related_type']) {
            'project' => 'projects.view',
            'task' => 'tasks.view',
            'department' => 'departments.view',
            'content' => 'content.view',
        };
        if ($data['related_type'] === 'content') {
            $relatedContent = Content::findOrFail($data['related_id']);
            abort_unless(app(ContentAccess::class)->canView($request->user(), $relatedContent), 403);
            $this->guardWorkflowContext($relatedContent, $data['stage_id'] ?? null, $data['output_id'] ?? null);
        } else {
            abort_if(! empty($data['stage_id']) || ! empty($data['output_id']), 422, 'اطلاعات مرحله فقط برای ارتباط محتوا معتبر است.');
            $this->permitted($request, $contextPermission);
        }
        if (! empty($data['asset_version_id'])) {
            abort_unless($asset->versions()->whereKey($data['asset_version_id'])->exists(), 422, 'نسخه انتخابی متعلق به این دارایی نیست.');
        }
        $model = match ($data['related_type']) {
            'project' => Project::class,
            'task' => Task::class,
            'department' => Department::class,
            'content' => Content::class,
        };
        abort_unless($model::whereKey($data['related_id'])->exists(), 422, 'موجودیت مرتبط یافت نشد.');

        $service->relate($asset, $data['related_type'], (int) $data['related_id'], $request->user(), $data);
        $asset->activities()->create(['actor_id' => $request->user()->id, 'action' => 'attached', 'metadata' => $data]);

        return ['data' => $asset->load('relations')];
    }

    public function detach(Request $request, DamAsset $asset, int $relation)
    {
        return DB::transaction(function () use ($request, $asset, $relation) {
            $locked = DamAsset::whereKey($asset->id)->lockForUpdate()->firstOrFail();
            $this->permitted($request, 'assets.edit_info', $locked);
            $link = $locked->relations()->whereKey($relation)->firstOrFail();
            if ($link->related_type === 'content') {
                abort_unless(app(ContentAccess::class)->canView($request->user(), Content::findOrFail($link->related_id)), 403);
            } elseif ($link->related_type === 'task') {
                abort_unless(app(TaskOperations::class)->visibleTo($request->user())->whereKey($link->related_id)->exists(), 403);
            }
            $metadata = [
                'related_type' => $link->related_type,
                'related_id' => $link->related_id,
                'relation_role' => $link->relation_type,
                'stage_id' => $link->stage_id,
                'output_id' => $link->output_id,
            ];
            $link->delete();
            $locked->activities()->create([
                'actor_id' => $request->user()->id,
                'action' => 'detached',
                'metadata' => $metadata,
            ]);

            return ['data' => $locked->load('relations')];
        });
    }

    public function detachTask(Request $request, DamAsset $asset, string $task)
    {
        return DB::transaction(function () use ($request, $asset, $task) {
            $asset = DamAsset::whereKey($asset->id)->lockForUpdate()->firstOrFail();
            $this->permitted($request, 'assets.edit_info', $asset);
            abort_unless(app(TaskOperations::class)->visibleTo($request->user())->whereKey($task)->exists(), 403);
            $removed = $asset->relations()->where('related_type', 'task')->where('related_id', $task)->delete();
            if ($removed) {
                $asset->activities()->create(['actor_id' => $request->user()->id, 'action' => 'detached', 'metadata' => ['related_type' => 'task', 'related_id' => $task]]);
            }

            return ['data' => $asset->load('relations')];
        });
    }

    public function preview(Request $request, DamAsset $asset)
    {
        $this->permitted($request, 'assets.preview', $asset);
        $file = $asset->latestFile;
        abort_unless($file && Storage::disk($file->storage_disk)->exists($file->storage_path), 404);
        $mime = strtolower($file->mime_type ?: 'application/octet-stream');
        $isPreviewable = str_starts_with($mime, 'image/') && $mime !== 'image/svg+xml'
            || str_starts_with($mime, 'audio/')
            || str_starts_with($mime, 'video/')
            || in_array($mime, ['application/pdf', 'text/plain'], true);
        abort_unless($isPreviewable, 415, 'پیش‌نمایش این قالب فایل در حال حاضر پشتیبانی نمی‌شود.');
        $asset->activities()->create(['actor_id' => $request->user()->id, 'action' => 'previewed']);

        return Storage::disk($file->storage_disk)->response(
            $file->storage_path,
            $file->original_filename,
            ['Content-Type' => $mime, 'X-Content-Type-Options' => 'nosniff'],
            'inline',
        );
    }

    public function download(Request $request, DamAsset $asset)
    {
        $this->permitted($request, 'assets.download', $asset);
        $file = $asset->latestFile;
        abort_unless($file && Storage::disk($file->storage_disk)->exists($file->storage_path), 404);
        $asset->activities()->create(['actor_id' => $request->user()->id, 'action' => 'downloaded']);

        return Storage::disk($file->storage_disk)->download($file->storage_path, $file->original_filename);
    }

    private function relateUploadedContexts(DamService $service, DamAsset $asset, Request $request, array $data): void
    {
        $versionId = $data['asset_version_id'] ?? $asset->versions()->orderByDesc('version_number')->value('id');
        foreach (['project', 'task', 'department', 'content'] as $type) {
            if (! empty($data[$type.'_id'])) {
                $service->relate($asset, $type, (int) $data[$type.'_id'], $request->user(), [
                    'relation_role' => $data['relation_role'] ?? DamRelationRole::ATTACHMENT,
                    'stage_id' => $data['stage_id'] ?? null,
                    'output_id' => $data['output_id'] ?? null,
                    'asset_version_id' => $versionId,
                    'metadata' => $data['relation_metadata'] ?? null,
                ]);
            }
        }
    }

    private function guardWorkflowContext(Content $content, mixed $stageId, mixed $outputId): void
    {
        $stageId = trim((string) ($stageId ?? ''));
        $outputId = trim((string) ($outputId ?? ''));
        if ($stageId === '' && $outputId === '') {
            return;
        }
        $stage = collect($content->payload['stages'] ?? [])->first(
            fn ($candidate) => is_array($candidate) && (string) ($candidate['id'] ?? '') === $stageId,
        );
        if (! is_array($stage)) {
            throw ValidationException::withMessages(['stage_id' => 'مرحله انتخابی متعلق به این محتوا نیست.']);
        }
        if ($outputId !== '' && ! collect($stage['outputs'] ?? [])->contains(
            fn ($output) => is_array($output) && (string) ($output['id'] ?? '') === $outputId,
        )) {
            throw ValidationException::withMessages(['output_id' => 'خروجی انتخابی متعلق به مرحله مشخص‌شده نیست.']);
        }
    }

    private function isDisallowedFilename(string $filename): bool
    {
        return (bool) preg_match('/\.(php|phtml|phar|exe|sh|bat|cmd|js|html?|svg)$/i', $filename);
    }
}
