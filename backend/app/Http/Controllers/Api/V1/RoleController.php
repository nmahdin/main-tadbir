<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Http\Resources\RoleResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Validator;

class RoleController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $roles = Role::query()
            ->with('permissions')
            ->withCount('users')
            ->orderBy('id')
            ->get();

        return RoleResource::collection($roles);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $role = Role::create([
            'key' => $data['key'],
            'name' => $data['name'],
            'description' => $data['description'] ?? 'نقش سفارشی سامانه تدبیر',
            'color' => $data['color'] ?? '#6366f1',
            'is_system' => false,
            'is_active' => $data['isActive'] ?? true,
        ]);

        $this->syncPermissions($role, $data['permissions'] ?? []);

        return (new RoleResource($role->load('permissions')->loadCount('users')))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, Role $role): RoleResource
    {
        $data = $this->validated($request, $role);

        $role->update([
            'key' => $data['key'],
            'name' => $data['name'],
            'description' => $data['description'] ?? $role->description,
            'color' => $data['color'] ?? $role->color,
            'is_active' => $data['isActive'] ?? $role->is_active,
        ]);

        if (array_key_exists('permissions', $data) && ! $role->is_system) {
            $this->syncPermissions($role, $data['permissions']);
        }

        return new RoleResource($role->refresh()->load('permissions')->loadCount('users'));
    }

    public function destroy(Role $role): Response
    {
        abort_if($role->is_system, 403, 'امکان حذف نقش‌های سیستمی وجود ندارد.');

        $role->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Role $role = null): array
    {
        $keyRule = ['required', 'string', 'max:60', 'regex:/^[A-Za-z0-9_]+$/'];
        $keyRule[] = $role
            ? 'unique:roles,key,'.$role->id
            : 'unique:roles,key';

        return Validator::make($request->all(), [
            'key' => $keyRule,
            'name' => ['required', 'string', 'max:120'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'color' => ['sometimes', 'nullable', 'string', 'max:20'],
            'isActive' => ['sometimes', 'boolean'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string', 'max:80'],
        ])->validate();
    }

    /**
     * @param  array<int, string>  $keys
     */
    private function syncPermissions(Role $role, array $keys): void
    {
        $ids = Permission::query()->whereIn('key', $keys)->pluck('id');

        $role->permissions()->sync($ids);
    }
}
