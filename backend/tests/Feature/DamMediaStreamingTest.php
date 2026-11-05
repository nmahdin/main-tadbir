<?php

namespace Tests\Feature;

use App\Models\DamActivity;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * پخش تدریجی صدا و ویدیوی مخزن.
 *
 * پخش‌کنندهٔ اختصاصی پنل، فایل را «همراه با پیشرفت پخش» می‌خواهد؛ این فقط با
 * پشتیبانی سرور از درخواست‌های بازه‌ای (HTTP Range) ممکن است. بدون آن، مرورگر
 * کل فایل را یک‌جا می‌گرفت و توقف پخش هم بارگیری را متوقف نمی‌کرد.
 */
class DamMediaStreamingTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(array $keys, string $roleKey = 'media'): User
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

    /** یک ویدیوی نمونه در مخزن می‌گذارد و شناسه‌اش را برمی‌گرداند. */
    private function videoAsset(): string
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload', 'assets.preview']);

        // حجم دقیق ۲۰۴۸ بایت تا سرصفحهٔ بازه (Content-Range) قابل بررسی باشد.
        return (string) $this->post('/api/v1/dam/library', [
            'title' => 'نمونهٔ ویدیو',
            'file' => UploadedFile::fake()->create('clip.mp4', 2, 'video/mp4'),
        ])->assertCreated()->json('data.id');
    }

    public function test_preview_announces_byte_range_support(): void
    {
        $id = $this->videoAsset();

        $full = $this->get('/api/v1/dam/library/'.$id.'/preview');
        $full->assertOk();
        $this->assertSame('bytes', $full->headers->get('Accept-Ranges'));
        // نام فایل برای نمایش درون‌مرورگری/دانلود مستقیم حفظ می‌شود.
        $this->assertStringContainsString('clip.mp4', (string) $full->headers->get('Content-Disposition'));
    }

    public function test_partial_request_returns_only_the_requested_window(): void
    {
        $id = $this->videoAsset();

        // بازهٔ نخستِ پخش: فقط همان چند بایت، نه کل فایل.
        $partial = $this->get('/api/v1/dam/library/'.$id.'/preview', ['Range' => 'bytes=0-99']);
        $partial->assertStatus(206);
        $this->assertMatchesRegularExpression('#^bytes 0-99/\d+$#', (string) $partial->headers->get('Content-Range'));
    }

    public function test_seeking_asks_for_another_window(): void
    {
        $id = $this->videoAsset();

        $seek = $this->get('/api/v1/dam/library/'.$id.'/preview', ['Range' => 'bytes=1000-1099']);
        $seek->assertStatus(206);
        $this->assertMatchesRegularExpression('#^bytes 1000-1099/\d+$#', (string) $seek->headers->get('Content-Range'));
    }

    public function test_range_requests_do_not_repeat_the_preview_activity(): void
    {
        $id = $this->videoAsset();

        $this->get('/api/v1/dam/library/'.$id.'/preview')->assertOk();
        $this->get('/api/v1/dam/library/'.$id.'/preview', ['Range' => 'bytes=0-99'])->assertStatus(206);

        // پخش‌کننده برای هر جابه‌جایی یک درخواست ۲۰۶ می‌فرستد؛ بازدید یکی است.
        $this->assertSame(1, DamActivity::where('asset_id', $id)->where('action', 'previewed')->count());
    }

    public function test_range_requests_never_bypass_the_preview_permission(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload', 'assets.preview']);
        $id = $this->post('/api/v1/dam/library', [
            'title' => 'صوت محرمانه',
            'confidentiality' => 'confidential',
            'file' => UploadedFile::fake()->create('voice.mp3', 1, 'audio/mpeg'),
        ])->assertCreated()->json('data.id');

        // کاربر دیگری بدون مجوز پیش‌نمایش: درخواست بازه‌ای هم نباید راه باز کند.
        $this->actor(['assets.view'], 'media-reader');
        $this->get('/api/v1/dam/library/'.$id.'/preview', ['Range' => 'bytes=0-9'])->assertForbidden();
    }
}
