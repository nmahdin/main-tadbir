<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * UX-02-3: list column visibility persists as the actor's own
 * presentation-only C7 preference (user.experience.list_columns),
 * is scoped to the owner, and never widens what the API returns.
 */
class ListColumnPreferenceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Definitions persist to the registry tables (C7-1 contract).
        app(\App\Core\Settings\SettingsRegistrySynchronizer::class)
            ->sync(app(\App\Core\Settings\SettingsRegistry::class));
    }

    public function test_column_preferences_round_trip_per_user(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        Sanctum::actingAs($user);

        $value = json_encode(['projects' => ['status', 'priority', 'deadline']]);
        $this->putJson('/api/v1/core/preferences/user.experience.list_columns', ['value' => $value])
            ->assertOk()
            ->assertJsonPath('data.key', 'user.experience.list_columns');

        $list = $this->getJson('/api/v1/core/preferences')->assertOk();
        $item = collect($list->json('data'))->firstWhere('definition.key', 'user.experience.list_columns');
        $this->assertNotNull($item, 'preference must be listed for its owner');
        $this->assertSame($value, $item['effective']['value']);

        Sanctum::actingAs($other);
        $otherList = $this->getJson('/api/v1/core/preferences')->assertOk();
        $otherItem = collect($otherList->json('data'))->firstWhere('definition.key', 'user.experience.list_columns');
        $this->assertNotNull($otherItem);
        $this->assertNull($otherItem['effective']['value'], 'another user must not inherit the preference');
    }

    public function test_unknown_preference_keys_stay_rejected_for_guests_and_bad_keys(): void
    {
        $this->putJson('/api/v1/core/preferences/user.experience.list_columns', ['value' => '{}'])
            ->assertUnauthorized();

        $user = User::factory()->create();
        Sanctum::actingAs($user);
        // Non-presentation scopes remain unwritable as preferences.
        $this->putJson('/api/v1/core/preferences/display.locale', ['value' => 'en'])
            ->assertStatus(422);
    }
}
