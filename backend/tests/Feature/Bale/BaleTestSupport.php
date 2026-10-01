<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Client\BaleHttp;
use App\Bot\Bale\PollingRunner;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\RuntimeLock;
use App\Models\BaleUserLink;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Crypt;

trait BaleTestSupport
{
    private const TOKEN = '123456:abcdefghijklmnopqrstuvwxyz123456';

    private array $updates = [];

    private array $methods = [];

    private array $sent = [];

    private string $remoteWebhook = '';

    private array $registrations = [];

    private ?string $failure = null;

    protected function setUp(): void
    {
        $this->mockConsoleOutput = false;
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('x', 32)), 'bale.panel_url' => 'https://tadbir.example', 'bale.runner_secret' => null]);
        $http = app(BaleHttp::class);
        $http->preventStrayRequests();
        $http->fake(function ($request) use ($http) {
            $method = basename(parse_url($request->url(), PHP_URL_PATH));
            $this->methods[] = $method;
            if ($method === 'setWebhook') {
                $this->registrations[] = $request->data();
                if ($this->failure !== 'registration_false') {
                    $this->remoteWebhook = $request['url'];
                }
                if ($this->failure === 'registration_unknown') {
                    throw new ConnectionException('sensitive URL');
                }

                return $http->response(['ok' => true, 'result' => $this->failure !== 'registration_false']);
            }
            if ($method === 'deleteWebhook') {
                if ($this->failure !== 'delete_false') {
                    $this->remoteWebhook = '';
                }

                return $http->response(['ok' => true, 'result' => $this->failure !== 'delete_false']);
            }
            if ($method === 'sendMessage') {
                $this->sent[] = $request->data();
                if ($this->failure === 'timeout') {
                    throw new ConnectionException('secret URL '.self::TOKEN);
                }
                if ($this->failure === '429') {
                    return $http->response(['ok' => false, 'error_code' => 429, 'description' => self::TOKEN, 'parameters' => ['retry_after' => 120]], 429);
                }
                if ($this->failure === '403') {
                    return $http->response(['ok' => false, 'error_code' => 403, 'description' => self::TOKEN], 403);
                }
            }
            if ($method === 'deleteMessage' && $this->failure === 'cleanup_403') {
                return $http->response(['ok' => false, 'error_code' => 403, 'description' => self::TOKEN], 403);
            }
            if ($method === 'deleteMessage' && $this->failure === 'cleanup_429') {
                return $http->response(['ok' => false, 'error_code' => 429, 'description' => self::TOKEN, 'parameters' => ['retry_after' => 120]], 429);
            }
            if ($this->failure === 'unauthorized' && $method === 'getMe') {
                return $http->response(['ok' => false, 'error_code' => 401, 'description' => self::TOKEN], 401);
            }

            return $http->response(['ok' => true, 'result' => match ($method) {
                'getMe' => ['id' => 123456, 'username' => 'tadbir_test_bot'],
                'getWebhookInfo' => ['url' => $this->remoteWebhook],
                'getUpdates' => $this->updates,
                'sendMessage' => ['message_id' => 50],
                'deleteWebhook', 'deleteMessage', 'answerCallbackQuery' => true,
                default => throw new \RuntimeException('Unexpected API method'),
            }]);
        });
    }

    private function user(bool $admin = false): User
    {
        $user = User::factory()->create(['status' => 'active']);
        $role = Role::firstOrCreate(['key' => $admin ? 'bot_admin' : 'bot_member'], ['name' => 'Bot test role']);
        foreach (['tasks.view', 'projects.view', ...($admin ? ['settings.manage'] : [])] as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']);
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }
        $user->update(['role_id' => $role->id]);

        return $user;
    }

    private function ready(): void
    {
        app(Settings::class)->write([
            'enabled' => true, 'token' => Crypt::encryptString(self::TOKEN), 'bot_id' => '123456',
            'connection_status' => 'connected', 'offset' => 0,
        ]);
    }

    private function link(User $user, string $sender = '991'): BaleUserLink
    {
        return BaleUserLink::create(['user_id' => $user->id, 'bale_user_id' => $sender, 'chat_id' => $sender]);
    }

    private function task(User $user, string $title = 'My private task'): Task
    {
        return Task::create(['title' => $title, 'assignee_id' => $user->id, 'status' => 'todo', 'priority' => 'medium', 'kind' => 'general']);
    }

    private function message(int $id, string $text, string $sender = '991', string $type = 'private'): array
    {
        return ['update_id' => $id, 'message' => ['from' => ['id' => $sender], 'chat' => ['id' => $sender, 'type' => $type], 'text' => $text]];
    }

    private function buttonUpdate(int $id, string $data, string $sender = '991'): array
    {
        return ['update_id' => $id, 'callback_query' => ['id' => 'cb'.$id, 'from' => ['id' => $sender], 'data' => $data, 'message' => ['chat' => ['id' => $sender, 'type' => 'private']]]];
    }

    private function tick(array $updates): void
    {
        $this->updates = $updates;
        app(RuntimeLock::class)->run(fn () => app(PollingRunner::class)->tick());
    }
}
