<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DamDataRow;
use App\Models\DamDataRowActivity;
use App\Models\DamDataTable;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * جدول‌های اطلاعات (شیت‌ها): هر جدول مانند یک شیت اکسل است و
 * ردیف‌های آن به‌صورت رکورد دیتابیسی ذخیره و ویرایش می‌شوند.
 *
 * دسترسی: اگر جدول «grants» داشته باشد فقط افرادِ فهرست (یا سازنده و
 * مدیر دسترسی) آن را می‌بینند؛ در غیر این صورت مجوزهای کلی اعمال می‌شود.
 */
class DamDataTableController extends Controller
{
    private function grantsOf(DamDataTable $table): array
    {
        $grants = $table->grants;
        if (is_string($grants)) {
            $grants = json_decode($grants, true);
        }

        return is_array($grants) ? array_values(array_filter($grants, fn ($g) => is_array($g) && isset($g['user_id']))) : [];
    }

    private function grantFor(User $user, DamDataTable $table): ?string
    {
        foreach ($this->grantsOf($table) as $grant) {
            if ((int) $grant['user_id'] === (int) $user->id) {
                return $grant['access'] ?? 'view';
            }
        }

        return null;
    }

    private function canView(User $user, DamDataTable $table): bool
    {
        if ($user->hasAnyPermission(['assets.manage_access'])) return true;
        if ((int) $table->created_by === (int) $user->id) return true;
        $grants = $this->grantsOf($table);
        if (empty($grants)) return $user->hasPermission('assets.view');

        return $this->grantFor($user, $table) !== null;
    }

    private function canEdit(User $user, DamDataTable $table): bool
    {
        if ($user->hasAnyPermission(['assets.manage_access'])) return true;
        if ((int) $table->created_by === (int) $user->id) {
            return $user->hasAnyPermission(['assets.edit_info', 'assets.upload']);
        }
        $grants = $this->grantsOf($table);
        if (empty($grants)) return $user->hasAnyPermission(['assets.edit_info', 'assets.upload']);

        return $this->grantFor($user, $table) === 'edit';
    }

    private function logRowActivity(DamDataTable $table, ?DamDataRow $row, User $actor, string $action, ?array $metadata = null): void
    {
        DamDataRowActivity::create([
            'table_id' => $table->id,
            'row_id' => $row?->id,
            'actor_id' => $actor->id,
            'action' => $action,
            'metadata' => $metadata,
        ]);
    }

    public function index(Request $request)
    {
        abort_unless($request->user()->hasPermission('assets.view'), 403);

        $tables = DamDataTable::query()
            ->withCount('rows')
            ->with('creator:id,name')
            ->orderBy('updated_at', 'desc')
            ->get()
            ->filter(fn (DamDataTable $table) => $this->canView($request->user(), $table))
            ->values();

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
            'columns.*.options' => 'nullable|array|max:100',
            'columns.*.options.*' => 'string|max:120',
            'grants' => 'nullable|array|max:200',
            'grants.*.user_id' => 'required|integer|exists:users,id',
            'grants.*.access' => 'required|string|in:view,edit',
        ]);

        $table = DamDataTable::create([...$data, 'created_by' => $request->user()->id]);

        return response()->json(['data' => $table->load('creator:id,name')->loadCount('rows')], 201);
    }

    public function show(Request $request, DamDataTable $dataTable)
    {
        abort_unless($this->canView($request->user(), $dataTable), 403);

        $dataTable->load([
            'rows.creator:id,name',
            'rows.updater:id,name',
            'rows.task:id,title',
            'rows.activities.actor:id,name',
            'creator:id,name',
        ]);

        $payload = $dataTable->toArray();
        $payload['can_edit'] = $this->canEdit($request->user(), $dataTable);

        return ['data' => $payload];
    }

    public function update(Request $request, DamDataTable $dataTable)
    {
        abort_unless($this->canEdit($request->user(), $dataTable), 403);

        $data = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'columns' => 'nullable|array|max:100',
            'columns.*.id' => 'required|string|max:60',
            'columns.*.name' => 'required|string|max:120',
            'columns.*.type' => 'nullable|string|max:30',
            'columns.*.options' => 'nullable|array|max:100',
            'columns.*.options.*' => 'string|max:120',
            'grants' => 'nullable|array|max:200',
            'grants.*.user_id' => 'required|integer|exists:users,id',
            'grants.*.access' => 'required|string|in:view,edit',
        ]);

        // فقط سازنده یا مدیر دسترسی می‌تواند فهرست دسترسی را تغییر دهد.
        if (array_key_exists('grants', $data)) {
            $isOwner = (int) $dataTable->created_by === (int) $request->user()->id;
            abort_unless($isOwner || $request->user()->hasPermission('assets.manage_access'), 403);
        }

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
        abort_unless($this->canEdit($request->user(), $dataTable), 403);

        $data = $request->validate([
            'cells' => 'nullable|array|max:200',
            'position' => 'nullable|integer|min:0',
            'task_id' => 'nullable|integer|exists:tasks,id',
        ]);

        $row = $dataTable->rows()->create([
            'cells' => $data['cells'] ?? [],
            'position' => $data['position'] ?? ((int) $dataTable->rows()->max('position') + 1),
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
            'task_id' => $data['task_id'] ?? null,
        ]);
        $dataTable->touch();

        $this->logRowActivity($dataTable, $row, $request->user(), 'created', isset($data['task_id'])
            ? ['task_id' => $data['task_id']]
            : null);

        return response()->json(['data' => $row->load(['creator:id,name', 'updater:id,name', 'task:id,title'])], 201);
    }

    public function updateRow(Request $request, DamDataTable $dataTable, DamDataRow $row)
    {
        abort_unless($this->canEdit($request->user(), $dataTable), 403);
        abort_if($row->table_id !== $dataTable->id, 404);

        $data = $request->validate([
            'cells' => 'nullable|array|max:200',
            'position' => 'nullable|integer|min:0',
            'task_id' => 'nullable|integer|exists:tasks,id',
        ]);

        $beforeCells = $row->cells ?? [];
        $beforeTaskId = $row->task_id;

        $row->update(array_merge(
            array_filter($data, fn ($value) => $value !== null),
            ['updated_by' => $request->user()->id]
        ));
        // امکان قطع اتصال تسک با ارسال صریح null
        if (array_key_exists('task_id', $data) && $data['task_id'] === null) {
            $row->update(['task_id' => null]);
        }
        $dataTable->touch();

        $afterCells = $row->refresh()->cells ?? [];
        $changedColumns = [];
        foreach (array_unique(array_merge(array_keys($beforeCells), array_keys($afterCells))) as $columnId) {
            if (($beforeCells[$columnId] ?? null) !== ($afterCells[$columnId] ?? null)) {
                $changedColumns[] = $columnId;
            }
        }
        if (!empty($changedColumns)) {
            $this->logRowActivity($dataTable, $row, $request->user(), 'updated', ['columns' => $changedColumns]);
        }
        if ($beforeTaskId !== $row->task_id) {
            $this->logRowActivity(
                $dataTable,
                $row,
                $request->user(),
                $row->task_id ? 'task_linked' : 'task_unlinked',
                ['from' => $beforeTaskId, 'to' => $row->task_id]
            );
        }

        return ['data' => $row->load(['creator:id,name', 'updater:id,name', 'task:id,title'])];
    }

    public function destroyRow(Request $request, DamDataTable $dataTable, DamDataRow $row)
    {
        abort_unless($this->canEdit($request->user(), $dataTable), 403);
        abort_if($row->table_id !== $dataTable->id, 404);

        $this->logRowActivity($dataTable, $row, $request->user(), 'deleted', ['cells' => $row->cells]);
        $row->delete();
        $dataTable->touch();

        return response()->noContent();
    }

    public function rowActivities(Request $request, DamDataTable $dataTable, DamDataRow $row)
    {
        abort_unless($this->canView($request->user(), $dataTable), 403);
        abort_if($row->table_id !== $dataTable->id, 404);

        $activities = DamDataRowActivity::query()
            ->where('row_id', $row->id)
            ->with('actor:id,name')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(100)
            ->get();

        return ['data' => $activities];
    }
}
