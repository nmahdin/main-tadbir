<?php
namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DamAsset;
use App\Models\DamCategory;
use App\Models\DamFolder;
use App\Services\DamFolderStorage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class DamTaxonomyController extends Controller
{
    public function folders(Request $request)
    {
        abort_unless($request->user()->hasPermission('assets.view'), 403);
        return ['data'=>DamFolder::query()->orderBy('name')->get()];
    }

    public function createFolder(Request $request, DamFolderStorage $storage)
    {
        abort_unless($request->user()->hasPermission('assets.upload'), 403);
        $data = $request->validate([
            'name'=>'required|string|max:255', 'parent_id'=>'nullable|integer|exists:dam_folders,id',
            'department_id'=>'nullable|integer|exists:departments,id',
        ]);
        abort_if(DamFolder::query()->where('name', $data['name'])->where('parent_id', $data['parent_id'] ?? null)->exists(), 422, 'پوشه‌ای با این نام در همین مسیر وجود دارد.');
        $folder = DamFolder::create([...$data,'created_by'=>$request->user()->id]);
        $storage->ensure($folder);

        return response()->json(['data'=>$folder], 201);
    }

    public function updateFolder(Request $request, DamFolder $folder, DamFolderStorage $storage)
    {
        abort_unless($request->user()->hasAnyPermission(['assets.rename','assets.move']), 403);
        $data = $request->validate(['name'=>'sometimes|required|string|max:255','parent_id'=>'nullable|integer|exists:dam_folders,id']);
        if (array_key_exists('parent_id', $data)) {
            $parent = isset($data['parent_id']) ? (int) $data['parent_id'] : null;
            while ($parent !== null) {
                if ($parent === $folder->id) throw ValidationException::withMessages(['parent_id'=>'انتقال پوشه به خودش یا زیرپوشه‌اش مجاز نیست.']);
                $parent = DamFolder::find($parent)?->parent_id;
            }
        }
        $oldPath = $storage->path($folder);
        $candidateName = $data['name'] ?? $folder->name;
        $candidateParent = array_key_exists('parent_id', $data) ? $data['parent_id'] : $folder->parent_id;
        abort_if(DamFolder::query()->whereKeyNot($folder->id)->where('name', $candidateName)->where('parent_id', $candidateParent)->exists(), 422, 'پوشه‌ای با این نام در مسیر مقصد وجود دارد.');
        $folder->update($data);
        $folder->refresh();
        $storage->move($oldPath, $folder);
        return ['data'=>$folder];
    }

    public function destroyFolder(Request $request, DamFolder $folder, DamFolderStorage $storage)
    {
        abort_unless($request->user()->hasAnyPermission(['assets.delete','assets.manage_access']), 403);

        $hasChildren = DamFolder::query()->where('parent_id', $folder->id)->exists();
        if ($hasChildren) {
            throw ValidationException::withMessages(['folder' => 'این پوشه دارای زیرپوشه است؛ ابتدا زیرپوشه‌ها را حذف یا منتقل کنید.']);
        }

        // دارایی‌های داخل پوشه به ریشه منتقل می‌شوند تا داده‌ای از بین نرود.
        DamAsset::query()->where('folder_id', $folder->id)->update(['folder_id' => $folder->parent_id]);

        $diskPath = $storage->path($folder);
        $folder->delete();
        if (Storage::disk('local')->exists($diskPath)) {
            Storage::disk('local')->deleteDirectory($diskPath);
        }

        return response()->noContent();
    }

    public function categories(Request $request)
    {
        abort_unless($request->user()->hasPermission('assets.view'), 403);
        return ['data'=>DamCategory::query()->orderBy('name')->get()];
    }

    public function createCategory(Request $request)
    {
        abort_unless($request->user()->hasAnyPermission(['assets.manage_access', 'settings.manage']), 403);
        $data = $request->validate(['name'=>'required|string|max:255','description'=>'nullable|string|max:1000','parent_id'=>'nullable|integer|exists:dam_categories,id']);
        return response()->json(['data'=>DamCategory::create($data)], 201);
    }

    public function updateCategory(Request $request, DamCategory $category)
    {
        abort_unless($request->user()->hasAnyPermission(['assets.manage_access', 'settings.manage']), 403);
        $data = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'parent_id' => 'nullable|integer|exists:dam_categories,id',
        ]);
        if (array_key_exists('parent_id', $data) && (int) ($data['parent_id'] ?? 0) === $category->id) {
            throw ValidationException::withMessages(['parent_id' => 'دسته‌بندی نمی‌تواند والد خودش باشد.']);
        }
        $category->update($data);
        return ['data' => $category->refresh()];
    }

    public function destroyCategory(Request $request, DamCategory $category)
    {
        abort_unless($request->user()->hasAnyPermission(['assets.manage_access', 'settings.manage']), 403);

        // دارایی‌های این دسته، بدون دسته می‌شوند؛ سپس خود دسته حذف می‌شود.
        DamAsset::query()->where('category_id', $category->id)->update(['category_id' => null]);
        DamCategory::query()->where('parent_id', $category->id)->update(['parent_id' => $category->parent_id]);
        $category->delete();

        return response()->noContent();
    }
}
