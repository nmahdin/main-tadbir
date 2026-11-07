<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Automations;
use App\Bot\Bale\Handlers\OperationalMenus;
use App\Bot\Bale\Settings;
use App\Models\BaleConversation;
use App\Models\DamAsset;
use App\Models\DamDataTable;
use App\Models\Department;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

/**
 * «جریانِ باز» در بات بله باید تا پایان یا تا «لغو/بازگشت به منو» زنده بماند:
 *
 * ۱) کلیک روی دکمه‌های بخش‌های دیگر، پیش‌نویس را پاک نمی‌کند.
 * ۲) خطای فرم (۴۰۹/۴۲۲) و خطای پردازش، پاسخ‌های قبلی را حفظ می‌کند و دلیل را
 *    می‌گوید؛ پیش‌تر این دو مسیر نشست را پاک می‌کردند و کاربر «منوی اصلی» می‌گرفت.
 * ۳) پیامِ خراب، offset را جلو می‌برد تا بقیهٔ پیام‌ها پردازش شوند.
 * ۴) نشست در میانهٔ کار منقضی نمی‌شود.
 */
class BaleFlowPersistenceTest extends TestCase
{
    use BaleTestSupport, RefreshDatabase;

    private function grant(User $user, array $keys = ['tasks.view', 'assets.view', 'assets.upload']): void
    {
        foreach ($keys as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']);
            $user->role->permissions()->syncWithoutDetaching([$permission->id]);
        }
        $user->unsetRelation('role');
    }

    private function admin(): User
    {
        $user = $this->user(true);
        $this->grant($user);

        return $user;
    }

    /** جدول اطلاعات با یک ستون متنی و قاعدهٔ خودکارسازیِ ثبت ردیف. */
    private function openTableForm(User $user): void
    {
        $department = Department::create(['name' => 'تیم روایت', 'status' => 'active']);
        $department->members()->attach($user);
        $table = DamDataTable::create(['name' => 'روایات', 'created_by' => $user->id,
            'columns' => [['id' => 'body', 'name' => 'متن روایت', 'type' => 'text', 'required' => true],
                ['id' => 'note', 'name' => 'یادداشت', 'type' => 'text', 'required' => false]]]);
        $table->departments()->attach($department);
        $automations = app(Automations::class);
        $automations->save($this->admin(), ['revision' => $automations->read()['revision'], 'rules' => [[
            'id' => (string) Str::uuid(), 'name' => 'ثبت روایت', 'enabled' => true, 'trigger_type' => 'command',
            'trigger' => '/revayat', 'action' => 'table_row', 'response' => null,
            'table_id' => $table->id, 'department_id' => $department->id,
        ]]]);
        $this->tick([$this->message(1, '/revayat')]);
    }

    private function text(): string
    {
        return (string) end($this->sent)['text'];
    }

    public function test_a_menu_button_during_a_form_keeps_the_draft(): void
    {
        $this->ready();
        $user = $this->admin();
        $this->link($user);
        $this->openTableForm($user);
        $this->assertSame('asset_field', BaleConversation::first()->step);

        // کاربر وسطِ فرم دکمهٔ «وظایف من» را می‌زند.
        $this->tick([$this->buttonUpdate(2, 'tasks')]);

        $this->assertSame('asset_field', BaleConversation::first()->step, 'جریانِ فرم نباید از دست برود.');
        $this->assertStringContainsString('ثبت ردیف جدول اطلاعات', $this->text());
        $this->assertStringContainsString('محفوظ', $this->text());
        $callbacks = collect(end($this->sent)['reply_markup']['inline_keyboard'])->flatten(1)->pluck('callback_data')->all();
        $this->assertContains('cancel', $callbacks);
        $this->assertContains('home', $callbacks);
        // و ادامهٔ فرم همچنان کار می‌کند.
        $this->tick([$this->message(3, 'متن روایت من')]);
        $this->assertSame(1, BaleConversation::first()->data['index']);
        $this->assertStringContainsString('یادداشت', $this->text());
    }

    public function test_back_and_cancel_are_the_only_ways_out_of_a_form(): void
    {
        $this->ready();
        $user = $this->admin();
        $this->link($user);
        $this->openTableForm($user);

        // «بازگشت به منو» خروجِ صریح است.
        $this->tick([$this->buttonUpdate(2, 'home')]);
        $this->assertDatabaseCount('bale_conversations', 0);
        $this->assertStringContainsString('به تدبیر خوش آمدید', $this->text());
    }

    public function test_a_form_error_keeps_the_draft_and_states_the_reason(): void
    {
        $this->ready();
        $user = $this->admin();
        $this->link($user);
        $this->openTableForm($user);

        // دکمهٔ مرحلهٔ قبل با none‌ی کهنه: فرمِ فعلی معتبر است، مقدار رد می‌شود.
        $stale = str_repeat('0', 24);
        $this->tick([$this->buttonUpdate(2, 'assetpick:'.$stale.':0')]);

        $this->assertSame('asset_field', BaleConversation::first()->step, 'خطای فرم نباید نشست را پاک کند.');
        $message = $this->text();
        $this->assertStringContainsString('محفوظ', $message);
        $this->assertStringNotContainsString('منوی اصلی دوباره انتخاب کنید', $message);
        // و همان مقدار درخواستی با پاسخِ درست ثبت می‌شود.
        $this->tick([$this->message(3, 'متن درست')]);
        $this->assertSame('متن درست', BaleConversation::first()->data['cells']['body']);
    }

    public function test_an_unexpected_processing_error_keeps_the_draft_notifies_and_does_not_block_later_updates(): void
    {
        Storage::fake('local');
        $this->ready();
        $user = $this->admin();
        $this->link($user);
        $this->openTableForm($user);
        $offsetBefore = (int) app(Settings::class)->read()['offset'];

        // سرویسِ فرم میانِ کار می‌شکند (مثل خطای واقعیِ سرور/دیتابیس).
        $this->app->bind(OperationalMenus::class, fn () => new class
        {
            public function handle(): bool
            {
                throw new RuntimeException('ذخیرهٔ ردیف روی سرور ناموفق بود');
            }
        });
        $this->tick([$this->message(2, 'متن روایت من')]);
        $this->app->offsetUnset(OperationalMenus::class);

        // ۱) نشست و پیش‌نویس سرِ جای خود هستند.
        $this->assertSame('asset_field', BaleConversation::first()->step);
        // ۲) کاربر پیامِ روشن با دلیلِ واقعی می‌گیرد.
        $this->assertStringContainsString('ذخیرهٔ ردیف روی سرور ناموفق بود', $this->text());
        // ۳) پیامِ خراب در صندوق با وضعیت شکست ثبت و offset جلو رفته است.
        $this->assertDatabaseHas('bale_inbox', ['update_id' => 2, 'status' => 'failed']);
        $this->assertGreaterThan($offsetBefore, (int) app(Settings::class)->read()['offset']);

        // ۴) پیامِ بعدی همان جریان عادی پردازش می‌شود.
        $this->tick([$this->message(3, 'متن روایت از نو')]);
        $this->assertSame('متن روایت از نو', BaleConversation::first()->data['cells']['body']);
        $this->assertSame(1, BaleConversation::first()->data['index']);
    }

    public function test_the_session_does_not_expire_in_the_middle_of_a_form(): void
    {
        $this->ready();
        $user = $this->admin();
        $this->link($user);
        $this->openTableForm($user);

        // نشست نزدیکِ انقضا؛ یک تعامل باید آن را تمدید کند.
        $session = BaleConversation::first();
        $session->update(['expires_at' => now()->addMinute()]);
        $this->tick([$this->message(2, 'متن')]);
        $this->assertTrue(BaleConversation::first()->expires_at->gt(now()->addMinutes(30)), 'نشست در میانهٔ فرم تمدید نشد.');
        $this->assertSame(0, DB::table('bale_conversations')->where('expires_at', '<=', now())->count());
    }

    public function test_file_sent_without_pressing_any_button_starts_the_asset_flow(): void
    {
        Storage::fake('local');
        $this->ready();
        $user = $this->admin();
        $this->link($user);

        // بی‌هیچ دکمه‌ای، مستقیم پرونده در گفتگو.
        $this->tick([$this->document(1)]);
        $this->assertStringContainsString('پرونده دریافت شد', $this->text());
        $this->assertSame('asset_file_title', BaleConversation::first()->step);

        $this->tick([$this->message(2, 'روایت پرونده')]);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce)]);
        $this->assertSame(1, DamAsset::query()->count());
    }

    public function test_a_photo_is_accepted_and_the_largest_size_is_saved(): void
    {
        Storage::fake('local');
        $this->ready();
        $user = $this->admin();
        $this->link($user);

        $this->tick([$this->buttonUpdate(1, 'assetsend:0'), $this->photo(2)]);
        $this->assertStringContainsString('پرونده دریافت شد', $this->text());
        $this->assertStringContainsString('تصویر.jpg', $this->text());
        // بزرگ‌ترین اندازه از سوی بله انتخاب می‌شود، نه کوچک‌ترین.
        $this->assertContains('getFile', $this->methods);

        $this->tick([$this->message(3, 'عکس روایت')]);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(4, 'confirm:'.$nonce)]);
        $asset = DamAsset::query()->with('files')->first();
        $this->assertNotNull($asset);
        $this->assertSame('تصویر.jpg', $asset->files->first()->original_filename);
    }

    public function test_video_voice_and_audio_are_accepted_too(): void
    {
        Storage::fake('local');
        $this->ready();
        $user = $this->admin();
        $this->link($user);

        $update = 10;
        foreach (['video' => 'video.mp4', 'voice' => 'پرونده.ogg', 'audio' => 'audio.mp3'] as $kind => $name) {
            BaleConversation::query()->delete();
            // هر پیام شناسهٔ تازه دارد؛ تکرارِ شناسه در صندوق، بازپخش تلقی می‌شود.
            $this->tick([$this->media($update++, $kind)]);
            $this->assertStringContainsString('پرونده دریافت شد', $this->text(), 'نوع '.$kind.' پذیرفته نشد.');
            $this->assertStringContainsString($name, $this->text());
        }
    }

    public function test_receive_failure_shows_the_code_and_a_resend_continues_the_same_form(): void
    {
        Storage::fake('local');
        $this->ready();
        $user = $this->admin();
        $this->link($user);

        $this->failure = 'file_download_denied';
        $this->tick([$this->buttonUpdate(1, 'assetsend:0'), $this->document(2)]);
        $failed = $this->text();
        $this->assertStringContainsString('کد: forbidden', $failed);
        $this->assertStringContainsString('فرمِ ثبت دارایی باز مانده است', $failed);
        $this->assertSame('asset_file', BaleConversation::first()->step);

        // همان پرونده دوباره می‌رسد و فرم ادامه می‌یابد.
        $this->failure = null;
        $this->tick([$this->document(3)]);
        $this->assertStringContainsString('پرونده دریافت شد', $this->text());
        $this->assertSame('asset_file_title', BaleConversation::first()->step);
    }

    public function test_get_file_failure_reports_the_technical_code(): void
    {
        Storage::fake('local');
        $this->ready();
        $user = $this->admin();
        $this->link($user);

        $this->failure = 'get_file_not_found';
        $this->tick([$this->buttonUpdate(1, 'assetsend:0'), $this->document(2)]);

        $text = $this->text();
        $this->assertStringContainsString('کد: bad_request', $text);
        $this->assertStringContainsString('دوباره', $text);
        $this->assertSame('asset_file', BaleConversation::first()->step);
    }

    public function test_an_absolute_file_url_from_bale_is_downloaded(): void
    {
        Storage::fake('local');
        $this->ready();
        $user = $this->admin();
        $this->link($user);

        $this->failure = 'absolute_file_path';
        $this->tick([$this->buttonUpdate(1, 'assetsend:0'), $this->document(2)]);

        $this->assertStringContainsString('پرونده دریافت شد', $this->text());
        $this->assertSame('asset_file_title', BaleConversation::first()->step);
    }

    public function test_a_file_sent_during_another_form_does_not_destroy_the_draft(): void
    {
        Storage::fake('local');
        $this->ready();
        $user = $this->admin();
        $this->link($user);
        $this->openTableForm($user);

        $this->tick([$this->document(2)]);
        $this->assertSame('asset_field', BaleConversation::first()->step, 'پرونده نباید فرمِ جاری را عوض کند.');
        $this->assertStringContainsString('فرم جاری محفوظ است', $this->text());
        $this->assertSame(0, DamAsset::query()->count());
    }
}
