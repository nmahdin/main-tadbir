<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UserRequest;
use App\Http\Resources\UserResource;
use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;

class UserController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $users = User::query()
            ->with(['role.permissions', 'department'])
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('name', 'like', "%{$search}%")
                        ->orWhere('username', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%")
                        ->orWhere('title', 'like', "%{$search}%");
                });
            })
            ->orderBy('name')
            ->paginate(min(max($request->integer('per_page', 100), 1), 100));

        return UserResource::collection($users);
    }

    public function store(UserRequest $request): JsonResponse
    {
        $user = User::create($this->attributes($request->validated()));

        return (new UserResource($user->load(['role.permissions', 'department'])))
            ->response()
            ->setStatusCode(201);
    }

    public function update(UserRequest $request, User $user): UserResource
    {
        $actor = $request->user();
        abort_unless($actor->is($user) || $actor->hasAnyPermission('users.edit'), 403, 'شما اجازه ویرایش این کاربر را ندارید.');

        $data = $request->validated();
        if ($actor->is($user) && ! $actor->hasAnyPermission('users.edit')) {
            $data = Arr::only($data, ['name', 'username', 'email', 'password', 'phone', 'location', 'bio', 'skills', 'twoFactorEnabled']);
        }

        $user->update($this->attributes($data));

        return new UserResource($user->refresh()->load(['role.permissions', 'department']));
    }

    public function destroy(User $user): Response
    {
        abort_if($user->is(request()->user()), 422, 'حذف حساب کاربری فعال امکان‌پذیر نیست.');
        $user->delete();

        return response()->noContent();
    }

    public function directory(Request $request): JsonResponse
    {
        $users = User::query()
            ->where('status', 'active')
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('name', 'like', "%{$search}%")
                        ->orWhere('username', 'like', "%{$search}%");
                });
            })
            ->orderBy('name')
            ->limit(100)
            ->get(['id', 'name', 'username', 'avatar', 'title'])
            ->map(fn (User $user) => [
                'id' => (string) $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'avatar' => $user->avatar,
                'title' => $user->title,
            ]);

        return response()->json(['data' => $users]);
    }

    private function attributes(array $data): array
    {
        $attributes = Arr::only($data, ['name', 'username', 'email', 'password', 'status', 'title', 'phone', 'location', 'bio', 'skills']);

        if (array_key_exists('twoFactorEnabled', $data)) {
            $attributes['two_factor_enabled'] = $data['twoFactorEnabled'];
        }

        if (isset($data['role'])) {
            $role = Role::query()->where('key', $data['role'])->firstOrFail();
            $attributes['role_id'] = $role->id;
            $attributes['role_key'] = $role->key;
        }

        if (array_key_exists('department', $data)) {
            $attributes['department_id'] = $data['department']
                ? Department::query()->where('name', $data['department'])->value('id')
                : null;
        }

        return $attributes;
    }
}
