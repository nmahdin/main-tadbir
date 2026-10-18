<?php

namespace Tests\Feature\Core;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage C7-4 — scoped settings HTTP surface: registry-driven
 * lists with effective/source metadata, authorized versioned
 * writes, override policies, inheritance, pagination/restore,
 * stable errors, and the C6 public-metadata regression. Every
 * mutation flows through the C7-2 service; these tests pin the
 * HTTP contract only.
 */
class ScopedSettingsApiTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private Organization $org;

    private Workspace $workspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        PermissionCatalog::sync();
        app(SettingsRegistrySynchronizer::class)->sync(app(SettingsRegistry::class));
        Mail::fake();

        $this->manager = User::factory()->create(['username' => 'api_manager', 'status' => 'active']);
        $this->org = app(OrganizationProvisioner::class)->create($this->manager, 'API Org');
        $this->workspace = $this->org->workspaces()->where('is_default', true)->firstOrFail();
    }

    public function test_organization_list_is_registry_driven_with_effective_sources(): void
    {
        Sanctum::actingAs($this->manager);

        $response = $this->getJson("/api/v1/core/organizations/{$this->org->id}/settings")->assertOk();
        $keys = array_column($response->json('data'), 'definition.key');
        $this->assertContains('organization.public.description', $keys);
        $this->assertContains('display.locale', $keys);
        $this->assertContains('display.timezone', $keys);
        // Secret definitions never appear in the value surface and
        // user-only keys are not organization settings.
        $this->assertNotContains('user.experience.locale', $keys);

        $locale = $this->item($response->json('data'), 'display.locale');
        $this->assertSame('fa', $locale['effective']['value']);
        $this->assertSame('default', $locale['effective']['source']);
        $this->assertFalse($locale['explicit']['exists']);
        $this->assertFalse($locale['override_policy']['allow'], 'workspace overrides are default-deny');
    }

    public function test_organization_write_versions_conflicts_and_immediate_inheritance(): void
    {
        Sanctum::actingAs($this->manager);

        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/display.locale", ['value' => 'en', 'expected_version' => 0])
            ->assertOk()
            ->assertJsonPath('data.explicit.version', 1)
            ->assertJsonPath('data.effective.value', 'en')
            ->assertJsonPath('data.effective.source', 'organization');

        // Stale expected version: stable conflict, nothing written.
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/display.locale", ['value' => 'fa', 'expected_version' => 0])
            ->assertStatus(409)->assertJsonPath('code', 'setting_version_conflict');

        // The workspace list immediately inherits the organization value.
        $workspaceList = $this->getJson("/api/v1/core/workspaces/{$this->workspace->id}/settings")->assertOk();
        $item = $this->item($workspaceList->json('data'), 'display.locale');
        $this->assertSame('en', $item['effective']['value']);
        $this->assertSame('organization', $item['effective']['source']);
        $this->assertFalse($item['explicit']['exists']);
    }

    public function test_workspace_override_requires_policy_and_reset_restores_inheritance(): void
    {
        Sanctum::actingAs($this->manager);
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/display.locale", ['value' => 'en', 'expected_version' => 0])->assertOk();

        // Policy default-deny: workspace override is refused.
        $this->putJson("/api/v1/core/workspaces/{$this->workspace->id}/settings/display.locale", ['value' => 'fa', 'expected_version' => 0])
            ->assertStatus(409)->assertJsonPath('code', 'setting_override_denied');

        // Allow the override, then the workspace value wins locally.
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/display.locale/policy", ['allow' => true, 'expected_version' => 0])
            ->assertOk()->assertJsonPath('data.override_policy.allow', true);
        $this->putJson("/api/v1/core/workspaces/{$this->workspace->id}/settings/display.locale", ['value' => 'fa', 'expected_version' => 0])
            ->assertOk()
            ->assertJsonPath('data.effective.value', 'fa')
            ->assertJsonPath('data.effective.source', 'workspace');

        // Policy can forbid again without deleting the stored row…
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/display.locale/policy", ['allow' => false, 'expected_version' => 1])->assertOk();
        $list = $this->getJson("/api/v1/core/workspaces/{$this->workspace->id}/settings")->assertOk();
        $item = $this->item($list->json('data'), 'display.locale');
        $this->assertSame('en', $item['effective']['value'], 'forbidden override is ignored, not deleted');
        $this->assertTrue($item['explicit']['exists']);

        // …and reset-to-inherited removes the explicit workspace row.
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/display.locale/policy", ['allow' => true, 'expected_version' => 2])->assertOk();
        $this->deleteJson("/api/v1/core/workspaces/{$this->workspace->id}/settings/display.locale", ['expected_version' => 1])
            ->assertOk()
            ->assertJsonPath('data.effective.value', 'en')
            ->assertJsonPath('data.effective.source', 'organization');
        $list = $this->getJson("/api/v1/core/workspaces/{$this->workspace->id}/settings")->assertOk();
        $this->assertFalse($this->item($list->json('data'), 'display.locale')['explicit']['exists']);
    }

    public function test_explicit_null_is_distinct_from_absent_and_hides_legacy_public_metadata(): void
    {
        // Legacy public metadata exists in the frozen JSON source.
        $this->org->forceFill(['settings' => ['public' => ['description' => 'Legacy public text']]])->save();
        Sanctum::actingAs($this->manager);

        // Absent canonical value: the effective value IS the legacy one.
        $list = $this->getJson("/api/v1/core/organizations/{$this->org->id}/settings")->assertOk();
        $item = $this->item($list->json('data'), 'organization.public.description');
        $this->assertSame('Legacy public text', $item['effective']['value']);
        $this->assertTrue($item['effective']['legacy']);

        // Explicit canonical null: stored presence, legacy suppressed.
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/organization.public.description", ['value' => null, 'expected_version' => 0])
            ->assertOk()
            ->assertJsonPath('data.explicit.exists', true)
            ->assertJsonPath('data.explicit.value', null);
        $list = $this->getJson("/api/v1/core/organizations/{$this->org->id}/settings")->assertOk();
        $item = $this->item($list->json('data'), 'organization.public.description');
        $this->assertSame(null, $item['effective']['value']);
        $this->assertFalse($item['effective']['legacy']);

        // Removing the canonical row exposes the legacy value again.
        $this->deleteJson("/api/v1/core/organizations/{$this->org->id}/settings/organization.public.description", ['expected_version' => 1])
            ->assertOk()->assertJsonPath('data.effective.value', 'Legacy public text');
    }

    public function test_user_preferences_are_self_only_and_presentation_scoped(): void
    {
        Sanctum::actingAs($this->manager);
        $list = $this->getJson('/api/v1/core/preferences')->assertOk();
        $keys = array_column($list->json('data'), 'definition.key');
        $this->assertSame(['user.experience.locale', 'user.experience.timezone'], $keys);

        $this->putJson('/api/v1/core/preferences/user.experience.locale', ['value' => 'en', 'expected_version' => 0])
            ->assertOk()->assertJsonPath('data.effective.source', 'user');

        // Organization/workspace keys are not writable as preferences.
        $this->putJson('/api/v1/core/preferences/display.locale', ['value' => 'en'])
            ->assertStatus(422);

        // Another user's preferences are independent.
        $other = User::factory()->create(['username' => 'api_other_pref', 'status' => 'active']);
        Auth::forgetGuards();
        Sanctum::actingAs($other);
        $list = $this->getJson('/api/v1/core/preferences')->assertOk();
        $this->assertSame('fa', $this->item($list->json('data'), 'user.experience.locale')['effective']['value']);
    }

    public function test_cross_scope_and_unauthorized_access_is_denied(): void
    {
        // Outsider: no membership anywhere.
        $outsider = User::factory()->create(['username' => 'api_outsider', 'status' => 'active']);
        Sanctum::actingAs($outsider);
        $this->getJson("/api/v1/core/organizations/{$this->org->id}/settings")->assertForbidden();
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/display.locale", ['value' => 'en'])->assertForbidden();
        $this->getJson("/api/v1/core/workspaces/{$this->workspace->id}/settings")->assertForbidden();
        // Secrets denial with registered secret keys is covered by ScopedSettingsSecretsApiTest.

        // Plain organization member: may not manage settings.
        $memberRole = app(RoleProvisioner::class)->organizationMember($this->org);
        $member = User::factory()->create(['username' => 'api_member', 'status' => 'active']);
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $member->id, 'role_id' => $memberRole->id, 'status' => MembershipStatus::Active]);
        Auth::forgetGuards();
        Sanctum::actingAs($member);
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/display.locale", ['value' => 'en'])
            ->assertForbidden()->assertJsonPath('code', 'setting_forbidden');

        // Missing scope ids are a plain 404; unknown keys a stable 404 code.
        Auth::forgetGuards();
        Sanctum::actingAs($this->manager);
        $this->getJson('/api/v1/core/organizations/999999/settings')->assertNotFound();
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/unknown.key", ['value' => 'x'])
            ->assertNotFound()->assertJsonPath('code', 'setting_not_found');
        $this->getJson('/api/v1/core/organizations/' . $this->org->id . '/settings')->assertOk()
            ->assertJsonMissingPath('data.0.explicit.ciphertext');
    }

    public function test_validation_errors_are_stable_and_value_free(): void
    {
        Sanctum::actingAs($this->manager);
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/display.locale", ['value' => 'de', 'expected_version' => 0])
            ->assertStatus(422)->assertJsonPath('code', 'setting_locale_invalid');
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/display.timezone", ['value' => 'Not/AZone'])
            ->assertStatus(422)->assertJsonPath('code', 'setting_timezone_invalid');
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/display.locale", ['expected_version' => 0])
            ->assertStatus(422)->assertJsonPath('code', 'setting_value_required');
    }

    public function test_history_is_paginated_and_restore_is_a_new_versioned_write(): void
    {
        Sanctum::actingAs($this->manager);
        $url = "/api/v1/core/organizations/{$this->org->id}/settings/display.locale";
        $this->putJson($url, ['value' => 'en', 'expected_version' => 0])->assertOk();
        $this->putJson($url, ['value' => 'fa', 'expected_version' => 1])->assertOk();
        $this->putJson($url, ['value' => 'en', 'expected_version' => 2])->assertOk();

        $history = $this->getJson("{$url}/history?per_page=2&page=1")->assertOk();
        $history->assertJsonPath('meta.total', 3)->assertJsonPath('meta.last_page', 2);
        $this->assertCount(2, $history->json('data'));
        $page2 = $this->getJson("{$url}/history?per_page=2&page=2")->assertOk();
        $this->assertCount(1, $page2->json('data'));

        $firstRevisionId = $page2->json('data.0.id'); // oldest: CREATE en (v1)
        $this->postJson("{$url}/history/{$firstRevisionId}/restore", ['expected_version' => 3])
            ->assertOk()->assertJsonPath('data.explicit.version', 4);
        $list = $this->getJson("/api/v1/core/organizations/{$this->org->id}/settings")->assertOk();
        $this->assertSame('en', $this->item($list->json('data'), 'display.locale')['effective']['value']);

        // Stale restore conflicts; foreign revision ids are not found.
        $this->postJson("{$url}/history/{$firstRevisionId}/restore", ['expected_version' => 3])
            ->assertStatus(409)->assertJsonPath('code', 'setting_version_conflict');
        $this->postJson("{$url}/history/999999/restore", [])
            ->assertStatus(404)->assertJsonPath('code', 'setting_revision_not_found');
    }

    public function test_suspended_organization_rejects_writes_but_preserves_values(): void
    {
        Sanctum::actingAs($this->manager);
        $url = "/api/v1/core/organizations/{$this->org->id}/settings/display.locale";
        $this->putJson($url, ['value' => 'en', 'expected_version' => 0])->assertOk();

        $this->org->forceFill(['status' => 'suspended'])->save();
        $this->putJson($url, ['value' => 'fa', 'expected_version' => 1])
            ->assertStatus(409)->assertJsonPath('code', 'setting_organization_unavailable');
        $this->putJson("/api/v1/core/workspaces/{$this->workspace->id}/settings/display.locale", ['value' => 'fa'])
            ->assertStatus(409);

        $this->org->forceFill(['status' => 'active'])->save();
        $list = $this->getJson("/api/v1/core/organizations/{$this->org->id}/settings")->assertOk();
        $this->assertSame('en', $this->item($list->json('data'), 'display.locale')['effective']['value'], 'value preserved through suspension');
    }

    public function test_canonical_write_is_what_invitation_preview_shows(): void
    {
        Sanctum::actingAs($this->manager);
        $memberRole = app(RoleProvisioner::class)->organizationMember($this->org);
        $issued = $this->postJson("/api/v1/core/organizations/{$this->org->id}/invitations", [
            'email' => 'preview@example.test',
            'organization_role_id' => $memberRole->id,
        ])->assertCreated();
        $token = $issued->json('data.invitation_token');

        $this->org->forceFill(['settings' => ['public' => ['description' => 'Legacy shown before']]])->save();
        $before = $this->postJson('/api/v1/invitations/preview', ['token' => $token])->assertOk();
        $this->assertSame('Legacy shown before', $before->json('data.organization.description'));

        // Canonical write through the C7 API: preview follows it.
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/organization.public.description", ['value' => 'Canonical public text', 'expected_version' => 0])->assertOk();
        $after = $this->postJson('/api/v1/invitations/preview', ['token' => $token])->assertOk();
        $after->assertJsonPath('data.organization.description', 'Canonical public text');
        // The public DTO stays allowlisted: no settings internals leak.
        $raw = $after->getContent();
        $this->assertStringNotContainsString('core_setting', $raw);
        $this->assertStringNotContainsString('legacy_source', $raw);

        // Explicit canonical null hides the public description entirely.
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/settings/organization.public.description", ['value' => null, 'expected_version' => 1])->assertOk();
        $hidden = $this->postJson('/api/v1/invitations/preview', ['token' => $token])->assertOk();
        $this->assertSame(null, $hidden->json('data.organization.description'));
    }

    /**
     * @param  list<array<string, mixed>>  $items
     * @return array<string, mixed>
     */
    private function item(array $items, string $key): array
    {
        foreach ($items as $item) {
            if (($item['definition']['key'] ?? null) === $key) {
                return $item;
            }
        }
        $this->fail("Setting [{$key}] missing from list payload.");
    }
}
