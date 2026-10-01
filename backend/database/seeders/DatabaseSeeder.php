<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/** Required access, initial accounts and safe default publication channels; no demo business records. */
class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        DB::transaction(function (): void {
            $this->call([
                PermissionSeeder::class,
                RoleSeeder::class,
                UserSeeder::class,
                PublishingPlatformSeeder::class,
            ]);
        });
    }
}
