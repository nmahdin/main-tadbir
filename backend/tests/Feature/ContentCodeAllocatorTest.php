<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SystemSetting;
use App\Models\User;
use App\Support\Content\ContentCodeAllocator;
use App\Support\Content\ContentCodePolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentCodeAllocatorTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(): User
    {
        $role = Role::create(['key' => 'codes', 'name' => 'Codes', 'is_active' => true]);
        foreach (['content.view', 'content.create', 'content.edit', 'content.workflow.manage', 'tasks.view'] as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function content(array $payload = [], array $attributes = []): Content
    {
        return Content::create([
            'title' => 'Coded', 'type' => 'article', 'status' => 'planning',
            'payload' => $payload, ...$attributes,
        ]);
    }

    public function test_normalization_is_strict_and_stable(): void
    {
        $this->assertSame('KM141', ContentCodePolicy::normalize('km 141'));
        $this->assertSame('KM-141.1', ContentCodePolicy::normalize('km-141.1'));
        $this->assertSame('A', ContentCodePolicy::normalize(' a '));
        $this->assertNull(ContentCodePolicy::normalize('km/141'));
        $this->assertNull(ContentCodePolicy::normalize(''));
        $this->assertNull(ContentCodePolicy::normalize(str_repeat('K', ContentCodePolicy::MAX_LENGTH + 1)));
        $this->assertFalse(ContentCodePolicy::isValid('km/141'));
        $this->assertTrue(ContentCodePolicy::isValid('KM141'));
        $this->assertTrue(ContentCodePolicy::isValid('km 141'));
    }

    public function test_no_prefix_is_hardcoded_into_the_policy(): void
    {
        $source = file_get_contents((new \ReflectionClass(ContentCodePolicy::class))->getFileName());
        $this->assertIsString($source);
        foreach (['KM', 'RV', 'SA'] as $prefix) {
            $this->assertStringNotContainsString("'".$prefix."'", $source);
        }
    }

    public function test_prefix_comes_from_configuration_and_series_before_the_content_type(): void
    {
        $content = $this->content();
        // Nothing configured: the prefix is derived from the content type.
        $this->assertSame('AR', ContentCodePolicy::prefixFor($content));
        $this->assertSame('CR', ContentCodePolicy::prefixFor($this->content([], ['type' => 'Conference Report'])));
        $this->assertSame('KM', ContentCodePolicy::prefixFor($this->content([], ['type' => 'knowledge management'])));
        $this->assertSame('RV', ContentCodePolicy::prefixFor($this->content([], ['type' => 'report video'])));

        SystemSetting::create(['key' => ContentCodePolicy::SETTING_KEY, 'value' => [
            ['scope' => 'content_type', 'matchId' => 'article', 'prefix' => 'km', 'padding' => 3],
        ]]);
        $this->assertSame('KM', ContentCodePolicy::prefixFor($content));
        $this->assertSame(3, ContentCodePolicy::paddingFor('KM'));
        $this->assertSame('RE', ContentCodePolicy::prefixFor($this->content([], ['type' => 'report'])));

        // An explicit series code wins over every configured policy.
        $this->assertSame('RV', ContentCodePolicy::prefixFor($this->content(['seriesCode' => 'rv130'])));
    }

    public function test_sequence_is_the_highest_existing_suffix_for_that_prefix(): void
    {
        $this->assertNull(ContentCodePolicy::lastSequence('AR'));
        foreach (['AR141', 'AR142', 'AR99', 'KM7'] as $code) {
            $this->content([], ['code' => $code]);
        }
        $this->assertSame(142, ContentCodePolicy::lastSequence('AR'));
        $this->assertSame(7, ContentCodePolicy::lastSequence('KM'));
        $this->assertNull(ContentCodePolicy::lastSequence('ZZ'));
    }

    public function test_allocation_is_sequential_stable_and_collision_safe(): void
    {
        $this->actor();
        $first = $this->content();
        $this->assertSame('AR001', app(ContentCodeAllocator::class)->assign($first, null));
        $second = $this->content();
        $this->assertSame('AR002', app(ContentCodeAllocator::class)->assign($second, null));
        $third = $this->content();
        $this->assertSame('AR003', app(ContentCodeAllocator::class)->assign($third, null));

        // An explicitly requested free code is kept verbatim.
        $explicit = $this->content();
        $this->assertSame('SA03', app(ContentCodeAllocator::class)->assign($explicit, 'sa03'));
        // A requested code that already exists is never overwritten; a new one is issued.
        $clash = $this->content();
        $this->assertSame('AR004', app(ContentCodeAllocator::class)->assign($clash, 'SA03'));
        // Re-running on an already coded content is a no-op.
        $this->assertSame('AR004', app(ContentCodeAllocator::class)->assign($clash, 'SA03'));
    }

    public function test_codes_are_unique_across_archived_contents_too(): void
    {
        $this->actor();
        $this->content([], ['code' => 'SA03', 'status' => 'archived']);
        $fresh = $this->content();
        $this->assertNotSame('SA03', app(ContentCodeAllocator::class)->allocateFor($fresh));
    }

    public function test_the_backfill_command_is_idempotent(): void
    {
        $this->actor();
        $blank = $this->content();
        $this->assertSame(0, Artisan::call('contents:allocate-codes'));
        $this->assertSame('AR001', $blank->fresh()->code);
        $this->assertStringContainsString('Content codes allocated: 1.', Artisan::output());
        $this->assertSame(0, Artisan::call('contents:allocate-codes'));
        $this->assertStringContainsString('Content codes allocated: 0.', Artisan::output());
    }

    public function test_backfill_only_touches_contents_without_a_code(): void
    {
        $this->actor();
        $coded = $this->content([], ['code' => 'AR001']);
        $blank = $this->content(['code' => '']);
        $null = $this->content();

        $filled = app(ContentCodeAllocator::class)->backfillMissing();
        $this->assertSame(2, $filled);
        $this->assertSame(0, app(ContentCodeAllocator::class)->backfillMissing());
        $this->assertSame('AR001', $coded->fresh()->code);
        $this->assertSame('AR002', $blank->fresh()->code);
        $this->assertSame('AR003', $null->fresh()->code);
    }
}
