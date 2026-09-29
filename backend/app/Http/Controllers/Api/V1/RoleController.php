<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\RoleResource;
use App\Models\ActivityLog;
use App\Models\Permission;
use App\Models\Role;
use App\Services\Access\AccessAdministration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class RoleController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return RoleResource::collection(Role::with('permissions')->withCount('users')->orderBy('id')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $actor = $request->user();
        abort_if(in_array($data['key'], ['admin', 'content_manager'], true) && ! $actor->isAdmin(), 403);
        if (($data['permissions'] ?? []) !== []) {
            app(AccessAdministration::class)->authorizePermissions($actor, $data['permissions']);
        }
        $role = DB::transaction(function () use ($request, $data): Role {
            $role = Role::create([
                'key' => $data['key'], 'name' => $data['name'],
                'description' => $data['description'] ?? 'نقش سفارشی سامانه تدبیر',
                'color' => $data['color'] ?? '#6366f1', 'is_system' => false,
                'is_active' => $data['isActive'] ?? true,
            ]);
            $this->syncPermissions($role, $data['permissions'] ?? []);
            $this->audit($request, $role, 'role_created');

            return $role;
        });

        return (new RoleResource($role->load('permissions')->loadCount('users')))->response()->setStatusCode(201);
    }

    public function update(Request $request, Role $role): RoleResource
    {
        $data = $this->validated($request, $role);
        $role = DB::transaction(function () use ($request, $role, $data): Role {
            $role = Role::whereKey($role->id)->lockForUpdate()->firstOrFail();
            $data = ['key' => $role->key, 'name' => $role->name, ...$data];
            $actor = $request->user()->fresh();
            $access = app(AccessAdministration::class);
            $keyChanged = $data['key'] !== $role->key;
            abort_if($role->is_system && $keyChanged, 403, 'تغییر کلید نقش سیستمی مجاز نیست.');
            abort_if(($role->is_system || in_array($role->key, ['admin', 'content_manager'], true)
                || in_array($data['key'], ['admin', 'content_manager'], true)) && ! $actor->isAdmin(), 403);
            abort_if($role->key === 'admin' && ($data['isActive'] ?? true) === false, 422, 'نقش مدیر سیستم نباید غیرفعال شود.');
            $currentKeys = $role->permissions->pluck('key')->sort()->values()->all();
            $incomingKeys = collect($data['permissions'] ?? $currentKeys)->sort()->values()->all();
            $permissionsChanged = $currentKeys !== $incomingKeys;
            $stateChanged = isset($data['isActive']) && $data['isActive'] !== $role->is_active;
            if ($permissionsChanged || $stateChanged || $keyChanged) {
                $access->authorizeRole($actor, $role);
                $access->authorizePermissions($actor, $incomingKeys);
                // System permissions are seeded; do not silently pretend to save them.
                abort_if($role->is_system && $permissionsChanged, 403, 'مجوزهای نقش سیستمی ثابت هستند.');
            }
            $metadata = ['key' => $data['key'], 'name' => $data['name'],
                'description' => $data['description'] ?? $role->description,
                'color' => $data['color'] ?? $role->color];
            $candidate = clone $role;
            $candidate->fill($metadata);
            abort_if($candidate->isDirty() && ! ($actor->isAdmin() || $actor->hasPermission('roles.edit')), 403);
            $role->update([...$metadata, 'is_active' => $data['isActive'] ?? $role->is_active]);
            if ($keyChanged) {
                $role->users()->update(['role_key' => $data['key']]);
            }
            if ($permissionsChanged) {
                $this->syncPermissions($role, $incomingKeys);
            }
            if ($candidate->isDirty() || $permissionsChanged || $stateChanged) {
                $this->audit($request, $role, 'role_updated');
            }

            return $role;
        });

        return new RoleResource($role->refresh()->load('permissions')->loadCount('users'));
    }

    public function destroy(Request $request, Role $role): Response
    {
        DB::transaction(function () use ($request, $role): void {
            $role = Role::whereKey($role->id)->lockForUpdate()->firstOrFail();
            abort_if($role->is_system || $role->key === 'admin', 403, 'حذف نقش سیستمی مجاز نیست.');
            abort_if($role->key === 'content_manager' && ! $request->user()->isAdmin(), 403);
            abort_if($role->users()->exists(), 422, 'ابتدا نقش کاربران منتسب را تغییر دهید.');
            $this->audit($request, $role, 'role_deleted');
            $role->delete();
        });

        return response()->noContent();
    }

    private function validated(Request $request, ?Role $role = null): array
    {
        return Validator::make($request->all(), [
            'key' => [$role ? 'sometimes' : 'required', 'string', 'max:60', 'regex:/^[A-Za-z0-9_]+$/', 'unique:roles,key'.($role ? ','.$role->id : '')],
            'name' => [$role ? 'sometimes' : 'required', 'string', 'max:120'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'color' => ['sometimes', 'nullable', 'string', 'max:20'],
            'isActive' => ['sometimes', 'boolean'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string', 'max:80', 'distinct', 'exists:permissions,key'],
        ])->validate();
    }

    private function syncPermissions(Role $role, array $keys): void
    {
        $role->permissions()->sync(Permission::whereIn('key', $keys)->pluck('id'));
    }

    private function audit(Request $request, Role $role, string $type): void
    {
        ActivityLog::create(['user_id' => $request->user()->id, 'type' => $type,
            'action' => 'مدیریت نقش و مجوزها', 'details' => 'role_id:'.$role->id]);
    }
}
