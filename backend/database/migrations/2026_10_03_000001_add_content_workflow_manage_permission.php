<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Narrow, explicit permission for restructuring a content workflow.
 *
 * `content.edit` used to carry workflow authority as a side effect. The new key
 * lets an administrator split "may edit this content" from "may redesign its
 * stages/assignees". Every role that already holds a managerial content grant
 * receives the new key in the same migration, so no existing owner silently
 * loses access on deploy; administrators can revoke it later from the matrix.
 */
return new class extends Migration
{
    public const KEY = 'content.workflow.manage';

    public const LABEL = 'مدیریت جریان تولید محتوا';

    public const DESCRIPTION = 'طراحی مراحل، ارزیابان و سیاست پیشروی جریان محتوا';

    /** Backwards-compatible additions shipped with the workflow hardening. */
    public const GRANTS = [
        'content.workflow.manage' => [
            'label' => 'مدیریت جریان تولید محتوا',
            'description' => 'طراحی مراحل، ارزیابان و سیاست پیشروی جریان محتوا',
        ],
        'content.force_delete' => [
            'label' => 'حذف دائمی محتوا',
            'description' => 'حذف نهایی پرونده محتوا با تأیید صریح و ثبت در گزارش عملیات',
        ],
    ];

    public function up(): void
    {
        $permission = Permission::query()->updateOrCreate(
            ['key' => self::KEY],
            ['label' => self::LABEL, 'description' => self::DESCRIPTION, 'category' => 'content'],
        );
        foreach (self::GRANTS as $key => $attributes) {
            Permission::query()->updateOrCreate(['key' => $key], [
                'label' => $attributes['label'],
                'description' => $attributes['description'],
                'category' => 'content',
            ]);
        }
        $newKeys = array_keys(self::GRANTS);

        $managerialKeys = [
            'content.edit',
            'content.approve',
            'content.publish',
            'content.delete',
            'content.create',
            'settings.manage',
        ];
        $managerialIds = Permission::query()->whereIn('key', $managerialKeys)->pluck('id')->all();
        if ($managerialIds === []) {
            return;
        }

        $roleIds = DB::table('permission_role')->whereIn('permission_id', $managerialIds)->pluck('role_id')->unique()->all();
        if ($roleIds === []) {
            return;
        }

        $newIds = Permission::query()->whereIn('key', $newKeys)->pluck('id')->all();
        $rows = [];
        foreach ($newIds as $newId) {
            foreach ($roleIds as $roleId) {
                $rows[] = ['permission_id' => $newId, 'role_id' => $roleId];
            }
        }
        DB::table('permission_role')->insertOrIgnore($rows);

        // The admin role is seeded with "*" on a fresh install, but an existing
        // installation stores the resolved list, so keep it explicit as well.
        Role::query()->where('key', 'admin')->each(function (Role $role) use ($permission): void {
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        });
    }

    public function down(): void
    {
        $permission = Permission::query()->where('key', self::KEY)->first();
        if (! $permission) {
            return;
        }
        DB::table('permission_role')->whereIn('permission_id', Permission::query()
            ->whereIn('key', array_keys(self::GRANTS))->pluck('id')->all())->delete();
        Permission::query()->whereIn('key', array_keys(self::GRANTS))->delete();
    }
};
