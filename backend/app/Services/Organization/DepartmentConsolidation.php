<?php

namespace App\Services\Organization;

use App\Models\Department;
use App\Models\Permission;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/** Bounded, resumable conversion; legacy rows remain read-only for recovery. */
final class DepartmentConsolidation
{
    public const KEY = 'department_consolidation_private';

    public const PHASES = ['teams', 'contents', 'workspace_records', 'domain_records', 'system_settings', 'permissions', 'done'];

    public const PERMISSIONS = ['teams.view' => ['departments.view'], 'teams.create' => ['departments.create'],
        'teams.edit' => ['departments.edit', 'departments.manage_members'], 'teams.delete' => ['departments.delete']];

    public function installed(): bool
    {
        return Schema::hasColumn('departments', 'legacy_team_id') && Schema::hasTable('department_user') && Schema::hasTable('dam_data_table_department');
    }

    public function status(): array
    {
        $state = SystemSetting::where('key', self::KEY)->first()?->value;

        return ['installed' => $this->installed(), 'phase' => $state['phase'] ?? 'teams', 'after' => $state['after'] ?? 0];
    }

    public function requireReady(): void
    {
        $status = $this->status();
        abort_unless($status['installed'] && $status['phase'] === 'done', 503, 'انتقال ساختار دپارتمان کامل نشده است. مدیر سیستم راهنمای docs/deployment/departments-consolidation.md را اجرا کند.');
    }

    public function batch(User $actor): array
    {
        abort_unless($this->installed(), 503, 'ابتدا SQL ساختار دپارتمان را پس از پشتیبان‌گیری نصب کنید.');

        return DB::transaction(function () use ($actor): array {
            SystemSetting::firstOrCreate(['key' => self::KEY], ['value' => ['phase' => 'teams', 'after' => 0]]);
            $setting = SystemSetting::where('key', self::KEY)->lockForUpdate()->firstOrFail();
            $state = $setting->value;
            $phase = $state['phase'];
            if ($phase === 'done') {
                return $this->status();
            }
            if ($phase === 'permissions') {
                foreach (self::PERMISSIONS as $old => $targets) {
                    $oldId = DB::table('permissions')->where('key', $old)->value('id');
                    if (! $oldId) {
                        continue;
                    }
                    foreach ($targets as $key) {
                        $target = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'departments'])->id;
                        foreach (DB::table('permission_role')->where('permission_id', $oldId)->get() as $grant) {
                            DB::table('permission_role')->insertOrIgnore(['permission_id' => $target, 'role_id' => $grant->role_id]);
                        }
                    }
                    DB::table('permission_role')->where('permission_id', $oldId)->delete();
                    DB::table('permissions')->where('id', $oldId)->delete();
                }
                DB::table('bale_conversations')->delete();
                DB::table('bale_outbox')->where('status', 'pending')->update(['status' => 'cancelled', 'error_code' => 'organization_migrated']);
                $state = ['phase' => 'done', 'after' => 0];
                DB::table('activity_logs')->insert(['user_id' => $actor->id, 'type' => 'departments_consolidated', 'action' => 'انتقال تیم‌ها به دپارتمان‌ها تکمیل شد', 'created_at' => now(), 'updated_at' => now()]);
            } else {
                $rows = DB::table($phase)->where('id', '>', $state['after'])->orderBy('id')->limit(50)->get();
                foreach ($rows as $row) {
                    if ($phase === 'teams') {
                        $this->team($row);
                    } elseif (in_array($phase, ['contents', 'workspace_records', 'domain_records', 'system_settings'], true)) {
                        if ($phase === 'system_settings' && in_array($row->key, [self::KEY, 'bale_private'], true)) {
                            continue;
                        }
                        $column = $phase === 'system_settings' ? 'value' : 'payload';
                        $before = json_decode($row->$column ?? 'null', true, 512, JSON_THROW_ON_ERROR);
                        if (is_array($before)) {
                            $after = $this->rewrite($before);
                            if ($before !== $after) {
                                if ($phase === 'system_settings' && $row->key === 'bale_automations_private') {
                                    $after['revision'] = (int) ($after['revision'] ?? 0) + 1;
                                }
                                DB::table($phase)->where('id', $row->id)->update([$column => json_encode($after, JSON_UNESCAPED_UNICODE)]);
                            }
                        }
                    }
                    $state['after'] = $row->id;
                }
                if ($rows->count() < 50) {
                    $state = ['phase' => self::PHASES[array_search($phase, self::PHASES, true) + 1], 'after' => 0];
                }
            }
            $setting->update(['value' => $state, 'updated_by' => $actor->id]);

            return ['installed' => true, ...$state];
        }, 3);
    }

    private function team(object $team): void
    {
        $department = Department::firstOrCreate(['legacy_team_id' => $team->id], [
            'name' => mb_substr($team->name, 0, 120), 'description' => $team->description,
            'parent_id' => $team->department_id, 'manager_id' => $team->leader_id,
            'status' => $team->status === 'active' ? 'active' : 'inactive',
        ]);
        foreach (DB::table('team_user')->where('team_id', $team->id)->get() as $member) {
            DB::table('department_user')->insertOrIgnore(['department_id' => $department->id, 'user_id' => $member->user_id,
                'role' => $member->role ?? 'member', 'joined_at' => $member->joined_at ?? now()]);
        }
        // Preserve the old membership boundary: a leader not present in team_user
        // does not silently receive table access during conversion.
        foreach (DB::table('dam_data_table_team')->where('team_id', $team->id)->get() as $link) {
            DB::table('dam_data_table_department')->insertOrIgnore(['department_id' => $department->id, 'dam_data_table_id' => $link->dam_data_table_id]);
        }
    }

    private function mapped(mixed $id): string
    {
        $result = Department::where('legacy_team_id', $id)->value('id');
        if (! $result) {
            throw ValidationException::withMessages(['migration' => 'ارجاع به تیم بدون مقصد وجود دارد؛ شناسهٔ قدیمی: '.mb_substr((string) $id, 0, 80)]);
        }

        return (string) $result;
    }

    public function rewrite(array $value): array
    {
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = $this->rewrite($item);
            }
        }
        foreach (['teamId' => 'departmentId', 'toTeamId' => 'toDepartmentId', 'team_id' => 'department_id'] as $old => $new) {
            if (! array_key_exists($old, $value)) {
                continue;
            }
            $id = $value[$old];
            unset($value[$old]);
            if ($id === null || $id === '') {
                $value[$new] ??= null;

                continue;
            }
            $mapped = $this->mapped($id);
            if (! empty($value[$new]) && (string) $value[$new] !== $mapped) {
                $value['departmentIds'] = array_values(array_unique([...(array) ($value['departmentIds'] ?? []), (string) $value[$new], $mapped]));
            } else {
                $value[$new] = $old === 'team_id' ? (int) $mapped : $mapped;
            }
        }
        foreach (['teamIds' => 'departmentIds', 'team_ids' => 'department_ids'] as $old => $new) {
            if (isset($value[$old])) {
                $value[$new] = array_values(array_unique([...(array) ($value[$new] ?? []), ...array_map(fn ($id) => $this->mapped($id), $value[$old])]));
                unset($value[$old]);
            }
        }
        if (($value['targetType'] ?? null) === 'team') {
            $value['targetType'] = 'department';
            $value['targetId'] = $this->mapped($value['targetId']);
        }
        if (($value['permissionLevel'] ?? null) === 'team') {
            $value['permissionLevel'] = 'department';
        }

        return $value;
    }
}
