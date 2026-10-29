<?php

namespace Tests\Feature\Bale;

use App\Models\BaleConversation;
use App\Models\BaleOutbox;
use App\Models\Content;
use App\Models\DamAsset;
use App\Models\DamDataTable;
use App\Models\DamFolder;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * مسیرهای ثبت دارایی در بات بله:
 * ۱) دریافتِ پرونده‌ای که کاربر در گفتگو می‌فرستد و انتخاب پوشهٔ مقصد.
 * ۲) انتخاب پوشهٔ مقصد برای دارایی متنی.
 * ۳) کارکردنِ «اطلاعات جدول» در منوی ثبت دارایی، بدون نیاز به دپارتمان.
 * ۴) نبودنِ دکمهٔ اضافیِ «ثبت ردیف جدول» در جزئیات تسک.
 */
class BaleAssetFlowsTest extends TestCase
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

    private function userWithAssets(): User
    {
        $user = $this->user();
        $this->grant($user);
        $this->link($user);

        return $user;
    }

    private function folder(User $user, string $name = 'پوشهٔ روایت'): DamFolder
    {
        return DamFolder::create(['name' => $name, 'created_by' => $user->id]);
    }

    private function texts(): string
    {
        return json_encode($this->sent, JSON_UNESCAPED_UNICODE);
    }

    public function test_file_sent_in_chat_is_received_and_saved_into_the_chosen_folder(): void
    {
        Storage::fake('local');
        $this->ready();
        $user = $this->userWithAssets();
        $folder = $this->folder($user);

        $this->tick([$this->buttonUpdate(1, 'assetsend:0')]);
        $this->assertStringContainsString('عنوان و پوشهٔ مقصد', (string) end($this->sent)['text']);

        // خودِ پرونده در گفتگو؛ پیش از این، دریافت از بله در تست پوشش نداشت.
        $this->tick([$this->document(2)]);
        $this->assertStringContainsString('پرونده دریافت شد', (string) end($this->sent)['text']);

        $this->tick([$this->message(3, 'روایت پرونده')]);
        $nonce = BaleConversation::first()->nonce;
        $this->assertSame('asset_file_confirm', BaleConversation::first()->step);
        $preview = (string) end($this->sent)['text'];
        $this->assertStringContainsString('پوشهٔ مقصد', $preview);
        $this->assertStringContainsString('✅ تأیید ثبت دارایی', json_encode(end($this->sent)['reply_markup'], JSON_UNESCAPED_UNICODE));

        // فهرست ریشه: پوشهٔ ساخته‌شده به‌عنوان زیرپوشه نشان داده می‌شود.
        $this->tick([$this->buttonUpdate(4, 'assetdir:'.$nonce.':0')]);
        $this->assertStringContainsString('پوشهٔ مقصد را انتخاب کنید', (string) end($this->sent)['text']);
        $this->assertStringContainsString('assetdir:'.$nonce.':'.$folder->id.':0', json_encode(end($this->sent)['reply_markup']));

        // رفتن به داخل همان پوشه، سپس انتخاب آن؛ فقط پوشهٔ جاری قابل انتخاب است.
        $this->tick([$this->buttonUpdate(5, 'assetdir:'.$nonce.':'.$folder->id.':0')]);
        $this->assertStringContainsString($folder->name, (string) end($this->sent)['text']);
        $this->assertStringContainsString('assetuse:'.$nonce.':'.$folder->id, json_encode(end($this->sent)['reply_markup']));

        $this->tick([$this->buttonUpdate(6, 'assetuse:'.$nonce.':'.$folder->id)]);
        $this->assertStringContainsString($folder->name, (string) end($this->sent)['text']);

        $this->tick([$this->buttonUpdate(7, 'confirm:'.$nonce)]);
        $asset = DamAsset::query()->latest('id')->first();
        $this->assertNotNull($asset, 'دارایی پروندهٔ بات ثبت نشد.');
        $this->assertSame('file', $asset->type);
        $this->assertSame($folder->id, (int) $asset->folder_id);
        $this->assertSame(1, $asset->files()->count());
    }

    public function test_file_receive_failure_reports_the_real_reason(): void
    {
        Storage::fake('local');
        $this->ready();
        $user = $this->userWithAssets();
        $this->failure = 'file_download_denied';

        $this->tick([$this->buttonUpdate(1, 'assetsend:0'), $this->document(2)]);

        $text = (string) end($this->sent)['text'];
        // نه پیام عمومی؛ دلیلِ واقعی (رد شدن دریافت از سوی بله) با کدِ فنی گفته می‌شود.
        $this->assertStringContainsString('اجازهٔ دریافت این پرونده', $text);
        $this->assertStringContainsString('کد: forbidden', $text);
        $this->assertStringContainsString('باز مانده', $text);
        $this->assertSame('asset_file', BaleConversation::first()->step);
    }

    public function test_text_asset_can_choose_its_destination_folder(): void
    {
        $this->ready();
        $user = $this->userWithAssets();
        $folder = $this->folder($user, 'یادداشت‌ها');

        $this->tick([$this->buttonUpdate(1, 'assettext:0'), $this->message(2, 'عنوان یادداشت'), $this->message(3, 'متن یادداشت')]);
        $nonce = BaleConversation::first()->nonce;
        $this->assertSame('text_asset_confirm', BaleConversation::first()->step);
        $this->assertStringContainsString('پوشهٔ مقصد', (string) end($this->sent)['text']);

        $this->tick([$this->buttonUpdate(4, 'assetuse:'.$nonce.':'.$folder->id), $this->buttonUpdate(5, 'confirm:'.$nonce)]);

        $asset = DamAsset::query()->latest('id')->first();
        $this->assertNotNull($asset);
        $this->assertSame('content', $asset->type);
        $this->assertSame($folder->id, (int) $asset->folder_id);
    }

    public function test_asset_table_section_works_without_any_department(): void
    {
        $this->ready();
        $user = $this->userWithAssets();
        $table = DamDataTable::create(['name' => 'روایات', 'created_by' => $user->id,
            'columns' => [['id' => 'body', 'name' => 'متن', 'type' => 'text', 'required' => true]]]);

        $this->tick([$this->buttonUpdate(1, 'assetrows')]);
        // قبلاً پاسخِ فهرست به دلیلِ «دپارتمان اجباری» لغو می‌شد و هیچ پیامی نمی‌رسید.
        $this->assertSame(0, BaleOutbox::query()->where('subject_type', 'asset_tables')->where('status', 'cancelled')->count());
        $this->assertStringContainsString('جدول دارایی را انتخاب کنید', (string) end($this->sent)['text']);

        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(2, 'assettable:'.$nonce.':0')]);
        $this->assertStringContainsString('متن', (string) end($this->sent)['text']);

        $this->tick([$this->message(3, 'ردیف آزمایشی')]);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(4, 'confirm:'.$nonce)]);
        $this->assertSame(1, $table->rows()->count());
        $this->assertSame('ردیف آزمایشی', $table->rows()->first()->cells['body']);
    }

    public function test_task_detail_has_no_table_row_button(): void
    {
        $this->ready();
        $user = $this->userWithAssets();
        $task = $this->task($user, 'وظیفهٔ محتوایی');
        $content = Content::create(['title' => 'پروندهٔ محتوا', 'type' => 'article', 'status' => 'idea',
            'owner_id' => $user->id, 'payload' => ['stages' => []]]);
        $task->update(['content_id' => $content->id]);

        $this->tick([$this->buttonUpdate(1, 'task:'.$task->id)]);
        $payload = json_encode(end($this->sent), JSON_UNESCAPED_UNICODE);
        $this->assertStringNotContainsString('assetrows', $payload);
        $this->assertStringNotContainsString('ثبت ردیف جدول', $payload);
    }

    public function test_task_detail_keeps_the_asset_entry_for_general_tasks(): void
    {
        $this->ready();
        $user = $this->userWithAssets();
        $task = $this->task($user);

        $this->tick([$this->buttonUpdate(1, 'task:'.$task->id)]);
        $this->assertStringContainsString('taskasset:'.$task->id, json_encode(end($this->sent), JSON_UNESCAPED_UNICODE));
    }
}
