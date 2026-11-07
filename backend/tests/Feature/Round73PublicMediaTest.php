<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\SystemSetting;
use App\Models\User;
use App\Support\Media\PublicMedia;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * دور ۷۳: عکس پروفایل و لوگو/فاوآیکون باید واقعاً لود شوند.
 *
 * ریشهٔ خرابی این بود که مسیر ذخیره‌شده `/storage/...` به لینک نمادین
 * `public/storage` وابسته است؛ روی هاست اشتراکی بدون SSH این لینک ساخته
 * نمی‌شود و مرورگر همهٔ تصویرها را ۴۰۴ می‌گرفت. اکنون سرور خودش فایل‌های
 * عمومی را از `/api/v1/media/...` سرو می‌کند و در پاسخ‌ها نشانی مطلق می‌دهد.
 */
class Round73PublicMediaTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    /** یک PNG واقعی و کوچک تا نوع محتوا هم بررسی شود. */
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    public function test_public_media_is_served_by_the_app_without_a_storage_symlink(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('avatars/photo.png', base64_decode(self::PNG));
        Storage::disk('public')->put('brand/logo.png', base64_decode(self::PNG));
        Storage::disk('public')->put('private/secret.txt', 'top secret');

        $this->get('/api/v1/media/avatars/photo.png')->assertOk()
            ->assertHeader('content-type', 'image/png')
            ->assertHeader('x-content-type-options', 'nosniff');
        $this->get('/api/v1/media/brand/logo.png')->assertOk();
        // فقط دو پوشهٔ عمومی مجازند و پیمایش مسیر کار نمی‌کند.
        $this->get('/api/v1/media/private/secret.txt')->assertNotFound();
        $this->get('/api/v1/media/avatars/missing.png')->assertNotFound();
        $this->get('/api/v1/media/avatars/..%2F..%2F.env')->assertNotFound();
        $this->get('/api/v1/media/brand/evil.php')->assertNotFound();
    }

    public function test_stored_paths_and_browser_urls_convert_both_ways(): void
    {
        // ذخیره‌سازی همیشه کانونیک می‌ماند، هر شکلی که پنل بفرستد.
        $this->assertSame('/storage/avatars/a.png', PublicMedia::storedPath('/api/v1/media/avatars/a.png'));
        $this->assertSame('/storage/brand/logo.png', PublicMedia::storedPath('https://api.example.test/storage/brand/logo.png'));
        $this->assertSame('/storage/avatars/a.png', PublicMedia::storedPath('/storage/avatars/a.png'));
        $this->assertSame('', PublicMedia::storedPath(''));

        // نشانی مرورگر همیشه مطلق و روی مسیر خودِ اپلیکیشن است.
        $url = PublicMedia::url('/storage/avatars/a.png');
        $this->assertMatchesRegularExpression('#^https?://[^/]+/api/v1/media/avatars/a\.png$#', $url);
        $this->assertSame('', PublicMedia::url(null));
    }

    public function test_user_resource_and_directory_expose_absolute_avatar_urls(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('avatars/u.png', base64_decode(self::PNG));

        $this->seed([PermissionSeeder::class, RoleSeeder::class]);
        $admin = $this->account('admin');
        $user = $this->account('team_member', ['avatar' => '/storage/avatars/u.png']);
        Sanctum::actingAs($admin);

        $directory = $this->getJson('/api/v1/users/directory')->assertOk()->json('data');
        $row = collect($directory)->firstWhere('id', (string) $user->id);
        $this->assertNotNull($row, 'the directory must list the active user');
        $this->assertMatchesRegularExpression('#/api/v1/media/avatars/u\.png$#', (string) $row['avatar']);
        // همان نشانی مطلق وقتی از پنل برمی‌گردد باید دوباره کانونیک ذخیره شود.
        $this->putJson('/api/v1/users/'.$user->id, ['avatar' => $row['avatar']])->assertOk();
        $this->assertSame('/storage/avatars/u.png', $user->fresh()->avatar);
    }

    public function test_general_settings_return_absolute_branding_urls_and_store_them_back(): void
    {
        $this->seed([PermissionSeeder::class, RoleSeeder::class]);
        SystemSetting::query()->create([
            'key' => 'general',
            'value' => [
                'orgName' => 'سازمان نمونه',
                'logoUrl' => '/storage/brand/logo.png',
                'faviconUrl' => '/storage/brand/fav.png',
            ],
        ]);
        Sanctum::actingAs($this->account('admin'));

        $logo = $this->getJson('/api/v1/settings/general')->assertOk()->json('data.value.logoUrl');
        $favicon = $this->getJson('/api/v1/public/identity')->assertOk()->json('data.faviconUrl');
        $this->assertMatchesRegularExpression('#/api/v1/media/brand/logo\.png$#', (string) $logo);
        $this->assertMatchesRegularExpression('#/api/v1/media/brand/fav\.png$#', (string) $favicon);

        // پنل همان نشانی مطلق را دوباره ذخیره می‌کند و نباید ۴۲۲ بگیرد.
        $this->putJson('/api/v1/settings/general', ['value' => [
            'orgName' => 'سازمان نمونه', 'logoUrl' => $logo, 'faviconUrl' => $favicon,
        ]])->assertOk();
        $stored = SystemSetting::query()->where('key', 'general')->firstOrFail()->value;
        $this->assertSame('/storage/brand/logo.png', $stored['logoUrl']);
        $this->assertSame('/storage/brand/fav.png', $stored['faviconUrl']);
    }

    private function account(string $role, array $attributes = []): User
    {
        return User::factory()->create([
            'role_id' => Role::where('key', $role)->firstOrFail()->id,
            'role_key' => $role,
            'status' => 'active',
            'password' => 'Test1234',
            ...$attributes,
        ]);
    }
}
