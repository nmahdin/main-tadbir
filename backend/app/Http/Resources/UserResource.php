<?php

namespace App\Http\Resources;

use App\Services\ContentAccess;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * خروجی استاندارد کاربر برای فرانت‌اند.
 *
 * ساختار این ریسورس با تایپ User در frontend/src/types.ts هم‌خوان است تا پس از
 * اتصال APIها، کامپوننت‌های فرانت‌اند نیاز به تغییر نداشته باشند.
 */
class UserResource extends JsonResource
{
    /**
     * وزن تقریبی هر اولویت برای برآورد درصد بار کاری.
     *
     * @var array<string, int>
     */
    private const PRIORITY_WEIGHTS = [
        'urgent' => 30,
        'high' => 20,
        'medium' => 12,
        'low' => 6,
    ];

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $role = $this->role;
        $department = $this->department;

        $activeProjectsCount = $this->countAttribute('active_projects_count')
            ?? $this->projects()->where('status', 'active')->count();

        $completedTasksCount = $this->countAttribute('completed_tasks_count')
            ?? $this->tasks()->where('status', 'completed')->count();

        $openTasksCount = $this->countAttribute('open_tasks_count')
            ?? $this->tasks()->where('status', '!=', 'completed')->count();
        $managedDepartmentIds = (int) $request->user()?->id === (int) $this->id
            ? $this->managedDepartments()->pluck('id')->map(fn ($id) => (string) $id)->values()->all()
            : [];

        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'username' => $this->username,
            'avatar' => $this->avatar,
            'bio' => $this->bio,
            'phone' => $this->phone,
            'location' => $this->location,
            'title' => $this->title,
            'status' => $this->status,
            'role' => $role?->key ?? '',
            'roleIsActive' => (bool) $role?->is_active,
            'roleId' => $this->role_id !== null ? (string) $this->role_id : null,
            'roleName' => $role?->name,
            'roleColor' => $role?->color,
            'department' => $department?->name,
            'departmentId' => $this->department_id !== null ? (string) $this->department_id : null,
            'skills' => $this->skills ?? [],
            'twoFactorEnabled' => (bool) $this->two_factor_enabled,
            'lastLogin' => $this->last_login_at?->toIso8601String(),
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
            'activeProjectsCount' => (int) $activeProjectsCount,
            'completedTasksCount' => (int) $completedTasksCount,
            'workloadPercentage' => $this->workloadPercentage((int) $openTasksCount),
            'permissions' => $this->permissionKeys(),
            'managedDepartmentIds' => $managedDepartmentIds,
            'contentMembershipAccess' => $this->contentMembershipAccess($department),
        ];
    }

    /**
     * خواندن مقدار شمارشی که با withCount بارگذاری شده است (در صورت وجود).
     */
    private function countAttribute(string $key): ?int
    {
        $value = $this->resource->getAttribute($key);

        return $value === null ? null : (int) $value;
    }

    /**
     * برآورد درصد بار کاری بر پایه وزن اولویت وظایف باز کاربر.
     *
     * این محاسبه موقت است تا زمانی که ظرفیت رسمی هر نقش در دیتابیس ثبت شود.
     */
    private function workloadPercentage(int $openTasksCount): int
    {
        if ($openTasksCount === 0) {
            return 0;
        }

        // Collection endpoints provide one correlated aggregate for every user,
        // avoiding a priority query per resource. Detail/auth responses retain a
        // safe fallback because they serialize only one user.
        $aggregate = $this->resource->getAttribute('workload_score');
        if ($aggregate !== null) {
            return (int) min(100, (int) $aggregate);
        }

        $tasksByPriority = $this->tasks()
            ->where('status', '!=', 'completed')
            ->selectRaw('priority, count(*) as total')
            ->groupBy('priority')
            ->pluck('total', 'priority');

        $score = 0;

        foreach ($tasksByPriority as $priority => $total) {
            $score += (self::PRIORITY_WEIGHTS[$priority] ?? 10) * (int) $total;
        }

        return (int) min(100, $score);
    }

    private function contentMembershipAccess(mixed $department): bool
    {
        if (! $this->resource->isActive() || ! $this->role?->is_active) {
            return false;
        }

        $membership = $this->resource->getAttribute('department_membership_exists');
        if ($membership !== null) {
            return (bool) $membership || $department?->status === 'active';
        }

        return app(ContentAccess::class)->departmentIds($this->resource) !== [];
    }
}
