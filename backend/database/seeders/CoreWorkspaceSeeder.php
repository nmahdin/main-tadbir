<?php

namespace Database\Seeders;

use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Stage 03A demo/foundation seeder (opt-in, NOT part of DatabaseSeeder so
 * existing seed behavior is unchanged).
 *
 * Ensures every active user has their one default personal workspace.
 * Idempotent: re-running changes nothing.
 *
 *   php artisan db:seed --class=CoreWorkspaceSeeder
 */
class CoreWorkspaceSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            $provisioner = app(PersonalWorkspaceProvisioner::class);

            User::query()
                ->where('status', 'active')
                ->each(fn (User $user) => $provisioner->ensureDefault($user));
        });
    }
}
