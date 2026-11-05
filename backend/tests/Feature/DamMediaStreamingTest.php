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

    private function actor(array $keys): User
    {
        $role = Role::create(['key' => 'media', 'name' => 'media', 'color' => '#000000', 'is_system' => false, 'is_active' => true]);
        foreach ($keys as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'dam']);
            $role->permissions()->attach($permission);
        }
        $user = User::factory()->create(['role_id' => $role->id, 'role_key' => 'media']);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_preview_answers_byte_ranges_so_media_streams_with_playback(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload', 'assets.preview']);
        $body = str_repeat('v', 2048);
        $id = $this->post('/api/v1/dam/library', [
            'title' => 'نمونهٔ ویدیو',
            'file' => UploadedFile::fake()->createWithContent('clip.mp4', $body),
        ])->assertCreated()->json('data.id');

        $full = $this->get('/api/v1/dam/library/'.$id.'/preview')->assertOk();
        $this->assertSame('bytes', $full->headers->get('Accept-Ranges'));
        // نام فایل برای نمایش درون‌مرورگری/دانلود مستقیم حفظ می‌شود.
        $this->assertStringContainsString('clip.mp4', (string) $full->headers->get('Content-Disposition'));

        // بازهٔ نخستِ پخش: فقط همان چند بایت، نه کل فایل.
        $partial = $this->get('/api/v1/dam/library/'.$id.'/preview', ['Range' => 'bytes=0-99']);
        $partial->assertStatus(206);
        $this->assertSame('bytes 0-99/2048', $partial->headers->get('Content-Range'));

        // جابه‌جایی روی نوار زمان یک بازهٔ دیگر می‌خواهد؛ همان یک بازدید می‌ماند.
        $seek = $this->get('/api/v1/dam/library/'.$id.'/preview', ['Range' => 'bytes=1000-1099']);
        $seek->assertStatus(206);
        $this->assertSame('bytes 1000-1099/2048', $seek->headers->get('Content-Range'));
        $this->assertSame(1, DamActivity::where('asset_id', $id)->where('action', 'previewed')->count());
    }

    public function test_range_requests_never_bypass_the_preview_permission(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload', 'assets.preview']);
        $id = $this->post('/api/v1/dam/library', [
            'title' => 'صوت محرمانه',
            'confidentiality' => 'confidential',
            'file' => UploadedFile::fake()->createWithContent('voice.mp3', str_repeat('a', 512)),
        ])->assertCreated()->json('data.id');

        $this->actor(['assets.view']);
        $this->get('/api/v1/dam/library/'.$id.'/preview', ['Range' => 'bytes=0-9'])->assertForbidden();
    }
}
