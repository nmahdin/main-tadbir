<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\DepartmentResource;
use App\Models\ActivityLog;
use App\Models\Department;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\Organization\DepartmentConsolidation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DepartmentController extends Controller
{
    public function index()
    {
        app(DepartmentConsolidation::class)->requireReady();

        return DepartmentResource::collection(Department::with(['parent', 'members', 'users'])->orderBy('name')->get());
    }

    /**
     * Minimal authenticated directory for selectors outside department management.
     * Memberships, managers and descriptions intentionally remain behind departments.view.
     */
    public function directory(Request $request)
    {
        app(DepartmentConsolidation::class)->requireReady();

        return response()->json(['data' => Department::query()
            ->orderBy('name')
            ->get(['id', 'name', 'parent_id', 'manager_id', 'status'])
            ->map(fn (Department $department) => [
                'id' => (string) $department->id,
                'name' => $department->name,
                'parentId' => $department->parent_id ? (string) $department->parent_id : null,
                'status' => $department->status,
                ...((int) $department->manager_id === (int) $request->user()->id ? ['managedByMe' => true] : []),
            ])->values()]);
    }

    /** Only departments explicitly managed by the authenticated user; no list permission is required. */
    public function managed(Request $request)
    {
        app(DepartmentConsolidation::class)->requireReady();

        return response()->json(['data' => Department::query()
            ->where('manager_id', $request->user()->id)
            ->orderBy('name')
            ->get(['id', 'name', 'description', 'parent_id', 'status'])
            ->map(fn (Department $department) => [
                'id' => (string) $department->id,
                'name' => $department->name,
                'description' => $department->description ?? '',
                'parentId' => $department->parent_id ? (string) $department->parent_id : null,
                'status' => $department->status,
                'managedByMe' => true,
                'members' => [],
                'createdAt' => '',
            ])->values()]);
    }

    public function consolidation(Request $request, DepartmentConsolidation $service)
    {
        abort_unless($request->user()->isAdmin(), 403);
        if ($request->isMethod('post')) {
            $request->validate(['confirm' => ['required', 'accepted']]);

            return response()->json(['data' => $service->batch($request->user())]);
        }

        return response()->json(['data' => $service->status()]);
    }

    public function store(Request $request)
    {
        return (new DepartmentResource($this->save($request)))->response()->setStatusCode(201);
    }

    public function update(Request $request, Department $department)
    {
        return new DepartmentResource($this->save($request, $department));
    }

    private function save(Request $request, ?Department $department = null): Department
    {
        app(DepartmentConsolidation::class)->requireReady();
        $data = $request->validate([
            'name' => [$department ? 'sometimes' : 'required', 'required', 'string', 'max:120'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'managerId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'parentId' => ['sometimes', 'nullable', 'integer', 'exists:departments,id'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'members' => ['sometimes', 'array', 'max:1000'],
            'members.*.userId' => ['required', 'integer', 'distinct', 'exists:users,id'],
            'members.*.role' => ['sometimes', 'string', 'max:100'],
            'members.*.joinedAt' => ['sometimes', 'nullable', 'date'],
        ], ['parentId.exists' => 'دپارتمان والد وجود ندارد؛ فهرست را دوباره دریافت کنید.', 'managerId.exists' => 'مدیر انتخاب‌شده وجود ندارد.']);
        if (isset($data['members']) || array_key_exists('managerId', $data)) {
            abort_unless($request->user()->hasPermission('departments.manage_members'), 403, 'تعیین مدیر و اعضا نیازمند مجوز مدیریت اعضای دپارتمان است.');
        }

        return DB::transaction(function () use ($request, $department, $data): Department {
            $this->structureLock();
            app(DepartmentConsolidation::class)->requireReady();
            if ($department) {
                $department = Department::whereKey($department->id)->lockForUpdate()->firstOrFail();
            }
            if (array_key_exists('parentId', $data) && $data['parentId'] !== null) {
                $seen = $department ? [$department->id] : [];
                $parent = (int) $data['parentId'];
                while ($parent) {
                    if (in_array($parent, $seen, true)) {
                        throw ValidationException::withMessages(['parentId' => 'والد نمی‌تواند خود دپارتمان یا یکی از زیرمجموعه‌های آن باشد.']);
                    }
                    $seen[] = $parent;
                    $node = Department::whereKey($parent)->lockForUpdate()->first();
                    if (! $node) {
                        throw ValidationException::withMessages(['parentId' => 'دپارتمان والد حذف شده است؛ فهرست را تازه کنید.']);
                    }
                    $parent = (int) $node->parent_id;
                }
            }
            $userIds = array_values(array_unique(array_filter([($data['managerId'] ?? null), ...array_column($data['members'] ?? [], 'userId')])));
            if ($userIds && User::whereIn('id', $userIds)->orderBy('id')->lockForUpdate()->get(['id'])->count() !== count($userIds)) {
                throw ValidationException::withMessages(['members' => 'یکی از کاربران حذف شده است؛ فهرست را دوباره دریافت کنید.']);
            }
            $attributes = [];
            foreach (['name' => 'name', 'description' => 'description', 'status' => 'status', 'managerId' => 'manager_id', 'parentId' => 'parent_id'] as $from => $to) {
                if (array_key_exists($from, $data)) {
                    $attributes[$to] = $data[$from];
                }
            }
            if ($department) {
                $department->update($attributes);
            } else {
                $department = Department::create($attributes);
            }
            if (array_key_exists('members', $data)) {
                $members = [];
                foreach ($data['members'] as $member) {
                    $members[(int) $member['userId']] = ['role' => $member['role'] ?? 'member', 'joined_at' => $member['joinedAt'] ?? now()];
                }
                $department->members()->sync($members);
                // Removing a primary member must not leave a hidden FK-based grant.
                User::where('department_id', $department->id)->whereNotIn('id', array_keys($members))->update(['department_id' => null]);
            }
            ActivityLog::create(['user_id' => $request->user()->id, 'type' => 'department_updated', 'action' => 'ذخیره دپارتمان', 'details' => 'department:'.$department->id.' fields:'.implode(',', array_keys($data))]);

            return $department->refresh()->load(['parent', 'members', 'users']);
        }, 3);
    }

    public function destroy(Request $request, Department $department)
    {
        app(DepartmentConsolidation::class)->requireReady();
        DB::transaction(function () use ($request, $department): void {
            $this->structureLock();
            $department = Department::whereKey($department->id)->lockForUpdate()->firstOrFail();
            // Never turn a restricted table into an unscoped table by cascading its last grant.
            abort_if(DB::table('dam_data_table_department')->where('department_id', $department->id)->exists(), 422, 'ابتدا اتصال جدول‌ها به دپارتمان را تعیین تکلیف کنید.');
            $department->delete();
            ActivityLog::create(['user_id' => $request->user()->id, 'type' => 'department_deleted', 'action' => 'حذف دپارتمان', 'details' => 'department:'.$department->id]);
        }, 3);

        return response()->noContent();
    }

    private function structureLock(): void
    {
        SystemSetting::firstOrCreate(['key' => DepartmentConsolidation::KEY], ['value' => ['phase' => 'done', 'after' => 0]]);
        SystemSetting::where('key', DepartmentConsolidation::KEY)->lockForUpdate()->firstOrFail();
    }
}
