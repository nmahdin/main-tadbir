<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable([
    'name', 'username', 'email', 'password', 'avatar',
    'role_id', 'role_key', 'status', 'title', 'department_id',
    'phone', 'location', 'bio', 'skills',
    'last_login_at',
])]
#[Hidden(['password', 'remember_token', 'email', 'email_verified_at'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'email_verified_at' => 'datetime',
            'skills' => 'array',
            'two_factor_enabled' => 'boolean',
            'last_login_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'personal_workspace_provisioned_at' => 'datetime',
            'welcomed_at' => 'datetime',
            'reauthenticated_at' => 'datetime',
            'deletion_requested_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // AMB-01=B: normalized form kept in sync for
        // normalization-equivalent uniqueness lookups.
        static::saving(function (self $user): void {
            if ($user->username !== null) {
                $user->username_normalized = \App\Core\Identity\UsernamePolicy::normalize($user->username);
            }
        });
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function departments(): BelongsToMany
    {
        return $this->belongsToMany(Department::class, 'department_user')
            ->withPivot('role', 'joined_at');
    }

    public function managedDepartments(): HasMany
    {
        return $this->hasMany(Department::class, 'manager_id');
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
        // A missing/inactive role never grants authority; role_key is display-only.
        if (! $this->isActive() || ! $this->role?->is_active) {
            return [];
        }

        return $this->role->permissions->pluck('key')->all();
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
        $current = $this->isActive() && $this->role?->is_active ? $this->role->key : null;

        return $current !== null && in_array($current, $keys, true);
    }

    public function isAdmin(): bool
    {
        return $this->hasRole('admin');
    }

    public function isActive(): bool
    {
        return \App\Core\Identity\AccountStatus::of($this->status)?->allowsOperationalAccess() ?? false;
    }
}
