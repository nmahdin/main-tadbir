<?php

namespace App\Http\Controllers\Api\V1\Bale;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\DamDataTable;
use App\Models\Team;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class BaleAssetAccessController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()->isActive() && $request->user()->hasPermission('assets.manage_access'), 403);

        return response()->json(['data' => DamDataTable::orderBy('name')->get(['id', 'name'])]);
    }

    public function show(Request $request, DamDataTable $table)
    {
        abort_unless($request->user()->isActive() && $request->user()->hasPermission('assets.manage_access'), 403);

        return response()->json(['data' => ['team_ids' => $table->teams()->pluck('teams.id'), 'teams' => Team::orderBy('name')->get(['id', 'name'])]]);
    }

    public function update(Request $request, DamDataTable $table)
    {
        abort_unless($request->user()->isActive() && $request->user()->hasPermission('assets.manage_access'), 403);
        $data = $request->validate(['team_ids' => 'present|array|max:100', 'team_ids.*' => 'required|integer|distinct|exists:teams,id']);
        DB::transaction(function () use ($request, $table, $data) {
            $table = DamDataTable::whereKey($table->id)->lockForUpdate()->firstOrFail();
            $table->teams()->sync($data['team_ids']);
            ActivityLog::create(['user_id' => $request->user()->id, 'type' => 'dam_table_teams_changed', 'action' => 'تغییر تیم‌های جدول دارایی', 'details' => 'table:'.$table->id]);
        });

        return $this->show($request, $table);
    }
}
