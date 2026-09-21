<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Laravel\Sanctum\HasApiTokens;

#[Fillable([
    'name', 'username', 'email', 'password', 'avatar',
    'role_id', 'role_key', 'status', 'title', 'department_id',
    'phone', 'location', 'bio', 'skills',
    'two_factor_enabled', 'last_login_at'
])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * کش کلید دسترسی‌های نقش در طول یک درخواست.
     *
     * @var array<int, string>|null
     */
    private ?array $permissionKeysCache = null;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'skills' => 'array',
            'two_factor_enabled' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class)
            ->withPivot('role', 'joined_at');
    }

    public function managedProjects(): HasMany
    {
        return $this->hasMany(Project::class, 'project_manager_id');
    }

    public function projects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class)
            ->withPivot('joined_at');
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class, 'assignee_id');
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(ActivityLog::class);
    }

    /**
     * فهرست کلید دسترسی‌های کاربر (بر پایه نقش او).
     *
     * @return array<int, string>
     */
    public function permissionKeys(): array
    {
        if ($this->permissionKeysCache !== null) {
            return $this->permissionKeysCache;
        }

        $role = $this->role;

        if (! $role) {
            return $this->permissionKeysCache = [];
        }

        $role->loadMissing('permissions');

        return $this->permissionKeysCache = $role->permissions->pluck('key')->all();
    }

    public function hasPermission(string $permission): bool
    {
        return in_array($permission, $this->permissionKeys(), true);
    }

    /**
     * @param  array<int, string>|string  $permissions
     */
    public function hasAnyPermission(array|string $permissions): bool
    {
        $permissions = is_array($permissions) ? $permissions : [$permissions];

        return array_intersect($permissions, $this->permissionKeys()) !== [];
    }

    public function hasRole(string ...$keys): bool
    {
        $current = $this->role_key ?? $this->role?->key;

        return $current !== null && in_array($current, $keys, true);
    }

    public function isAdmin(): bool
    {
        return $this->hasRole('admin');
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }
}
