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
                $prefix = 'SEED_'.strtoupper($definition['config']);
                // An optional EMAIL entry left blank in .env is equivalent to an unset entry.
                $email = $settings['email'] ?? null;
                if ($email === null || (is_string($email) && trim($email) === '')) {
                    $settings['email'] = $username.'@users.invalid';
                }
                $validator = Validator::make($settings, [
                    'email' => ['required', 'string', 'email:rfc', 'max:255', 'unique:users,email'],
                    'password' => ['required', 'string', 'min:12'],
                ], [
                    'password.required' => $prefix.'_PASSWORD تنظیم نشده یا خالی است؛ آن را در backend/.env تنظیم کنید.',
                    'password.string' => $prefix.'_PASSWORD باید یک مقدار متنی باشد.',
                    'password.min' => $prefix.'_PASSWORD باید حداقل :min نویسه داشته باشد.',
                    'email.required' => $prefix.'_EMAIL تنظیم نشده است.',
                    'email.string' => $prefix.'_EMAIL باید یک مقدار متنی باشد.',
                    'email.email' => $prefix.'_EMAIL قالب معتبر ایمیل ندارد.',
                    'email.max' => $prefix.'_EMAIL نباید بیشتر از :max نویسه باشد.',
                    'email.unique' => $prefix.'_EMAIL متعلق به حساب دیگری است؛ ایمیل متفاوتی انتخاب کنید.',
                ]);
                $errors = $validator->errors()->all();
                // bcrypt supports at most 72 bytes; never include the supplied value in errors/logs.
                if (is_string($settings['password'] ?? null) && strlen($settings['password']) > 72) {
                    $errors[] = $prefix.'_PASSWORD نباید بیشتر از ۷۲ بایت باشد؛ حروف فارسی ممکن است چندبایتی باشند.';
                }
                if ($errors !== []) {
                    throw new RuntimeException(
                        'تنظیمات حساب '.$username.":\n- ".implode("\n- ", $errors).
                        "\nپس از اصلاح تنظیمات، در پوشهٔ backend دستور php artisan config:clear و سپس php artisan db:seed را اجرا کنید. راهنما: docs/seeders.md"
                    );
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
