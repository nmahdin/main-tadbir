<?php

namespace App\Http\Middleware;

use App\Models\Department;
use App\Services\Organization\DepartmentConsolidation;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** Refuse partial conversions and stale clients; never reinterpret a team ID. */
final class EnsureDepartmentStructure
{
    public function handle(Request $request, Closure $next)
    {
        $bootstrap = $request->is('api/v1/departments/consolidation', 'api/v1/auth/*')
            || ($request->isMethod('get') && $request->is('api/v1/users', 'api/v1/users/directory', 'api/v1/roles', 'api/v1/settings'));
        if (! $bootstrap) {
            app(DepartmentConsolidation::class)->requireReady();
        }
        if (! $request->isMethod('get') && ! $request->is('api/v1/departments/consolidation')) {
            $ids = [];
            $this->references($request->all(), $ids);
            $ids = array_unique($ids);
            if ($ids && Department::whereIn('id', $ids)->count() !== count($ids)) {
                throw ValidationException::withMessages(['departmentId' => 'یکی از دپارتمان‌های ارجاع‌شده وجود ندارد؛ اطلاعات را از سرور تازه کنید.']);
            }
        }

        return $next($request);
    }

    private function references(array $data, array &$ids): void
    {
        foreach ($data as $key => $value) {
            if (in_array($key, ['teamId', 'teamIds', 'toTeamId', 'team_id', 'team_ids'], true)
                || (in_array($key, ['targetType', 'permissionLevel'], true) && $value === 'team')) {
                throw ValidationException::withMessages(['departmentId' => 'این درخواست از ساختار قدیمی تیم استفاده می‌کند. صفحه را تازه کنید؛ شناسهٔ تیم قابل استفاده به جای دپارتمان نیست.']);
            }
            if (is_array($value)) {
                $this->references($value, $ids);
            }
            if (in_array($key, ['departmentId', 'toDepartmentId', 'department_id'], true) && $value !== null && $value !== '') {
                $this->add($value, $ids);
            }
            if (in_array($key, ['departmentIds', 'department_ids'], true)) {
                if (! is_array($value)) {
                    throw ValidationException::withMessages([$key => 'فهرست دپارتمان‌ها نامعتبر است.']);
                }
                foreach ($value as $id) {
                    $this->add($id, $ids);
                }
            }
        }
        if (($data['targetType'] ?? null) === 'department') {
            $this->add($data['targetId'] ?? null, $ids);
        }
    }

    private function add(mixed $id, array &$ids): void
    {
        if ((! is_int($id) && ! is_string($id)) || ! ctype_digit((string) $id) || (int) $id < 1) {
            throw ValidationException::withMessages(['departmentId' => 'شناسهٔ دپارتمان باید شناسهٔ معتبر سرور باشد.']);
        }
        $ids[] = (int) $id;
    }
}
