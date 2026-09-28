<?php
namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DamAsset;
use App\Services\DamService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class DamAssetController extends Controller
{
    private function permitted(Request $request, string $permission, ?DamAsset $asset = null): void
    {
        abort_unless($request->user()->hasAnyPermission($permission), 403);
        if ($asset && $asset->confidentiality === 'confidential') {
            abort_unless($asset->owner_id === $request->user()->id || $request->user()->isAdmin(), 403);
        }
    }

    public function index(Request $request)
    {
        $this->permitted($request, 'assets.view');
        $query = DamAsset::query()->with(['latestFile','relations','tags']);
        if (! $request->user()->isAdmin()) {
            $query->where(fn ($q) => $q->where('confidentiality', '!=', 'confidential')->orWhere('owner_id', $request->user()->id));
        }
        $data = $request->validate([
            'type'=>['nullable', Rule::in(['file','content'])], 'search'=>'nullable|string|max:200',
            'project_id'=>'nullable|integer', 'task_id'=>'nullable|integer',
            'department_id'=>'nullable|integer', 'folder_id'=>'nullable|integer', 'category_id'=>'nullable|integer',
            'status'=>['nullable', Rule::in(['draft','review','approved','published','archived','rejected'])],
            'owner_id'=>'nullable|integer', 'confidentiality'=>['nullable', Rule::in(['public','internal','confidential'])],
        ]);
        if (!empty($data['type'])) $query->where('type', $data['type']);
        if (!empty($data['search'])) {
            $term = '%'.addcslashes($data['search'], '%_\\').'%';
            $query->where(fn ($q) => $q->where('title','like',$term)->orWhere('description','like',$term)
                ->orWhereHas('tags', fn ($c) => $c->where('name','like',$term))
                ->orWhereHas('contentItem', fn ($c) => $c->where('content_plain_text','like',$term)));
        }
        foreach (['project','task','department'] as $type) {
            if (!empty($data[$type.'_id'])) $query->whereHas('relations', fn ($q) => $q->where('related_type',$type)->where('related_id',$data[$type.'_id']));
        }
        foreach (['folder_id','category_id','owner_id','status','confidentiality'] as $field) {
            if (isset($data[$field])) $query->where($field, $data[$field]);
        }
        return $query->latest()->paginate(20);
    }

    public function store(Request $request, DamService $service)
    {
        $this->permitted($request, 'assets.upload');
        $data = $request->validate([
            'title'=>'required|string|max:255', 'description'=>'nullable|string|max:5000',
            'file'=>'required_without:body|file|max:20480', 'body'=>'required_without:file|string|max:1000000',
            'confidentiality'=>['nullable', Rule::in(['public','internal','confidential'])],
            'project_id'=>'nullable|integer|exists:projects,id', 'task_id'=>'nullable|integer|exists:tasks,id',
            'department_id'=>'nullable|integer|exists:departments,id',
            'folder_id'=>'nullable|integer|exists:dam_folders,id',
            'category_id'=>'nullable|integer|exists:dam_categories,id',
            'tags'=>'nullable|array|max:20', 'tags.*'=>'string|max:50',
        ]);
        if ($request->hasFile('file') && preg_match('/\.(php|phtml|phar|exe|sh|bat|cmd|js|html?|svg)$/i', $request->file('file')->getClientOriginalName())) {
            abort(422, 'این نوع فایل برای بارگذاری مجاز نیست.');
        }
        if (!empty($data['project_id'])) $this->permitted($request, 'projects.view');
        if (!empty($data['task_id'])) $this->permitted($request, 'tasks.view');
        if (!empty($data['task_id']) && !empty($data['project_id'])) {
            abort_unless(\App\Models\Task::find($data['task_id'])?->project_id === (int)$data['project_id'], 422, 'وظیفه متعلق به پروژه انتخابی نیست.');
        }
        abort_if($request->hasFile('file') && $request->filled('body'), 422, 'فایل و متن را جداگانه ثبت کنید.');
        abort_if(! $request->hasFile('file') && ! trim($data['body'] ?? ''), 422, 'متن نمی‌تواند خالی باشد.');
        return response()->json(['data'=>$service->create($data, $request->user(), $request->file('file'))], 201);
    }

    public function show(Request $request, DamAsset $asset)
    {
        $this->permitted($request, 'assets.view', $asset);
        return ['data'=>$asset->load(['latestFile','contentItem','relations','versions','activities','tags'])];
    }

    public function update(Request $request, DamAsset $asset)
    {
        $this->permitted($request, 'assets.edit_info', $asset);
        $data = $request->validate([
            'title'=>'sometimes|required|string|max:255', 'description'=>'nullable|string|max:5000',
            'status'=>['sometimes', Rule::in(['draft','review','approved','published','archived','rejected'])],
            'confidentiality'=>['sometimes', Rule::in(['public','internal','confidential'])],
            'folder_id'=>'nullable|integer|exists:dam_folders,id',
            'category_id'=>'nullable|integer|exists:dam_categories,id',
            'owner_id'=>'nullable|integer|exists:users,id',
        ]);
        if (array_intersect(array_keys($data), ['owner_id','status','confidentiality'])) {
            abort_unless($request->user()->isAdmin() || $request->user()->hasPermission('assets.manage_access'), 403);
        }
        if (array_key_exists('folder_id', $data) && ! $request->user()->hasPermission('assets.move')) {
            abort(403);
        }
        $asset->update([...$data, 'updated_by'=>$request->user()->id]);
        $asset->activities()->create(['actor_id'=>$request->user()->id,'action'=>'updated','metadata'=>['fields'=>array_keys($data)]]);
        return ['data'=>$asset->refresh()->load(['latestFile','relations'])];
    }

    public function destroy(Request $request, DamAsset $asset)
    {
        $this->permitted($request, 'assets.delete', $asset);
        $asset->delete();
        $asset->activities()->create(['actor_id'=>$request->user()->id,'action'=>'deleted']);
        return response()->noContent();
    }

    public function restore(Request $request, int $asset)
    {
        $record = DamAsset::onlyTrashed()->findOrFail($asset);
        $this->permitted($request, 'assets.restore', $record);
        $record->restore();
        $record->activities()->create(['actor_id'=>$request->user()->id,'action'=>'restored']);
        return ['data'=>$record->load(['latestFile','relations'])];
    }

    public function revise(Request $request, DamAsset $asset, DamService $service)
    {
        $this->permitted($request, $asset->type === 'file' ? 'assets.create_version' : 'assets.edit_info', $asset);
        $data = $request->validate([
            'file'=>$asset->type === 'file' ? 'required|file|max:20480' : 'prohibited',
            'body'=>$asset->type === 'content' ? 'required|string|max:1000000' : 'prohibited',
            'change_description'=>'nullable|string|max:1000',
        ]);
        if ($request->hasFile('file') && preg_match('/\.(php|phtml|phar|exe|sh|bat|cmd|js|html?|svg)$/i', $request->file('file')->getClientOriginalName())) {
            abort(422, 'این نوع فایل برای بارگذاری مجاز نیست.');
        }
        return ['data'=>$service->revise($asset, $request->user(), $request->file('file'), $data['body'] ?? null, $data['change_description'] ?? null)];
    }

    public function restoreVersion(Request $request, DamAsset $asset, int $version, DamService $service)
    {
        $this->permitted($request, 'assets.restore', $asset);
        return ['data'=>$service->restore($asset, $version, $request->user())];
    }

    public function attach(Request $request, DamAsset $asset)
    {
        $this->permitted($request, 'assets.edit_info', $asset);
        $data = $request->validate([
            'related_type'=>['required', Rule::in(['project','task','department'])],
            'related_id'=>'required|integer|min:1',
        ]);
        $contextPermission = match ($data['related_type']) {
            'project' => 'projects.view', 'task' => 'tasks.view', 'department' => 'departments.view',
        };
        $this->permitted($request, $contextPermission);
        $model = match ($data['related_type']) {
            'project' => \App\Models\Project::class,
            'task' => \App\Models\Task::class,
            'department' => \App\Models\Department::class,
        };
        abort_unless($model::whereKey($data['related_id'])->exists(), 422, 'موجودیت مرتبط یافت نشد.');
        $asset->relations()->firstOrCreate(
            ['related_type'=>$data['related_type'], 'related_id'=>$data['related_id'], 'relation_type'=>'attachment'],
            ['created_by'=>$request->user()->id],
        );
        $asset->activities()->create(['actor_id'=>$request->user()->id,'action'=>'attached','metadata'=>$data]);
        return ['data'=>$asset->load('relations')];
    }

    public function download(Request $request, DamAsset $asset)
    {
        $this->permitted($request, 'assets.download', $asset);
        $file = $asset->latestFile;
        abort_unless($file && Storage::disk($file->storage_disk)->exists($file->storage_path), 404);
        $asset->activities()->create(['actor_id'=>$request->user()->id,'action'=>'downloaded']);
        return Storage::disk($file->storage_disk)->download($file->storage_path, $file->original_filename);
    }
}
