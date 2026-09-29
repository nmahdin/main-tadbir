<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UserRequest;
use App\Http\Resources\UserResource;
use App\Models\ActivityLog;
use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use App\Services\Access\AccessAdministration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

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
                        ->orWhere('title', 'like', "%{$search}%");
                });
            })
            ->orderBy('name')
            ->paginate(min(max($request->integer('per_page', 100), 1), 100));

        return UserResource::collection($users);
    }

    public function store(UserRequest $request): JsonResponse
    {
        $user = DB::transaction(function () use ($request): User {
            $access = app(AccessAdministration::class);
            $access->lockAdminRole();
            $attributes = $this->attributes($request->validated());
            if (isset($attributes['role_id'])) {
                $access->authorizeRole($request->user()->fresh(), Role::findOrFail($attributes['role_id']));
            }

            if (! empty($attributes['department_id'])) {
                abort_unless($request->user()->hasPermission('departments.manage_members'), 403);
            }

            return User::create($attributes);
        });

        return (new UserResource($user->load(['role.permissions', 'department'])))
            ->response()
            ->setStatusCode(201);
    }

    public function update(UserRequest $request, User $user): UserResource
    {
        $user = DB::transaction(function () use ($request, $user): User {
            $access = app(AccessAdministration::class);
            $access->lockAdminRole();
            $actor = $request->user()->fresh();
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->is($user) || $actor->hasAnyPermission(['users.edit', 'users.status']), 403);
            $data = $request->validated();
            if ($actor->is($user) && ! $actor->isAdmin()) {
                abort_if((isset($data['role']) && $data['role'] !== $user->role?->key)
                    || (isset($data['roleId']) && (string) $data['roleId'] !== (string) $user->role_id), 403);
            }
            // Preserve self-profile editing, but never silently discard a requested
            // privilege change. Full-record sync is allowed only for unchanged fields.
            $attributes = $this->attributes($data);
            $candidate = clone $user;
            $candidate->fill($attributes);
            $changes = $candidate->getDirty();
            $selfFields = ['name', 'username', 'password', 'phone', 'location', 'bio', 'skills'];
            foreach (array_keys($changes) as $field) {
                if (in_array($field, ['role_id', 'role_key'], true)) {
                    abort_unless(! $actor->is($user) || $actor->isAdmin(), 403);
                    abort_unless($actor->isAdmin() || $actor->hasPermission('users.edit'), 403);
                    $access->authorizeRole($actor, $user->role ?? Role::findOrFail($attributes['role_id']));
                    $access->authorizeRole($actor, Role::findOrFail($attributes['role_id']));
                } elseif ($field === 'department_id') {
                    abort_unless($actor->hasPermission('users.edit') && $actor->hasPermission('departments.manage_members'), 403);
                } elseif ($field === 'status') {
                    abort_unless($actor->isAdmin() || $actor->hasPermission('users.status'), 403, 'تغییر وضعیت نیازمند مجوز مستقل است.');
                } else {
                    abort_unless(($actor->is($user) && in_array($field, $selfFields, true)) || $actor->hasPermission('users.edit'), 403);
                }
            }
            // Editing an administrator's password/profile is also an escalation path.
            if ($changes !== [] && $user->role?->key === 'admin') {
                abort_unless($actor->isAdmin(), 403);
            }
            $access->protectLastAdmin($user, $attributes);
            $user->fill($attributes)->save();
            if ($changes !== []) {
                ActivityLog::create(['user_id' => $actor->id, 'type' => 'user_access_updated',
                    'action' => 'ویرایش حساب کاربری', 'details' => 'user_id:'.$user->id.'; fields:'.implode(',', array_keys($changes))]);
            }

            return $user;
        });

        return new UserResource($user->refresh()->load(['role.permissions', 'department']));
    }

    public function destroy(Request $request, User $user): Response
    {
        DB::transaction(function () use ($request, $user): void {
            $access = app(AccessAdministration::class);
            $access->lockAdminRole();
            $actor = $request->user()->fresh();
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_if($actor->is($user), 422, 'حذف حساب کاربری فعال امکان‌پذیر نیست.');
            if ($user->role?->key === 'admin') {
                abort_unless($actor->isAdmin(), 403);
            }
            $access->protectLastAdmin($user, deleting: true);
            $user->delete();
        });

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

    /**
     * بارگذاری عکس پروفایل کاربر (حداکثر ۲ مگابایت) و ذخیره مسیر عمومی آن.
     */
    public function avatar(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        abort_unless($actor->is($user) || $actor->hasAnyPermission('users.edit'), 403, 'شما اجازه ویرایش این کاربر را ندارید.');

        $data = $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        $path = $request->file('avatar')->store('avatars', 'public');
        $user->update(['avatar' => '/storage/'.$path]);

        return response()->json([
            'data' => new UserResource($user->refresh()->load(['role.permissions', 'department'])),
            'message' => 'عکس پروفایل با موفقیت ذخیره شد.',
        ]);
    }

    private function attributes(array $data): array
    {
        $attributes = Arr::only($data, ['name', 'username', 'password', 'status', 'title', 'phone', 'location', 'bio', 'skills', 'avatar']);

        $role = null;
        if (array_key_exists('roleId', $data) && $data['roleId'] !== null) {
            $role = is_numeric($data['roleId']) ? Role::whereKey((int) $data['roleId'])->lockForUpdate()->first() : null;
            if (! $role) {
                throw ValidationException::withMessages(['roleId' => 'نقش انتخاب‌شده معتبر نیست.']);
            }
        }
        if (isset($data['role'])) {
            $byKey = Role::where('key', $data['role'])->lockForUpdate()->first();
            if (! $byKey || ($role && ! $role->is($byKey))) {
                throw ValidationException::withMessages(['role' => 'کلید و شناسه نقش باید به یک نقش معتبر اشاره کنند.']);
            }
            $role = $byKey;
        }
        if ($role) {
            $attributes['role_id'] = $role->id;
            $attributes['role_key'] = $role->key;
        }

        if (array_key_exists('departmentId', $data)) {
            $attributes['department_id'] = $data['departmentId'];
        } elseif (array_key_exists('department', $data)) {
            $matches = $data['department'] ? Department::where('name', $data['department'])->limit(2)->pluck('id') : collect();
            if ($data['department'] && $matches->count() !== 1) {
                throw ValidationException::withMessages(['department' => 'دپارتمان نامعتبر یا نام تکراری است؛ دپارتمان را با شناسه انتخاب کنید.']);
            }
            $attributes['department_id'] = $matches->first();
        }

        return $attributes;
    }
}
