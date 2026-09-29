<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use RuntimeException;

/** Initial accounts only; rerunning must not reset a password or take over an existing account. */
class UserSeeder extends Seeder
{
    public const USERS = [
        'mahdi.nabavi' => ['name' => 'مهدی نبوی', 'role' => 'admin', 'config' => 'mahdi'],
        'emad.hendi' => ['name' => 'عماد هندی', 'role' => 'team_member', 'config' => 'emad'],
        'amirali.shirazi' => ['name' => 'امیرعلی شیرازی', 'role' => 'team_member', 'config' => 'amirali'],
    ];

    public function run(): void
    {
        DB::transaction(function (): void {
            foreach (self::USERS as $username => $definition) {
                if (User::where('username', $username)->exists()) {
                    continue;
                }

                $role = Role::where('key', $definition['role'])->first();
                if (! $role || ! $role->is_active) {
                    throw new RuntimeException('نقش فعال موردنیاز حساب اولیه موجود نیست؛ ابتدا RoleSeeder و تنظیمات نقش را بررسی کنید.');
                }

                $settings = config('seed_users.'.$definition['config'], []);
                $validator = Validator::make($settings, [
                    'email' => ['required', 'string', 'email:rfc', 'max:255', 'unique:users,email'],
                    'password' => ['required', 'string', 'min:12'],
                ]);
                // bcrypt supports at most 72 bytes; never include the supplied value in errors/logs.
                if ($validator->fails() || strlen((string) ($settings['password'] ?? '')) > 72) {
                    throw new RuntimeException('تنظیمات امن حساب '.$username.' ناقص یا نامعتبر است؛ راهنمای docs/seeders.md را بررسی کنید.');
                }

                User::create([
                    'username' => $username,
                    'name' => $definition['name'],
                    'email' => $settings['email'],
                    'password' => $settings['password'], // User's hashed cast owns password hashing.
                    'role_id' => $role->id,
                    'role_key' => $role->key,
                    'status' => 'active',
                ]);
            }
        });
    }
}
