<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * خطای ۴۲۲ باید بگوید کدام ورودی و چرا رد شده است.
 *
 * پیش‌تر هیچ ترجمهٔ فارسی برای قواعد اعتبارسنجی نبود؛ Laravel پیام انگلیسی
 * برمی‌گرداند و فرانت‌اند (که فقط متن فارسی را نمایش می‌دهد) همان «اطلاعات
 * واردشده معتبر نیست» را نشان می‌داد. این تست بسته به همان رفتار است.
 */
class PersianValidationMessagesTest extends TestCase
{
    use RefreshDatabase;

    private function actor(): User
    {
        $role = Role::create(['key' => 'validation_fa', 'name' => 'Validation fa', 'is_active' => true]);
        foreach (['tasks.view', 'tasks.create', 'tasks.edit', 'tasks.status', 'projects.view'] as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_api_validation_messages_are_persian_even_when_app_locale_is_english(): void
    {
        // میزبان ممکن است APP_LOCALE=en داشته باشد؛ پاسخ API همچنان فارسی است.
        config(['app.locale' => 'en']);
        $this->actor();

        $response = $this->postJson('/api/v1/tasks', [])->assertUnprocessable();

        $response->assertJsonValidationErrors('title');
        $message = (string) $response->json('errors.title.0');
        $this->assertMatchesRegularExpression('/[\x{0600}-\x{06FF}]/u', $message, 'پیام خطای فیلد باید فارسی باشد.');
        $this->assertStringContainsString('عنوان', $message, 'نام فارسیِ فیلد باید در پیام بیاید.');
        $this->assertStringContainsString('الزامی', $message);
        // خلاصهٔ پاسخ هم انگلیسیِ چارچوب نیست.
        $this->assertMatchesRegularExpression('/[\x{0600}-\x{06FF}]/u', (string) $response->json('message'));
    }

    public function test_explicit_locale_header_can_switch_the_message_language(): void
    {
        $this->actor();

        $response = $this->withHeaders(['X-Locale' => 'en'])->postJson('/api/v1/tasks', [])->assertUnprocessable();
        $this->assertStringContainsString('required', strtolower((string) $response->json('errors.title.0')));
    }

    public function test_deadline_before_start_date_names_the_rule_in_persian(): void
    {
        $this->actor();

        $response = $this->postJson('/api/v1/tasks', [
            'title' => 'وظیفه با مهلت نامعتبر',
            'startDate' => '2026-10-20',
            'deadline' => '2026-10-10',
        ])->assertUnprocessable();

        $response->assertJsonValidationErrors('deadline');
        $this->assertStringContainsString('بعد از تاریخ شروع', (string) $response->json('errors.deadline.0'));
    }
}
