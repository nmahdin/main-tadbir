<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DamDataRow;
use App\Models\DamDataTable;
use Illuminate\Http\Request;

/**
 * جدول‌های اطلاعات (شیت‌ها): هر جدول مانند یک شیت اکسل است و
 * ردیف‌های آن به‌صورت رکورد دیتابیسی ذخیره و ویرایش می‌شوند.
 */
class DamDataTableController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()->hasPermission('assets.view'), 403);

        $tables = DamDataTable::query()
            ->withCount('rows')
            ->with('creator:id,name')
            ->orderBy('updated_at', 'desc')
            ->get();

        return ['data' => $tables];
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->hasPermission('assets.upload'), 403);

        $data = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'columns' => 'nullable|array|max:100',
            'columns.*.id' => 'required|string|max:60',
            'columns.*.name' => 'required|string|max:120',
            'columns.*.type' => 'nullable|string|max:30',
        ]);

        $table = DamDataTable::create([...$data, 'created_by' => $request->user()->id]);

        return response()->json(['data' => $table->load('creator:id,name')->loadCount('rows')], 201);
    }

    public function show(Request $request, DamDataTable $dataTable)
    {
        abort_unless($request->user()->hasPermission('assets.view'), 403);

        return ['data' => $dataTable->load(['rows', 'creator:id,name'])];
    }

    public function update(Request $request, DamDataTable $dataTable)
    {
        abort_unless($request->user()->hasAnyPermission(['assets.edit_info', 'assets.upload']), 403);

        $data = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'columns' => 'nullable|array|max:100',
            'columns.*.id' => 'required|string|max:60',
            'columns.*.name' => 'required|string|max:120',
            'columns.*.type' => 'nullable|string|max:30',
        ]);

        $dataTable->update($data);

        return ['data' => $dataTable->refresh()->load('creator:id,name')->loadCount('rows')];
    }

    public function destroy(Request $request, DamDataTable $dataTable)
    {
        abort_unless($request->user()->hasAnyPermission(['assets.delete', 'assets.manage_access']), 403);

        $dataTable->delete();

        return response()->noContent();
    }

    public function storeRow(Request $request, DamDataTable $dataTable)
    {
        abort_unless($request->user()->hasAnyPermission(['assets.edit_info', 'assets.upload']), 403);

        $data = $request->validate([
            'cells' => 'nullable|array|max:200',
            'position' => 'nullable|integer|min:0',
        ]);

        $row = $dataTable->rows()->create([
            'cells' => $data['cells'] ?? [],
            'position' => $data['position'] ?? ((int) $dataTable->rows()->max('position') + 1),
        ]);
        $dataTable->touch();

        return response()->json(['data' => $row], 201);
    }

    public function updateRow(Request $request, DamDataTable $dataTable, DamDataRow $row)
    {
        abort_unless($request->user()->hasAnyPermission(['assets.edit_info', 'assets.upload']), 403);
        abort_if($row->table_id !== $dataTable->id, 404);

        $data = $request->validate([
            'cells' => 'nullable|array|max:200',
            'position' => 'nullable|integer|min:0',
        ]);

        $row->update(array_filter($data, fn ($value) => $value !== null));
        $dataTable->touch();

        return ['data' => $row->refresh()];
    }

    public function destroyRow(Request $request, DamDataTable $dataTable, DamDataRow $row)
    {
        abort_unless($request->user()->hasAnyPermission(['assets.edit_info', 'assets.upload']), 403);
        abort_if($row->table_id !== $dataTable->id, 404);

        $row->delete();
        $dataTable->touch();

        return response()->noContent();
    }
}
