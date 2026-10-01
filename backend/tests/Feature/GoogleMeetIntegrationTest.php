<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\WorkspaceRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GoogleMeetIntegrationTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    public function test_meeting_organizer_can_create_and_persist_google_meet_link(): void
    {
        config([
            'google_calendar.access_token' => 'test-token',
            'google_calendar.calendar_id' => 'calendar@example.test',
            'google_calendar.timezone' => 'Asia/Tehran',
        ]);
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/*/events*' => Http::response([
                'id' => 'google-event-1',
                'hangoutLink' => 'https://meet.google.com/abc-defg-hij',
                'htmlLink' => 'https://calendar.google.com/event?eid=1',
            ]),
        ]);
        $owner = $this->actor();
        $meeting = WorkspaceRecord::create([
            'kind' => WorkspaceRecord::KIND_MEETING,
            'title' => 'Planning',
            'owner_id' => $owner->id,
            'payload' => [
                'title' => 'Planning',
                'organizerId' => (string) $owner->id,
                'date' => '2026-10-12',
                'time' => '۱۰:۳۰',
                'duration' => '۶۰ دقیقه',
            ],
        ]);

        $this->postJson('/api/v1/think-tank-meetings/'.$meeting->id.'/google-meet')
            ->assertOk()
            ->assertJsonPath('data.locationType', 'online')
            ->assertJsonPath('data.locationDetails', 'https://meet.google.com/abc-defg-hij')
            ->assertJsonPath('data.googleCalendarEventId', 'google-event-1');

        $this->assertSame('https://meet.google.com/abc-defg-hij', $meeting->fresh()->payload['locationDetails']);
        Http::assertSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer test-token')
            && $request['conferenceData']['createRequest']['conferenceSolutionKey']['type'] === 'hangoutsMeet');
    }

    public function test_google_meet_requires_server_configuration(): void
    {
        config([
            'google_calendar.access_token' => null,
            'google_calendar.credentials_path' => null,
            'google_calendar.credentials_json' => null,
        ]);
        $owner = $this->actor();
        $meeting = WorkspaceRecord::create([
            'kind' => WorkspaceRecord::KIND_MEETING,
            'title' => 'Planning',
            'owner_id' => $owner->id,
            'payload' => ['date' => '2026-10-12', 'time' => '10:30', 'duration' => '60'],
        ]);

        $this->postJson('/api/v1/think-tank-meetings/'.$meeting->id.'/google-meet')
            ->assertUnprocessable()->assertJsonValidationErrors('googleMeet');
    }

    private function actor(): User
    {
        $role = Role::create(['key' => 'meeting-manager-'.uniqid(), 'name' => 'Meeting manager', 'is_active' => true]);
        $permission = Permission::firstOrCreate(
            ['key' => 'thinktank.manage_meetings'],
            ['label' => 'Manage meetings', 'category' => 'thinktank'],
        );
        $role->permissions()->attach($permission);
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }
}
