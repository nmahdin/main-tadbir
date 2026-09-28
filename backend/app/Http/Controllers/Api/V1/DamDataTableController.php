<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DamDataRow;
use App\Models\DamDataRowActivity;
use App\Models\DamDataTable;
use App\Models\User;
use App\Services\DamTableAccess;
use App\Services\DamTableRows;
use Illuminate\Http\Request;

/**
 * جدول‌های اطلاعات (شیت‌ها): هر جدول مانند یک شیت اکسل است و
 * ردیف‌های آن به‌صورت رکورد دیتابیسی ذخیره و ویرایش می‌شوند.
 *
 * دسترسی: اگر جدول «grants» داشته باشد فقط موارد فهرست (کاربر/نقش/
 * پروژه/محتوا)، سازنده و مدیر دسترسی آن را می‌بینند؛ در غیر این
 * صورت مجوزهای کلی اعمال می‌شود.
 */
class DamDataTableController extends Controller
{
    private function canView(User $user, DamDataTable $table): bool
    {
        return app(DamTableAccess::class)->canView($user, $table);
    }

    private function canEdit(User $user, DamDataTable $table): bool
    {
        return app(DamTableAccess::class)->canEdit($user, $table);
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

    private function columnRules(): array
    {
        return [
            'columns' => 'nullable|array|max:100',
            'columns.*.id' => 'required|string|max:60|distinct|regex:/^[A-Za-z0-9_-]+$/',
            'columns.*.name' => 'required|string|max:120',
            'columns.*.type' => 'nullable|string|in:text,number,date,select',
            'columns.*.required' => 'sometimes|boolean',
            'columns.*.max_length' => 'sometimes|integer|min:1|max:3000',
            'columns.*.options' => 'nullable|array|max:100',
            'columns.*.options.*' => 'string|max:120',
        ];
    }

    private function grantRules(): array
    {
        return [
            'grants' => 'nullable|array|max:200',
            'grants.*.type' => 'nullable|string|in:user,role,project,content',
            'grants.*.id' => 'nullable',
            'grants.*.user_id' => 'nullable|integer',
            'grants.*.access' => 'nullable|string|in:view,edit',
        ];
    }

    /** نرمال‌سازی ورودی grants (پشتیبانی از فرمت قدیمی user_id). */
    private function normalizedGrants(?array $grants): array
    {
        $normalized = [];
        foreach ($grants ?? [] as $grant) {
            if (! is_array($grant)) {
                continue;
            }
            if (isset($grant['user_id']) && empty($grant['type'])) {
                $normalized[] = ['type' => 'user', 'id' => (int) $grant['user_id'], 'access' => $grant['access'] ?? 'view'];
            } elseif (isset($grant['type'], $grant['id'])) {
                $normalized[] = [
                    'type' => (string) $grant['type'],
                    'id' => is_numeric($grant['id']) ? (int) $grant['id'] : (string) $grant['id'],
                    'access' => $grant['access'] ?? 'view',
                ];
            }
        }

        return $normalized;
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

        $data = $request->validate(array_merge([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'folder' => 'nullable|string|max:120',
            'category' => 'nullable|string|max:120',
        ], $this->columnRules(), $this->grantRules()));

        if (array_key_exists('grants', $data)) {
            $data['grants'] = $this->normalizedGrants($data['grants']);
        }

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
            'rows.content:id,title',
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

        $data = $request->validate(array_merge([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'folder' => 'nullable|string|max:120',
            'category' => 'nullable|string|max:120',
        ], $this->columnRules(), $this->grantRules()));

        // فقط سازنده یا مدیر دسترسی می‌تواند فهرست دسترسی را تغییر دهد.
        if (array_key_exists('grants', $data)) {
            $isOwner = (int) $dataTable->created_by === (int) $request->user()->id;
            abort_unless($isOwner || $request->user()->hasPermission('assets.manage_access'), 403);
        }

        if (array_key_exists('grants', $data)) {
            $data['grants'] = $this->normalizedGrants($data['grants']);
        }

        $dataTable->update($data);

        return ['data' => $dataTable->refresh()->load('creator:id,name')->loadCount('rows')];
    }

    public function destroy(Request $request, DamDataTable $dataTable)
    {
        abort_unless($request->user()->hasAnyPermission(['assets.delete', 'assets.manage_access']), 403);

        abort_unless($this->canView($request->user(), $dataTable), 403);
        $dataTable->delete();

        return response()->noContent();
    }

    /**
     * ردیف‌های متصل به یک تسک، همراه نام جدول — برای بخش ضمیمه تسک.
     */
    public function rowsByTask(Request $request)
    {
        abort_unless($request->user()->hasPermission('assets.view'), 403);

        $data = $request->validate(['task_id' => 'required|integer|exists:tasks,id']);

        $rows = DamDataRow::query()
            ->where('task_id', $data['task_id'])
            ->with(['dataTable:id,name', 'creator:id,name', 'content:id,title'])
            ->orderBy('updated_at', 'desc')
            ->limit(200)
            ->get()
            ->filter(fn (DamDataRow $row) => $row->dataTable && $this->canView($request->user(), $row->dataTable))
            ->values();

        return ['data' => $rows];
    }

    public function storeRow(Request $request, DamDataTable $dataTable)
    {
        abort_unless($this->canEdit($request->user(), $dataTable), 403);

        $data = $request->validate([
            'cells' => 'nullable|array|max:200',
            'position' => 'nullable|integer|min:0',
            'task_id' => 'nullable|integer|exists:tasks,id',
            'content_id' => 'nullable|integer|exists:contents,id',
        ]);

        $row = app(DamTableRows::class)->create($request->user(), $dataTable, $data);

        return response()->json(['data' => $row->load(['creator:id,name', 'updater:id,name', 'task:id,title', 'content:id,title'])], 201);
    }

    public function updateRow(Request $request, DamDataTable $dataTable, DamDataRow $row)
    {
        abort_unless($this->canEdit($request->user(), $dataTable), 403);
        abort_if($row->table_id !== $dataTable->id, 404);

        $data = $request->validate([
            'cells' => 'nullable|array|max:200',
            'position' => 'nullable|integer|min:0',
            'task_id' => 'nullable|integer|exists:tasks,id',
            'content_id' => 'nullable|integer|exists:contents,id',
        ]);

        if (array_key_exists('cells', $data)) {
            $data['cells'] = app(DamTableRows::class)->validateCells($dataTable, $data['cells'] ?? []);
        }
        $beforeCells = $row->cells ?? [];
        $beforeTaskId = $row->task_id;
        $beforeContentId = $row->content_id;

        $row->update(array_merge(
            array_filter($data, fn ($value) => $value !== null),
            ['updated_by' => $request->user()->id]
        ));
        // امکان قطع اتصال تسک/محتوا با ارسال صریح null
        foreach (['task_id', 'content_id'] as $linkField) {
            if (array_key_exists($linkField, $data) && $data[$linkField] === null) {
                $row->update([$linkField => null]);
            }
        }
        $dataTable->touch();

        $afterCells = $row->refresh()->cells ?? [];
        $changedColumns = [];
        foreach (array_unique(array_merge(array_keys($beforeCells), array_keys($afterCells))) as $columnId) {
            if (($beforeCells[$columnId] ?? null) !== ($afterCells[$columnId] ?? null)) {
                $changedColumns[] = $columnId;
            }
        }
        if (! empty($changedColumns)) {
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
        if ($beforeContentId !== $row->content_id) {
            $this->logRowActivity(
                $dataTable,
                $row,
                $request->user(),
                $row->content_id ? 'content_linked' : 'content_unlinked',
                ['from' => $beforeContentId, 'to' => $row->content_id]
            );
        }

        return ['data' => $row->load(['creator:id,name', 'updater:id,name', 'task:id,title', 'content:id,title'])];
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
