<?php
namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DamCategory;
use App\Models\DamFolder;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class DamTaxonomyController extends Controller
{
    public function folders(Request $request)
    {
        abort_unless($request->user()->hasPermission('assets.view'), 403);
        return ['data'=>DamFolder::query()->orderBy('name')->get()];
    }

    public function createFolder(Request $request)
    {
        abort_unless($request->user()->hasPermission('assets.upload'), 403);
        $data = $request->validate([
            'name'=>'required|string|max:255', 'parent_id'=>'nullable|integer|exists:dam_folders,id',
            'department_id'=>'nullable|integer|exists:departments,id',
        ]);
        return response()->json(['data'=>DamFolder::create([...$data,'created_by'=>$request->user()->id])], 201);
    }

    public function updateFolder(Request $request, DamFolder $folder)
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
        $folder->update($data);
        return ['data'=>$folder->refresh()];
    }

    public function categories(Request $request)
    {
        abort_unless($request->user()->hasPermission('assets.view'), 403);
        return ['data'=>DamCategory::query()->orderBy('name')->get()];
    }

    public function createCategory(Request $request)
    {
        abort_unless($request->user()->hasPermission('assets.manage_access'), 403);
        $data = $request->validate(['name'=>'required|string|max:255','description'=>'nullable|string|max:1000','parent_id'=>'nullable|integer|exists:dam_categories,id']);
        return response()->json(['data'=>DamCategory::create($data)], 201);
    }
}
