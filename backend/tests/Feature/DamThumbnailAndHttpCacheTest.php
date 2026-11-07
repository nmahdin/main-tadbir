<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Support\Media\DamThumbnail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * دور ۸۴ — بندانگشتی سبک مخزن و اعتبارسنجی کشِ پاسخ‌های JSON.
 *
 * پیش‌تر کارت‌های کوچک مخزن، فایل اصلی را دانلود می‌کردند (یک فهرست بیست‌ردیفی
 * از عکس موبایل می‌توانست ده‌ها مگابایت شود). حالا نسخهٔ کوچک با کش بلندمدت
 * سرو می‌شود. همچنین پاسخ‌های GET با ETag اعتبارسنجی می‌شوند تا درخواستِ
 * تکراریِ بدون تغییر، ۳۰۴ بدون بدنه بگیرد.
 */
class DamThumbnailAndHttpCacheTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    /**
     * کاربر آزمایشی با مجوزهای داده‌شده.
     *
     * هر فراخوانی نقش تازه‌ای می‌سازد: بعضی تست‌ها عمداً کاربر «کم‌مجوز» می‌خواهند
     * و اگر نقش مشترک باشد، مجوزهای کاربر قبلی به او ارث می‌رسد.
     */
    private function actor(array $keys, ?string $roleKey = null): User
    {
        $roleKey ??= 'media-'.substr(md5(uniqid('', true)), 0, 10);

        $role = Role::firstOrCreate(
            ['key' => $roleKey],
            ['name' => $roleKey, 'color' => '#000000', 'is_system' => false, 'is_active' => true],
        );
        foreach ($keys as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'dam']);
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }
        $role->unsetRelation('permissions');
        $user = User::factory()->create(['role_id' => $role->id, 'role_key' => $roleKey]);
        Sanctum::actingAs($user);

        return $user;
    }

    /** کوچک‌ترین PNG معتبر (۱×۱) — بدون نیاز به افزونهٔ تصویری ساخته می‌شود. */
    private function pngUpload(string $name = 'photo.png'): UploadedFile
    {
        $bytes = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
        $path = (string) tempnam(sys_get_temp_dir(), 'dam-image');
        file_put_contents($path, $bytes);

        return new UploadedFile($path, $name, 'image/png', null, true);
    }

    private function imageAsset(string $confidentiality = 'public'): string
    {
        Storage::fake('local');
        Storage::fake('public');
        $this->actor(['assets.view', 'assets.upload', 'assets.preview']);

        return (string) $this->post('/api/v1/dam/library', [
            'title' => 'تصویر نمونه',
            'confidentiality' => $confidentiality,
            'file' => $this->pngUpload(),
        ])->assertCreated()->json('data.id');
    }

    public function test_thumbnail_route_exists_and_is_guarded_by_preview_permission(): void
    {
        $id = $this->imageAsset();

        // بدون مجوز پیش‌نمایش، حتی بندانگشتی هم سرو نمی‌شود.
        $this->actor(['assets.view']);
        $this->get('/api/v1/dam/library/'.$id.'/thumbnail')->assertForbidden();
    }

    public function test_thumbnail_rejects_files_that_are_not_images(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload', 'assets.preview']);
        $id = $this->post('/api/v1/dam/library', [
            'title' => 'سند',
            'file' => UploadedFile::fake()->create('report.pdf', 12, 'application/pdf'),
        ])->assertCreated()->json('data.id');

        $this->get('/api/v1/dam/library/'.$id.'/thumbnail')->assertStatus(415);
    }

    public function test_thumbnail_returns_a_cacheable_small_image(): void
    {
        $id = $this->imageAsset();

        $response = $this->get('/api/v1/dam/library/'.$id.'/thumbnail?w=160');
        $response->assertOk();
        $this->assertStringStartsWith('image/', (string) $response->headers->get('Content-Type'));
        // کش اختصاصی و بلندمدت: مرورگر آن را دوباره نمی‌گیرد.
        $this->assertStringContainsString('private', (string) $response->headers->get('Cache-Control'));
        $this->assertStringContainsString('max-age=604800', (string) $response->headers->get('Cache-Control'));
        $this->assertNotEmpty($response->headers->get('ETag'));

        // درخواست تکراری با همان ETag: ۳۰۴ بدون بدنه.
        $again = $this->get('/api/v1/dam/library/'.$id.'/thumbnail?w=160', [
            'If-None-Match' => (string) $response->headers->get('ETag'),
        ]);
        $again->assertStatus(304);
        $this->assertSame('', $again->getContent());
    }

    public function test_thumbnail_width_is_limited_to_known_sizes(): void
    {
        $thumbnails = new DamThumbnail();

        // مقدار دلخواه به پیش‌فرض تبدیل می‌شود تا کش با اندازه‌های بی‌نهایت پر نشود.
        $this->assertSame(160, $thumbnails->width('160'));
        $this->assertSame(DamThumbnail::DEFAULT_WIDTH, $thumbnails->width('9999'));
        $this->assertSame(DamThumbnail::DEFAULT_WIDTH, $thumbnails->width(null));
    }

    public function test_json_get_responses_are_revalidated_with_an_etag(): void
    {
        $this->actor(['assets.view']);

        $first = $this->get('/api/v1/dam/library?per_page=5');
        $first->assertOk();
        $etag = (string) $first->headers->get('ETag');
        $this->assertNotEmpty($etag, 'پاسخ فهرست باید ETag داشته باشد.');
        $this->assertStringContainsString('private', (string) $first->headers->get('Cache-Control'));

        // همان داده: پاسخ ۳۰۴ بدون بدنه، یعنی صفر بایت محتوا.
        $second = $this->get('/api/v1/dam/library?per_page=5', ['If-None-Match' => $etag]);
        $second->assertStatus(304);
        $this->assertSame('', $second->getContent());
        $this->assertSame($etag, $second->headers->get('ETag'));

        // ETag نامربوط نباید ۳۰۴ بدهد؛ بدنهٔ کامل برمی‌گردد.
        $third = $this->get('/api/v1/dam/library?per_page=5', ['If-None-Match' => '"stale"']);
        $third->assertOk();
        $this->assertNotSame('', (string) $third->getContent());
    }
}
