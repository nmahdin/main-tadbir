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

    /** محتوای پرونده‌ای که بله در تست برمی‌گرداند (۱۲ بایت). */
    private const FILE_BODY = 'bale-content';

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
            // دریافتِ محتوای پرونده از مسیر رسمیِ بله؛ پیش از این شبیه‌سازی،
            // هیچ تستی مسیرِ «فرستادن فایل در گفتگو» را پوشش نمی‌داد.
            if (str_contains($request->url(), '/file/bot')) {
                return $this->failure === 'file_download_denied'
                    ? $http->response('', 403)
                    : $http->response(self::FILE_BODY, 200, ['Content-Type' => 'application/octet-stream']);
            }
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
            // شکستِ خودِ getFile: پروندهٔ قدیمی/نامعتبر در بله.
            if ($this->failure === 'get_file_not_found' && $method === 'getFile') {
                return $http->response(['ok' => false, 'error_code' => 400, 'description' => 'file not found'], 400);
            }
            // پرونده‌ای که بله نشانیِ کامل (نه مسیر نسبی) برایش برمی‌گرداند.
            if ($this->failure === 'absolute_file_path' && $method === 'getFile') {
                return $http->response(['ok' => true, 'result' => ['file_id' => 'file-1',
                    'file_path' => 'https://tapi.bale.ai/file/bot'.self::TOKEN.'/bale-uploads/sample.bin?download=1',
                    'file_size' => strlen(self::FILE_BODY)]]);
            }
            if ($this->failure === 'unauthorized' && $method === 'getMe') {
                return $http->response(['ok' => false, 'error_code' => 401, 'description' => self::TOKEN], 401);
            }

            return $http->response(['ok' => true, 'result' => match ($method) {
                'getMe' => ['id' => 123456, 'username' => 'tadbir_test_bot'],
                'getWebhookInfo' => ['url' => $this->remoteWebhook],
                'getUpdates' => $this->updates,
                'getFile' => ['file_id' => 'file-1', 'file_path' => 'bale-uploads/sample.bin', 'file_size' => strlen(self::FILE_BODY)],
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
        return Task::create(['title' => $title, 'assignee_id' => $user->id, 'status' => 'backlog', 'priority' => 'medium', 'kind' => 'general']);
    }

    /** پیامِ «سند» که کاربر در گفتگو می‌فرستد. */
    private function document(int $id, string $name = 'روایت.txt', string $sender = '991'): array
    {
        return ['update_id' => $id, 'message' => ['from' => ['id' => $sender], 'chat' => ['id' => $sender, 'type' => 'private'],
            'document' => ['file_id' => 'file-1', 'file_name' => $name, 'file_size' => strlen(self::FILE_BODY)]]];
    }

    /** پیامِ «عکس»: بله چند اندازه می‌فرستد و بزرگ‌ترین اندازه باید انتخاب شود. */
    private function photo(int $id, string $sender = '991'): array
    {
        return ['update_id' => $id, 'message' => ['from' => ['id' => $sender], 'chat' => ['id' => $sender, 'type' => 'private'],
            'photo' => [
                ['file_id' => 'photo-small', 'file_size' => 120],
                ['file_id' => 'photo-large', 'file_size' => strlen(self::FILE_BODY)],
                ['file_id' => 'photo-medium', 'file_size' => 300],
            ]]];
    }

    /** پیامِ ویدیو/صدا/ویس، برای اطمینان از پذیرشِ همهٔ انواعِ پرونده. */
    private function media(int $id, string $kind, string $sender = '991'): array
    {
        return ['update_id' => $id, 'message' => ['from' => ['id' => $sender], 'chat' => ['id' => $sender, 'type' => 'private'],
            $kind => ['file_id' => $kind.'-1', 'file_size' => strlen(self::FILE_BODY), 'mime_type' => 'video/mp4',
                ...($kind === 'voice' ? [] : ['file_name' => $kind.'.'.($kind === 'audio' ? 'mp3' : 'mp4')])]]];
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
