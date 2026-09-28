<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DamAsset;
use App\Models\DamActivity;
use App\Models\DamFile;
use App\Models\Department;
use App\Models\Project;
use App\Models\Task;
use App\Services\DamService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class DamAssetController extends Controller
{
    private function permitted(Request $request, string $permission, ?DamAsset $asset = null): void
    {
        abort_unless($request->user()->hasAnyPermission($permission), 403);

        if ($asset && $asset->confidentiality === 'confidential') {
            abort_unless($this->canAccessConfidential($request->user(), $asset), 403);
        }
    }

    /**
     * دسترسی به دارایی محرمانه: مالک، مدیر سیستم، اشخاص منتخب،
     * اعضای پروژه‌های منتخب و دارندگان نقش‌های منتخب.
     */
    private function canAccessConfidential(\App\Models\User $user, DamAsset $asset): bool
    {
        if ($user->isAdmin() || $asset->owner_id === $user->getKey()) {
            return true;
        }

        $grants = $asset->access_grants ?? [];
        $userIds = array_map('intval', (array) ($grants['users'] ?? []));
        if (in_array((int) $user->getKey(), $userIds, true)) {
            return true;
        }

        $roleKeys = array_map('strval', (array) ($grants['roles'] ?? []));
        $userRole = $user->role_key ?? $user->role?->key;
        if ($userRole !== null && in_array((string) $userRole, $roleKeys, true)) {
            return true;
        }

        $projectIds = array_map('intval', (array) ($grants['projects'] ?? []));
        if ($projectIds !== []) {
            $memberOf = Project::query()
                ->whereIn('id', $projectIds)
                ->where(fn (Builder $projects) => $projects
                    ->where('project_manager_id', $user->getKey())
                    ->orWhereHas('members', fn (Builder $members) => $members->where('users.id', $user->getKey())))
                ->exists();
            if ($memberOf) {
                return true;
            }
        }

        return false;
    }

    /** Apply the same confidentiality scope to lists, counters, and activity feeds. */
    private function visibleAssets(Request $request): Builder
    {
        $query = DamAsset::query();
        $user = $request->user();

        if ($user->isAdmin()) {
            return $query;
        }

        $userId = (int) $user->getKey();
        $userRole = $user->role_key ?? $user->role?->key;
        $projectIds = Project::query()
            ->where('project_manager_id', $userId)
            ->orWhereHas('members', fn (Builder $members) => $members->where('users.id', $userId))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        return $query->where(fn (Builder $assets) => $assets
            ->where('confidentiality', '!=', 'confidential')
            ->orWhere('owner_id', $userId)
            ->orWhere(fn (Builder $granted) => $granted
                ->where('confidentiality', 'confidential')
                ->where(fn (Builder $any) => $any
                    ->whereJsonContains('access_grants->users', $userId)
                    ->when($userRole !== null, fn (Builder $q) => $q->orWhereJsonContains('access_grants->roles', (string) $userRole))
                    ->when($projectIds !== [], function (Builder $q) use ($projectIds): void {
                        foreach ($projectIds as $projectId) {
                            $q->orWhereJsonContains('access_grants->projects', $projectId);
                        }
                    }))));
    }

    public function index(Request $request)
    {
        $this->permitted($request, 'assets.view');

        $query = $this->visibleAssets($request)->with([
            'latestFile', 'contentItem', 'relations', 'tags', 'category', 'folder', 'owner',
        ])->withMax('latestFile', 'file_size');
        $data = $request->validate([
            'type' => ['nullable', Rule::in(['file', 'content'])],
            'search' => 'nullable|string|max:200',
            'project_id' => 'nullable|integer',
            'task_id' => 'nullable|integer',
            'department_id' => 'nullable|integer',
            'folder_id' => 'nullable|integer',
            'category_id' => 'nullable|integer',
            'status' => ['nullable', Rule::in(['draft', 'review', 'approved', 'published', 'archived', 'rejected'])],
            'owner_id' => 'nullable|integer',
            'confidentiality' => ['nullable', Rule::in(['public', 'internal', 'confidential'])],
            'sort' => ['nullable', Rule::in(['updated_at', 'created_at', 'title', 'file_size'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        if (! empty($data['type'])) {
            $query->where('type', $data['type']);
        }
        if (! empty($data['search'])) {
            $term = '%'.addcslashes($data['search'], '%_\\').'%';
            $query->where(fn (Builder $assets) => $assets
                ->where('title', 'like', $term)
                ->orWhere('description', 'like', $term)
                ->orWhereHas('tags', fn (Builder $tags) => $tags->where('name', 'like', $term))
                ->orWhereHas('contentItem', fn (Builder $content) => $content->where('content_plain_text', 'like', $term)));
        }

        foreach (['project', 'task', 'department'] as $type) {
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

        $sort = $data['sort'] ?? 'updated_at';
        $direction = $data['direction'] ?? 'desc';
        $sortColumn = $sort === 'file_size' ? 'latest_file_file_size' : $sort;

        return $query->orderBy($sortColumn, $direction)
            ->paginate($data['per_page'] ?? 20)
            ->withQueryString();
    }

    public function summary(Request $request)
    {
        $this->permitted($request, 'assets.view');
        $visible = $this->visibleAssets($request);
        $visibleIds = (clone $visible)->select('dam_assets.id');

        return response()->json([
            'data' => [
                'total' => (clone $visible)->count(),
                'files' => (clone $visible)->where('type', 'file')->count(),
                'contents' => (clone $visible)->where('type', 'content')->count(),
                'storage_bytes' => DamFile::query()
                    ->whereIn('asset_id', $visibleIds)->sum('file_size'),
                'folders' => \App\Models\DamFolder::query()->count(),
            ],
        ]);
    }

    public function activities(Request $request)
    {
        $this->permitted($request, 'assets.view');

        $visibleIds = $this->visibleAssets($request)->select('dam_assets.id');
        $activities = DamActivity::query()
            ->whereIn('asset_id', $visibleIds)
            ->with(['actor:id,name', 'asset:id,title,type'])
            ->latest('created_at')
            ->paginate(30);

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
            'status' => ['nullable', Rule::in(['draft', 'review', 'approved', 'published', 'archived', 'rejected'])],
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
            'folder_id' => 'nullable|integer|exists:dam_folders,id',
            'category_id' => 'nullable|integer|exists:dam_categories,id',
            'tags' => 'nullable|array|max:20',
            'tags.*' => 'string|max:50',
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
        if (! empty($data['task_id']) && ! empty($data['project_id'])) {
            abort_unless(Task::find($data['task_id'])?->project_id === (int) $data['project_id'], 422, 'وظیفه متعلق به پروژه انتخابی نیست.');
        }
        if (! empty($data['status']) && $data['status'] !== 'draft') {
            abort_unless($request->user()->isAdmin() || $request->user()->hasPermission('assets.manage_access'), 403);
        }

        abort_if($request->hasFile('file') && $request->filled('body'), 422, 'فایل و متن را جداگانه ثبت کنید.');
        abort_if(! $request->hasFile('file') && ! trim($data['body'] ?? ''), 422, 'متن نمی‌تواند خالی باشد.');
        $data['department_id'] ??= $request->user()->department_id;

        $asset = $service->create($data, $request->user(), $request->file('file'));

        return response()->json(['data' => $asset], 201);
    }

    public function show(Request $request, DamAsset $asset)
    {
        $this->permitted($request, 'assets.view', $asset);

        return ['data' => $asset->load([
            'latestFile', 'files', 'contentItem', 'relations', 'versions', 'activities.actor', 'tags', 'category', 'folder', 'owner',
        ])];
    }

    public function update(Request $request, DamAsset $asset)
    {
        $this->permitted($request, 'assets.edit_info', $asset);
        $data = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'sometimes|nullable|string|max:5000',
            'status' => ['sometimes', Rule::in(['draft', 'review', 'approved', 'published', 'archived', 'rejected'])],
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
            $asset->tags()->sync(collect($tagNames)->map(fn (string $name) =>
                \App\Models\DamTag::firstOrCreate(['name' => trim($name)])->id
            )->all());
        }

        $events = [];
        if (array_key_exists('folder_id', $data) && $oldFolder !== $asset->folder_id) {
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

    public function bulkMove(Request $request)
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

        DB::transaction(function () use ($assets, $data, $request): void {
            foreach ($assets as $asset) {
                $asset->update(['folder_id' => $data['folder_id'] ?? null, 'updated_by' => $request->user()->id]);
                $asset->activities()->create([
                    'actor_id' => $request->user()->id,
                    'action' => 'moved',
                    'metadata' => ['folder_id' => $data['folder_id'] ?? null, 'bulk' => true],
                ]);
            }
        });

        return response()->json(['data' => ['moved' => $assets->count()]]);
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

    public function attach(Request $request, DamAsset $asset)
    {
        $this->permitted($request, 'assets.edit_info', $asset);
        $data = $request->validate([
            'related_type' => ['required', Rule::in(['project', 'task', 'department'])],
            'related_id' => 'required|integer|min:1',
        ]);
        $contextPermission = match ($data['related_type']) {
            'project' => 'projects.view',
            'task' => 'tasks.view',
            'department' => 'departments.view',
        };
        $this->permitted($request, $contextPermission);
        $model = match ($data['related_type']) {
            'project' => Project::class,
            'task' => Task::class,
            'department' => Department::class,
        };
        abort_unless($model::whereKey($data['related_id'])->exists(), 422, 'موجودیت مرتبط یافت نشد.');

        $asset->relations()->firstOrCreate(
            ['related_type' => $data['related_type'], 'related_id' => $data['related_id'], 'relation_type' => 'attachment'],
            ['created_by' => $request->user()->id],
        );
        $asset->activities()->create(['actor_id' => $request->user()->id, 'action' => 'attached', 'metadata' => $data]);

        return ['data' => $asset->load('relations')];
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

    private function isDisallowedFilename(string $filename): bool
    {
        return (bool) preg_match('/\.(php|phtml|phar|exe|sh|bat|cmd|js|html?|svg)$/i', $filename);
    }
}
