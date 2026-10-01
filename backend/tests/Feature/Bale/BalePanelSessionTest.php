<?php

namespace Tests\Feature\Bale;

use App\Models\ActivityLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class BalePanelSessionTest extends TestCase
{
    use BaleTestSupport, RefreshDatabase;

    private function tokenFromLatestMessage(): string
    {
        $url = collect(end($this->sent)['reply_markup']['inline_keyboard'])->flatten(1)->pluck('web_app.url')->filter()->last();
        parse_str((string) parse_url($url, PHP_URL_FRAGMENT), $fragment);

        return (string) ($fragment['bale-login'] ?? '');
    }

    public function test_linked_user_enters_panel_once_without_password_and_cookie_is_backend_owned(): void
    {
        $this->ready();
        config(['bale.panel_url' => 'https://tadbir.example/']);
        $user = $this->user();
        $this->link($user);
        $this->tick([$this->message(1, '/start')]);
        $token = $this->tokenFromLatestMessage();

        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $token);
        $this->assertDatabaseCount('bale_panel_sessions', 1);
        $this->assertStringNotContainsString($token, (string) DB::table('bale_panel_sessions')->value('token_hash'));
        $storedOutbox = (string) DB::table('bale_outbox')->latest('id')->value('payload');
        $this->assertStringNotContainsString($token, $storedOutbox);
        $this->assertStringNotContainsString('bale-login', $storedOutbox);

        $this->postJson('/api/v1/auth/bale/panel', ['token' => $token])
            ->assertOk()
            ->assertJsonPath('data.id', (string) $user->id)
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->assertAuthenticatedAs($user, 'web');
        $this->assertDatabaseCount('bale_panel_sessions', 0);
        $this->assertDatabaseHas('activity_logs', ['user_id' => $user->id, 'type' => 'auth_login']);

        Auth::guard('web')->logout();
        $this->postJson('/api/v1/auth/bale/panel', ['token' => $token])->assertUnprocessable();
    }

    public function test_new_menu_invalidates_old_link_and_revoked_account_cannot_consume_new_link(): void
    {
        $this->ready();
        config(['bale.panel_url' => 'https://tadbir.example/']);
        $user = $this->user();
        $this->link($user);
        $this->tick([$this->message(1, '/start')]);
        $old = $this->tokenFromLatestMessage();
        $this->tick([$this->message(2, '/menu')]);
        $new = $this->tokenFromLatestMessage();
        $this->assertNotSame($old, $new);

        $this->postJson('/api/v1/auth/bale/panel', ['token' => $old])->assertUnprocessable();
        $user->update(['status' => 'blocked']);
        $this->postJson('/api/v1/auth/bale/panel', ['token' => $new])->assertUnprocessable();
        $this->assertGuest('web');
    }
}
