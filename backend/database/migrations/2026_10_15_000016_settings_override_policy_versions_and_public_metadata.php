<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Stage C7-2 transitions.
     *
     * 1) `core_setting_override_policies.version` — optimistic
     *    concurrency for policy writes (the C7-2 mutation service
     *    checks expected versions; starts at 1 like setting values).
     *
     * 2) Legacy Organization public-metadata transition (C6 → C7):
     *    copies `organizations.settings.public.description` and
     *    `.logo_url` into canonical `core_setting_values` rows
     *    (owner: organization) WHERE NO canonical row exists yet.
     *    Deterministic precedence: an existing canonical row always
     *    wins; the legacy JSON is left fully intact (non-destructive,
     *    backward-compatible reads continue via the resolver /
     *    presenter fallback). The copy is idempotent — re-running
     *    changes nothing — and organizations without public metadata
     *    get no rows (absence is preserved, nothing is invented).
     *    Definitions must exist (FK), so the copy runs only for keys
     *    already synchronized into core_setting_definitions; on a
     *    fresh database the registry synchronization (an explicit
     *    C7-1 action) defines them and any legacy values are picked
     *    up by the read fallback until an operator re-runs this
     *    copy via the C7-2 service tooling. Private settings are
     *    never copied — only the two approved public keys.
     *
     * After this migration the canonical store is the ONLY writable
     * source for these keys (C7-2 service); legacy JSON is frozen
     * read-fallback. down() drops only the version column — copied
     * values are user data and are never deleted by a rollback.
     */
    public function up(): void
    {
        // Optimistic-concurrency version for policy rows (C7-2);
        // guarded so an operator re-run stays idempotent.
        if (! Schema::hasColumn('core_setting_override_policies', 'version')) {
            Schema::table('core_setting_override_policies', function (Blueprint $table) {
                $table->unsignedInteger('version')->default(1);
            });
        }

        $keys = [
            'organization.public.description' => 'description',
            'organization.public.logo_url' => 'logo_url',
        ];

        $knownDefinitions = DB::table('core_setting_definitions')
            ->whereIn('key', array_keys($keys))
            ->pluck('key')
            ->all();

        foreach ($keys as $settingKey => $legacyField) {
            if (! in_array($settingKey, $knownDefinitions, true)) {
                continue;
            }

            DB::table('organizations')->orderBy('id')->chunkById(200, function ($organizations) use ($settingKey, $legacyField): void {
                foreach ($organizations as $organization) {
                    $settings = is_string($organization->settings)
                        ? json_decode($organization->settings, true)
                        : $organization->settings;
                    $value = is_array($settings) ? ($settings['public'][$legacyField] ?? null) : null;

                    if (! is_string($value) || trim($value) === '') {
                        continue;
                    }

                    $exists = DB::table('core_setting_values')
                        ->where('owner_type', 'organization')
                        ->where('owner_id', $organization->id)
                        ->where('setting_key', $settingKey)
                        ->exists();

                    if ($exists) {
                        continue;
                    }

                    DB::table('core_setting_values')->insert([
                        'setting_key' => $settingKey,
                        'owner_type' => 'organization',
                        'owner_id' => $organization->id,
                        'value_json' => (string) json_encode($value, JSON_UNESCAPED_SLASHES),
                        'version' => 1,
                        'updated_by_user_id' => null,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            });
        }
    }

    public function down(): void
    {
        // Drops only the column this migration added. Copied
        // canonical values are user data and are never deleted by a
        // rollback (the legacy JSON is intact, reads keep working).
        if (Schema::hasColumn('core_setting_override_policies', 'version')) {
            Schema::table('core_setting_override_policies', function (Blueprint $table) {
                $table->dropColumn('version');
            });
        }
    }
};
