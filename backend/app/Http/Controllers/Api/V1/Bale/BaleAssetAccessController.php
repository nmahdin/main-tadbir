<?php

namespace App\Http\Controllers\Api\V1\Bale;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\DamDataTable;
use App\Models\Department;
use App\Services\Access\UserPermissionGate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class BaleAssetAccessController extends Controller
{
    public function index(Request $request)
    {
        app(UserPermissionGate::class)->authorizeAny($request->user(), 'assets.manage_access');

        return response()->json(['data' => DamDataTable::orderBy('name')->get(['id', 'name'])]);
    }

    public function show(Request $request, DamDataTable $table)
    {
        app(UserPermissionGate::class)->authorizeAny($request->user(), 'assets.manage_access');

        return response()->json(['data' => ['department_ids' => $table->departments()->pluck('departments.id'), 'departments' => Department::orderBy('name')->get(['id', 'name'])]]);
    }

    public function update(Request $request, DamDataTable $table)
    {
        app(UserPermissionGate::class)->authorizeAny($request->user(), 'assets.manage_access');
        $data = $request->validate(['department_ids' => 'present|array|max:100', 'department_ids.*' => 'required|integer|distinct|exists:departments,id']);
        DB::transaction(function () use ($request, $table, $data) {
            $table = DamDataTable::whereKey($table->id)->lockForUpdate()->firstOrFail();
            $table->departments()->sync($data['department_ids']);
            ActivityLog::create(['user_id' => $request->user()->id, 'type' => 'dam_table_departments_changed', 'action' => 'تغییر دپارتمان‌های جدول دارایی', 'details' => 'table:'.$table->id]);
        });

        return $this->show($request, $table);
    }
}
