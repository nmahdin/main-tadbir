<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\PublicationReminders;
use App\Support\Calendar\JalaliDate;
use App\Support\OrganizationTime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * یادآوری انتشار: پروندهٔ امروز/عقب‌افتاده برای ناشر و مالک اعلان می‌گیرد،
 * پروندهٔ منتشرشده یا با تاریخ آینده نه، و اجرای دوباره اعلان تکراری نمی‌سازد.
 */
class PublicationReminderTest extends TestCase
{
    use RefreshDatabase;

    private function actor(): User
    {
        $role = Role::create(['key' => 'publisher', 'name' => 'Publisher', 'is_active' => true]);
        foreach (['content.view', 'content.edit', 'content.publish'] as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function content(string $title, string $date, string $status, User $owner, ?User $publisher = null, ?string $time = null): Content
    {
        return Content::create([
            'title' => $title,
            'type' => 'article',
            'status' => $status,
            'owner_id' => $owner->id,
            'payload' => [
                'publishInfo' => array_filter(['date' => $date, 'time' => $time]),
                ...($publisher ? ['publisherId' => (string) $publisher->id] : []),
            ],
        ]);
    }

    public function test_publication_reminders_are_created_once_for_the_publisher_and_owner(): void
    {
        $owner = $this->actor();
        $publisher = User::factory()->create(['status' => 'active', 'role_id' => $owner->role_id, 'role_key' => $owner->role_key]);
        // «امروز» همان روز سازمانی است؛ تاریخ‌ها از همین مرجع ساخته می‌شوند.
        $today = app(OrganizationTime::class)->date();
        $later = app(OrganizationTime::class)->today()->addDays(2)->toDateString();
        $past = app(OrganizationTime::class)->today()->subDays(2)->toDateString();

        $todayContent = $this->content('انتشار امروز', $today, 'ready_to_publish', $owner, $publisher, '18:30');
        $this->content('انتشار آینده', $later, 'ready_to_publish', $owner, $publisher);
        $this->content('قبلاً منتشر شده', $today, 'published', $owner, $publisher);
        $overdue = $this->content('انتشار عقب‌افتاده', $past, 'ready_to_publish', $owner, $publisher);

        $service = app(PublicationReminders::class);
        $first = $service->run();
        $second = $service->run();

        // دو پروندهٔ قابل یادآوری (امروز و عقب‌افتاده) و هر کدام برای ناشر و مالک.
        $this->assertSame(2, $first['scanned']);
        $this->assertSame(4, $first['reminders'], 'هر پرونده برای ناشر و مالک یک اعلان');
        $this->assertSame(0, $second['reminders'], 'اجرای دوباره اعلان تکراری نمی‌سازد');

        $notifications = DomainRecord::where('domain', DomainRecord::DOMAIN_NOTIFICATION)->get();
        $this->assertCount(4, $notifications);
        $this->assertTrue($notifications->every(fn (DomainRecord $n) => $n->payload['notificationCategory'] === 'content'));
        $this->assertTrue($notifications->contains(fn (DomainRecord $n) => $n->payload['type'] === 'overdue' && str_contains($n->payload['title'], 'عقب‌افتاده')));
        // تاریخ و ساعتِ متن اعلان شمسی است و ساعت با رقم فارسی می‌آید.
        $this->assertTrue($notifications->contains(fn (DomainRecord $n) => str_contains($n->payload['message'], '۱۸:۳۰')));
        $this->assertTrue($notifications->contains(fn (DomainRecord $n) => str_contains($n->payload['message'], JalaliDate::short($today))));
        // هیچ تاریخ میلادی خامی در متن اعلان دیده نمی‌شود.
        $this->assertFalse($notifications->contains(fn (DomainRecord $n) => preg_match('/\d{4}-\d{2}-\d{2}/', (string) $n->payload['message']) === 1));
        // شناسهٔ ماشینی پرونده برای پیوند و کلید یکتا، تاریخ میلادی می‌ماند.
        $this->assertTrue($notifications->contains(fn (DomainRecord $n) => ($n->payload['publishDate'] ?? null) === $today));

        // پیوند هر اعلان به همان پرونده است و تاریخ‌ها هم در payload می‌آیند.
        $todayLinks = $notifications->filter(fn (DomainRecord $n) => $n->payload['linkContentId'] === (string) $todayContent->id);
        $this->assertCount(2, $todayLinks);
        $this->assertTrue($todayLinks->every(fn (DomainRecord $n) => $n->payload['publishDate'] === $today));
        $this->assertTrue($notifications->contains(fn (DomainRecord $n) => $n->payload['linkContentId'] === (string) $overdue->id));

        // هیچ تاریخی جابه‌جا نشده است.
        $this->assertSame($today, $todayContent->fresh()->payload['publishInfo']['date']);
    }

    public function test_the_notification_inbox_surfaces_the_publication_reminder(): void
    {
        $owner = $this->actor();
        $this->content('انتشار امروز', app(OrganizationTime::class)->date(), 'ready_to_publish', $owner);

        $response = $this->getJson('/api/v1/notifications')->assertOk();
        $titles = collect($response->json('data'))->pluck('title')->all();

        $this->assertContains('یادآوری انتشار', $titles);
        $this->assertGreaterThanOrEqual(1, $response->json('meta.unread_count'));
    }

    /**
     * «مسئول انتشار» باید حتماً یادآوری را ببیند: حتی اگر نقشش مجوز سراسری
     * «مشاهده محتوا» نداشته باشد (پیش‌تر درگاه `canEnter` یادآوری را از او
     * پنهان می‌کرد و فقط در پایگاه داده می‌ماند).
     */
    public function test_the_publisher_sees_the_reminder_without_a_global_content_permission(): void
    {
        $owner = $this->actor();
        $role = Role::create(['key' => 'social', 'name' => 'Social', 'is_active' => true]);
        $publisher = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        $this->content('انتشار امروز', app(OrganizationTime::class)->date(), 'ready_to_publish', $owner, $publisher);

        app(PublicationReminders::class)->run();
        Sanctum::actingAs($publisher);

        $response = $this->getJson('/api/v1/notifications')->assertOk();
        $this->assertContains('یادآوری انتشار', collect($response->json('data'))->pluck('title')->all());
        $this->assertGreaterThanOrEqual(1, $response->json('meta.unread_count'));
    }

    /** ناشر غیرفعال: یادآوری برای مالک پرونده ساخته می‌شود و از بین نمی‌رود. */
    public function test_an_inactive_publisher_falls_back_to_the_content_owner(): void
    {
        $owner = $this->actor();
        $publisher = User::factory()->create(['status' => 'inactive', 'role_id' => $owner->role_id, 'role_key' => $owner->role_key]);
        $content = $this->content('انتشار امروز', app(OrganizationTime::class)->date(), 'ready_to_publish', $owner, $publisher);

        $result = app(PublicationReminders::class)->run();

        $this->assertSame(1, $result['scanned']);
        $recipients = DomainRecord::where('domain', DomainRecord::DOMAIN_NOTIFICATION)->pluck('user_id')->all();
        $this->assertSame([$owner->id], $recipients);
        $this->assertFalse(in_array($publisher->id, $recipients, true));
        $this->assertSame((string) $content->id, DomainRecord::where('domain', DomainRecord::DOMAIN_NOTIFICATION)->first()->payload['linkContentId']);
    }

    /** پروندهٔ بدون مالک و ناشر: آخرین ایستگاه مدیر دپارتمان پرونده است. */
    public function test_a_content_without_publisher_or_owner_reminds_the_department_manager(): void
    {
        $owner = $this->actor();
        $manager = User::factory()->create(['status' => 'active', 'role_id' => $owner->role_id, 'role_key' => $owner->role_key]);
        $department = \App\Models\Department::create(['name' => 'محتوا', 'manager_id' => $manager->id, 'status' => 'active']);

        Content::create([
            'title' => 'پروندهٔ بی‌مالک',
            'type' => 'article',
            'status' => 'ready_to_publish',
            'owner_id' => null,
            'payload' => [
                'departmentId' => (string) $department->id,
                'publishInfo' => ['date' => app(OrganizationTime::class)->date()],
                'publisherId' => null,
            ],
        ]);

        app(PublicationReminders::class)->run();

        $recipients = DomainRecord::where('domain', DomainRecord::DOMAIN_NOTIFICATION)->pluck('user_id')->all();
        $this->assertSame([$manager->id], $recipients);
    }
}
