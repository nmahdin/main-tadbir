<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * فیلتر «نوع فایل» و دانلود گروهی زیپ در مخزن دارایی‌ها.
 *
 * دو خواستهٔ کاربر: در فهرست دارایی‌ها بتوان «فقط عکس‌ها/فقط PDF‌ها» را دید، و
 * دارایی‌های انتخاب‌شده را یک‌جا به‌صورت زیپ گرفت. هر دو باید سمت سرور انجام
 * شوند، وگرنه فیلتر فقط همان صفحهٔ جاری را می‌بیند و زیپ هم به فایل‌های سمت
 * مرورگر دسترسی ندارد.
 */
class DamBulkDownloadAndFileKindTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(array $keys, string $roleKey = 'dam-kinds'): User
    {
        $role = Role::create(['key' => $roleKey, 'name' => $roleKey, 'color' => '#000000', 'is_system' => false, 'is_active' => true]);
        foreach ($keys as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'dam']);
            $role->permissions()->attach($permission);
        }
        $user = User::factory()->create(['role_id' => $role->id, 'role_key' => $roleKey]);
        Sanctum::actingAs($user);

        return $user;
    }

    /** فایل با محتوای واقعی؛ تا زیپ بایت قابل بررسی داشته باشد. */
    private function upload(string $name, string $mime, string $body): UploadedFile
    {
        $path = (string) tempnam(sys_get_temp_dir(), 'dam-zip');
        file_put_contents($path, $body);

        return new UploadedFile($path, $name, $mime, null, true);
    }

    private function asset(string $title, string $name, string $mime, string $body = 'hello'): int
    {
        return (int) $this->post('/api/v1/dam/library', [
            'title' => $title,
            'file' => $this->upload($name, $mime, $body),
        ])->assertCreated()->json('data.id');
    }

    public function test_file_kind_filter_returns_only_that_kind(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload']);

        // همهٔ کارها در try است تا خروجی CI (که فقط پیام خطا را نشان می‌دهد)
        // دقیقاً بگوید کدام مرحله و با چه پیامی شکست خورده است.
        try {
            // محتوای هر فایل یکتا است؛ محتوای یکسان یعنی چک‌سام یکسان و سرور
            // درست هم پاسخ ۴۰۹ (تکرار) می‌دهد، نه ۲۰۱.
            $image = $this->asset('تصویر نمونه', 'cover.png', 'image/png', 'png-bytes');
            $pdf = $this->asset('سند نمونه', 'report.pdf', 'application/pdf', 'pdf-bytes');
            $video = $this->asset('ویدیوی نمونه', 'clip.mp4', 'video/mp4', 'mp4-bytes');

            foreach (['image' => $image, 'pdf' => $pdf, 'video' => $video] as $kind => $expected) {
                $response = $this->getJson('/api/v1/dam/library?file_kind='.$kind);
                $ids = array_map('intval', array_column((array) $response->json('data'), 'id'));
                $this->assertSame(
                    [$expected],
                    $ids,
                    'kind='.$kind.' expected='.$expected.' got='.json_encode($ids).' status='.$response->status(),
                );
            }

            // دستهٔ نامعتبر پذیرفته نمی‌شود.
            $this->getJson('/api/v1/dam/library?file_kind=unknown')->assertUnprocessable();
        } catch (\Throwable $error) {
            $this->fail('file_kind test -> '.get_class($error).': '.$error->getMessage());
        }
    }

    public function test_bulk_download_returns_a_zip_with_every_selected_file(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload', 'assets.download']);

        $first = $this->asset('اولی', 'alpha.txt', 'text/plain', 'alpha-body');
        $second = $this->asset('دومی', 'beta.txt', 'text/plain', 'beta-body');

        $response = $this->post('/api/v1/dam/library/bulk/download', ['ids' => [$first, $second]])->assertOk();
        $this->assertStringContainsString('application/zip', (string) $response->headers->get('Content-Type'));

        $bytes = $response->streamedContent();
        $this->assertStringStartsWith("PK\x03\x04", $bytes);

        $zipPath = tempnam(sys_get_temp_dir(), 'dam-zip-out').'.zip';
        file_put_contents($zipPath, $bytes);

        if (class_exists(\ZipArchive::class)) {
            $zip = new \ZipArchive();
            $this->assertTrue($zip->open($zipPath) === true, 'زیپ ساخته‌شده باید باز شود.');
            $this->assertSame('alpha-body', $zip->getFromName('alpha.txt'));
            $this->assertSame('beta-body', $zip->getFromName('beta.txt'));
            $zip->close();
        }

        @unlink($zipPath);
    }

    public function test_bulk_download_rejects_when_nothing_is_downloadable(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload', 'assets.download']);

        // دارایی متنی (بدون فایل) چیزی برای گذاشتن در زیپ ندارد.
        $asset = (int) $this->postJson('/api/v1/dam/library', [
            'title' => 'یادداشت',
            'body' => 'متن نمونه',
        ])->assertCreated()->json('data.id');

        $this->post('/api/v1/dam/library/bulk/download', ['ids' => [$asset]])
            ->assertStatus(422);
    }

    public function test_bulk_download_requires_the_download_permission(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload', 'assets.download']);
        $asset = $this->asset('فایل', 'gamma.txt', 'text/plain', 'gamma');

        // کاربر بدون مجوز دانلود.
        $this->actor(['assets.view'], 'dam-kinds-no-download');

        $this->post('/api/v1/dam/library/bulk/download', ['ids' => [$asset]])->assertForbidden();
    }
}
