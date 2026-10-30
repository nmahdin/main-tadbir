<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Notifications\NotificationDelivery;
use App\Bot\Bale\Support\PanelLinks;
use App\Models\BaleUserLink;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\WorkspaceRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * اعلان «ایده جدید» در بات بله: دو دکمهٔ مستقیم در مینی‌اپ — «باز کردن ایده» و
 * «نظر دادن» — تا کاربر برای دیدن یا نظر دادن، اتاق فکر را دستی نگردد.
 */
class BaleIdeaNotificationTest extends TestCase
{
    use BaleTestSupport, RefreshDatabase;

    private function ideaLink(): BaleUserLink
    {
        $user = $this->user();
        $permission = Permission::firstOrCreate(['key' => 'thinktank.view'], ['label' => 'thinktank', 'category' => 'tests']);
        $user->role->permissions()->syncWithoutDetaching([$permission->id]);
        $user->unsetRelation('role');

        return $this->link($user);
    }

    public function test_idea_buttons_open_the_idea_and_its_comment_box_in_the_mini_app(): void
    {
        config(['bale.panel_url' => 'https://tadbir.morvarid-daron.ir/']);
        $link = $this->ideaLink();
        $links = app(PanelLinks::class);
        $payload = $links->materialize([
            'text' => 'ایده جدید',
            'reply_markup' => ['inline_keyboard' => $links->ideaButtons($link, 42)],
        ], $link);

        $buttons = collect($payload['reply_markup']['inline_keyboard'])->flatten(1);
        $this->assertSame(['💡 باز کردن ایده', '💬 نظر دادن'], $buttons->pluck('text')->all());
        $urls = $buttons->pluck('web_app.url')->values()->all();
        $this->assertCount(2, $urls);
        $this->assertMatchesRegularExpression('~^https://tadbir\.morvarid-daron\.ir/\?idea=42#bale-login=[a-f0-9]{64}$~', $urls[0]);
        $this->assertMatchesRegularExpression('~^https://tadbir\.morvarid-daron\.ir/\?idea=42&comment=1#bale-login=[a-f0-9]{64}$~', $urls[1]);
        // هیچ دکمه‌ای مرورگر بیرونی باز نمی‌کند و توکن در متن دکمه‌ها نیست.
        $this->assertSame([], $buttons->pluck('url')->filter()->values()->all());
        $this->assertSame([], $links->ideaButtons($link, 0));
    }

    public function test_new_idea_notification_sends_authenticated_idea_buttons(): void
    {
        $this->ready();
        config(['bale.panel_url' => 'https://tadbir.morvarid-daron.ir/']);
        $link = $this->ideaLink();
        $idea = WorkspaceRecord::create([
            'kind' => WorkspaceRecord::KIND_IDEA,
            'title' => 'ایده نمونه',
            'owner_id' => $link->user_id,
            'payload' => ['status' => 'submitted'],
        ]);
        $record = DomainRecord::create([
            'domain' => DomainRecord::DOMAIN_NOTIFICATION,
            'user_id' => $link->user_id,
            'title' => 'ایده جدید',
            'payload' => [
                'title' => 'ایده جدید',
                'type' => 'system',
                'notificationCategory' => 'ideas',
                'message' => 'ایده جدیدی ثبت شد.',
                'linkIdeaId' => (string) $idea->id,
            ],
        ]);

        app(NotificationDelivery::class)->created($record);
        app(NotificationDelivery::class)->sendNow();

        $this->assertCount(1, $this->sent);
        $buttons = collect($this->sent[0]['reply_markup']['inline_keyboard'] ?? [])->flatten(1);
        $this->assertSame(['💡 باز کردن ایده', '💬 نظر دادن'], $buttons->pluck('text')->all());
        $this->assertStringContainsString('?idea='.$idea->id, (string) $buttons->pluck('web_app.url')->first());
        $this->assertStringContainsString('&comment=1', (string) $buttons->pluck('web_app.url')->last());
        // آیکن پیام هم باید ایده باشد، نه زنگ عمومی.
        $this->assertStringStartsWith('💡', (string) $this->sent[0]['text']);
    }
}
