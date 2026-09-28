<?php

namespace App\Bot\Bale\Routing;

use App\Bot\Bale\Auth\AccountLinker;
use App\Bot\Bale\Outbox;
use App\Bot\Bale\Settings;
use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\TaskOperations;
use Illuminate\Database\Eloquent\Builder;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class MenuRouter
{
    private const LABELS = ['backlog' => 'باز', 'todo' => 'برای انجام', 'in_progress' => 'در حال انجام', 'review' => 'بازبینی', 'completed' => 'تکمیل‌شده', 'archived' => 'بایگانی'];

    public function __construct(private AccountLinker $linker, private Outbox $outbox, private Settings $settings, private TaskOperations $tasks) {}

    /** Invoked only by PollingRunner; there is intentionally no public update-ingestion API. */
    public function handle(array $update): void
    {
        $callback = $update['callback_query'] ?? null;
        $message = $callback['message'] ?? $update['message'] ?? null;
        $sender = $callback['from']['id'] ?? $message['from']['id'] ?? null;
        $chat = $message['chat']['id'] ?? null;
        if (($message['chat']['type'] ?? '') !== 'private' || ! $this->validId($sender) || ! $this->validId($chat)) {
            return;
        }
        $sender = (string) $sender;
        $chat = (string) $chat;
        $text = is_string($message['text'] ?? null) ? trim($message['text']) : '';
        $action = $callback ? ($callback['data'] ?? '') : '';
        if (! is_string($action) || strlen($action) > 64 || mb_strlen($text) > 4096) {
            return;
        }
        $key = $this->settings->read()['bot_id'].':'.$update['update_id'];
        $link = BaleUserLink::where('bale_user_id', $sender)->first();
        if (! $link) {
            if (! $callback && preg_match('/^[A-Fa-f0-9]{10}$/', $text)) {
                $link = $this->linker->consume(strtoupper($text), $sender, $chat);
            }
            if (! $link) {
                $this->reply($key, $chat, null, 'برای اتصال، وارد پروفایل خود در تدبیر شوید و کد یک‌بارمصرف را اینجا ارسال کنید. کد نامعتبر، منقضی یا بیش از حد تلاش‌شده پذیرفته نمی‌شود.');

                return;
            }
        }
        $user = User::find($link->user_id);
        if (! $user?->isActive() || $link->chat_id !== $chat) {
            return;
        }
        $session = BaleConversation::where('link_id', $link->id)->first();
        if ($session && $session->expires_at->lte(now())) {
            $session->delete();
            $session = null;
        }

        try {
            if ($action === 'cancel' || $action === 'home' || (! $callback && $text === '/start')) {
                $session?->delete();
                $this->home($key, $chat, $link);
            } elseif (preg_match('/^confirm:([a-f0-9]{24})$/', $action, $m)) {
                $this->confirm($key, $chat, $link, $user, $session, $m[1]);
            } elseif (! $callback && $session?->step === 'report_text') {
                if ($text === '' || mb_strlen($text) > 3000) {
                    $this->reply($key, $chat, $link, 'گزارش باید بین ۱ تا ۳۰۰۰ نویسه باشد؛ دوباره وارد کنید.');

                    return;
                }
                $this->ownTask($user, $session->data['task_id']);
                $session->update(['step' => 'report_confirm', 'data' => [...$session->data, 'text' => $text]]);
                $this->reply($key, $chat, $link, "پیش‌نمایش گزارش:\n".$this->plain($text, 3000), [[['text' => 'تأیید ثبت', 'callback_data' => 'confirm:'.$session->nonce]]], 'task', $session->data['task_id']);
            } elseif (preg_match('/^tasks:(all|open|in_progress|completed|soon):(\d{1,5})$/', $action, $m)) {
                $session?->delete();
                $this->listTasks($key, $chat, $link, $user, $m[1], (int) $m[2]);
            } elseif ($action === 'tasks') {
                $session?->delete();
                $rows = [];
                foreach (['open' => 'وظایف باز', 'in_progress' => 'در حال انجام', 'completed' => 'تکمیل‌شده', 'soon' => 'مهلت نزدیک', 'all' => 'همه وظایف من'] as $filter => $label) {
                    $rows[] = [['text' => $label, 'callback_data' => 'tasks:'.$filter.':0']];
                }
                $this->reply($key, $chat, $link, 'وظایف من', $rows);
            } elseif (preg_match('/^task:(\d{1,18})$/', $action, $m)) {
                $session?->delete();
                $task = $this->ownTask($user, $m[1]);
                $body = $this->plain($task->title, 255)."\n".$this->plain($task->description ?? '', 1800)
                    ."\nوضعیت: ".(self::LABELS[$task->status] ?? $task->status)
                    ."\nمهلت: ".($task->deadline?->toDateString() ?? 'ندارد')
                    ."\nاولویت: ".$task->priority;
                $buttons = [[['text' => 'ثبت گزارش', 'callback_data' => 'report:'.$task->id]]];
                // Content task state is controlled by the content-stage workflow, not an independent bot menu.
                if (! $task->content_id && in_array($task->kind, [null, 'general'], true)) {
                    $buttons[] = [['text' => 'تغییر وضعیت', 'callback_data' => 'status:'.$task->id]];
                } else {
                    $body .= "\nتغییر مرحلهٔ این وظیفه محتوایی را در پنل انجام دهید.";
                }
                $this->reply($key, $chat, $link, $body, $buttons, 'task', $task->id);
            } elseif (preg_match('/^report:(\d{1,18})$/', $action, $m)) {
                $task = $this->ownTask($user, $m[1]);
                $this->session($link, 'report_text', ['task_id' => $task->id]);
                $this->reply($key, $chat, $link, 'متن گزارش را بنویسید. قبل از ثبت، پیش‌نمایش و تأیید نمایش داده می‌شود.', [], 'task', $task->id);
            } elseif (preg_match('/^status:(\d{1,18})$/', $action, $m)) {
                $task = $this->ownTask($user, $m[1]);
                abort_if($task->content_id || ! in_array($task->kind, [null, 'general'], true), 403);
                $session = $this->session($link, 'status_select', ['task_id' => $task->id, 'expected_status' => $task->status]);
                $rows = [];
                foreach ($this->tasks->allowedStatuses($user, $task) as $status) {
                    if ($status !== $task->status) {
                        $rows[] = [['text' => self::LABELS[$status], 'callback_data' => 'choose:'.$session->nonce.':'.$status]];
                    }
                }
                $this->reply($key, $chat, $link, 'وضعیت جدید را انتخاب کنید.', $rows, 'task', $task->id);
            } elseif (preg_match('/^choose:([a-f0-9]{24}):([a-z_]{1,15})$/', $action, $m)) {
                abort_unless($session?->step === 'status_select' && hash_equals($session->nonce, $m[1]), 409);
                $task = $this->ownTask($user, $session->data['task_id']);
                abort_unless(in_array($m[2], $this->tasks->allowedStatuses($user, $task), true), 403);
                $session->update(['step' => 'status_confirm', 'data' => [...$session->data, 'status' => $m[2]]]);
                $this->reply($key, $chat, $link, 'تغییر وضعیت به «'.self::LABELS[$m[2]].'» را تأیید می‌کنید؟', [[['text' => 'تأیید تغییر', 'callback_data' => 'confirm:'.$session->nonce]]], 'task', $task->id);
            } elseif (preg_match('/^projects:(\d{1,5})$/', $action, $m)) {
                $session?->delete();
                $projects = $this->projects($user)->orderByDesc('id')->offset((int) $m[1] * 5)->limit(6)->get();
                $rows = $projects->take(5)->map(fn ($p) => [['text' => mb_substr($p->name, 0, 60), 'callback_data' => 'project:'.$p->id]])->all();
                $this->pages($rows, 'projects:', (int) $m[1], $projects->count() > 5);
                $this->reply($key, $chat, $link, 'پروژه‌های مرتبط با شما', $rows, 'projects', null, $projects->take(5)->pluck('id')->all());
            } elseif (preg_match('/^project:(\d{1,18})$/', $action, $m)) {
                $session?->delete();
                $project = $this->projects($user)->whereKey($m[1])->first();
                abort_unless($project, 404);
                $this->reply($key, $chat, $link, $this->plain($project->name, 255)."\n".$this->plain($project->description ?? '', 2000)."\nوضعیت: ".$project->status, [], 'project', $project->id);
            } elseif ($action === 'profile') {
                $session?->delete();
                $this->reply($key, $chat, $link, $this->plain($user->name, 150)."\nحساب شما به تدبیر متصل است.", [[['text' => 'قطع اتصال حساب', 'callback_data' => 'unlink']]]);
            } elseif ($action === 'unlink') {
                $session = $this->session($link, 'unlink', []);
                $this->reply($key, $chat, $link, 'اتصال حساب قطع شود؟', [[['text' => 'بله، قطع اتصال', 'callback_data' => 'confirm:'.$session->nonce]]]);
            } elseif (in_array($action, ['notifications', 'meetings', 'assets'], true)) {
                $session?->delete();
                $this->reply($key, $chat, $link, 'این بخش هنوز در ربات فعال نشده است. لطفاً از پنل تدبیر استفاده کنید. یادآوری خودکار بدون زمان‌بند بیرونی فعال نیست.');
            } elseif ($action === 'help') {
                $session?->delete();
                $this->reply($key, $chat, $link, 'از دکمه‌ها استفاده کنید. متن فقط برای کد اتصال و گزارش وظیفه پذیرفته می‌شود. بازگشت یا لغو، فرم جاری را پاک می‌کند. در حالت دستی، پیام‌ها فقط هنگام اجرای پردازش در پنل دریافت می‌شوند.');
            } else {
                $this->home($key, $chat, $link);
            }
        } catch (HttpException $e) {
            if (! in_array($e->getStatusCode(), [403, 404, 409, 422], true)) {
                throw $e;
            }
            $this->reply($key, $chat, $link, 'این مورد در دسترس نیست، مجوز شما تغییر کرده یا فرم قدیمی شده است. از منوی اصلی دوباره انتخاب کنید.');
        }
    }

    private function confirm(string $key, string $chat, BaleUserLink $link, User $user, ?BaleConversation $session, string $nonce): void
    {
        abort_unless($session && hash_equals($session->nonce, $nonce), 409);
        if ($session->step === 'unlink') {
            $this->linker->disconnect($user);
            $this->reply($key, $chat, null, 'اتصال قطع شد. برای اتصال دوباره، از پروفایل تدبیر کد جدید بگیرید.');

            return;
        }
        abort_unless(in_array($session->step, ['report_confirm', 'status_confirm'], true), 409);
        $task = $this->ownTask($user, $session->data['task_id']);
        if ($session->step === 'report_confirm') {
            $comment = $this->tasks->report($user, $task, $session->data['text'], 'bale');
            $result = 'گزارش شماره '.$comment->id.' ثبت شد. زمان: '.$comment->created_at->toIso8601String();
        } else {
            abort_if($task->content_id || ! in_array($task->kind, [null, 'general'], true), 403);
            $task = $this->tasks->changeStatus($user, $task, $session->data['status'], $session->data['expected_status'], 'bale');
            $result = 'وضعیت جدید: '.self::LABELS[$task->status];
        }
        $session->delete();
        $this->reply($key, $chat, $link, $result, [], 'task', $task->id);
    }

    private function listTasks(string $key, string $chat, BaleUserLink $link, User $user, string $filter, int $page): void
    {
        abort_unless($user->hasPermission('tasks.view'), 403);
        $query = Task::where('assignee_id', $user->id);
        match ($filter) {
            'open' => $query->whereIn('status', ['backlog', 'todo', 'review']),
            'in_progress', 'completed' => $query->where('status', $filter),
            'soon' => $query->whereNotIn('status', ['completed', 'archived'])->whereBetween('deadline', [now()->toDateString(), now()->addDays(3)->toDateString()]),
            default => null,
        };
        $tasks = $query->orderByDesc('id')->offset($page * 5)->limit(6)->get();
        $rows = $tasks->take(5)->map(fn ($t) => [['text' => mb_substr($t->title, 0, 50).' · '.(self::LABELS[$t->status] ?? ''), 'callback_data' => 'task:'.$t->id]])->all();
        $this->pages($rows, 'tasks:'.$filter.':', $page, $tasks->count() > 5);
        $this->reply($key, $chat, $link, $tasks->isEmpty() ? 'وظیفه‌ای در این صفحه نیست.' : 'وظایف واگذارشده به شما — صفحه '.($page + 1), $rows, 'tasks', null, $tasks->take(5)->pluck('id')->all());
    }

    private function ownTask(User $user, int|string $id): Task
    {
        abort_unless($user->hasPermission('tasks.view'), 403);
        $task = Task::whereKey($id)->where('assignee_id', $user->id)->first();
        abort_unless($task, 404);

        return $task;
    }

    private function projects(User $user): Builder
    {
        abort_unless($user->hasPermission('projects.view'), 403);

        return Project::where(fn ($q) => $q->where('project_manager_id', $user->id)->orWhereHas('members', fn ($q) => $q->where('users.id', $user->id)));
    }

    private function session(BaleUserLink $link, string $step, array $data): BaleConversation
    {
        return BaleConversation::updateOrCreate(['link_id' => $link->id], [
            'step' => $step, 'nonce' => bin2hex(random_bytes(12)), 'data' => $data,
            'expires_at' => now()->addMinutes(config('bale.session_lifetime_minutes')),
        ]);
    }

    private function home(string $key, string $chat, BaleUserLink $link): void
    {
        $rows = [];
        foreach (['tasks' => 'وظایف من', 'notifications' => 'اعلان‌ها (در پنل)', 'meetings' => 'جلسات (در پنل)', 'assets' => 'دارایی‌ها (در پنل)', 'projects:0' => 'پروژه‌های من', 'profile' => 'پروفایل و تنظیمات', 'help' => 'راهنما'] as $action => $label) {
            $rows[] = [['text' => $label, 'callback_data' => $action]];
        }
        $this->reply($key, $chat, $link, 'به تدبیر خوش آمدید. یک گزینه انتخاب کنید.', $rows);
    }

    private function pages(array &$rows, string $prefix, int $page, bool $more): void
    {
        $buttons = [];
        if ($page > 0) {
            $buttons[] = ['text' => 'صفحه قبل', 'callback_data' => $prefix.($page - 1)];
        }
        if ($more) {
            $buttons[] = ['text' => 'صفحه بعد', 'callback_data' => $prefix.($page + 1)];
        }
        if ($buttons) {
            $rows[] = $buttons;
        }
    }

    private function reply(string $key, string $chat, ?BaleUserLink $link, string $text, array $rows = [], ?string $type = null, ?int $id = null, array $ids = []): void
    {
        $rows[] = [['text' => 'بازگشت به منو', 'callback_data' => 'home'], ['text' => 'لغو', 'callback_data' => 'cancel']];
        $url = (string) config('bale.panel_url');
        if (filter_var($url, FILTER_VALIDATE_URL) && str_starts_with($url, 'https://')) {
            $rows[] = [['text' => 'ورود به پنل تدبیر', 'url' => $url]];
        }
        $this->outbox->enqueue($key, $chat, ['text' => $text, 'reply_markup' => ['inline_keyboard' => $rows], '_subject_ids' => $ids], $link, $type, $id);
    }

    private function validId(mixed $id): bool
    {
        return (is_int($id) || is_string($id)) && preg_match('/^[0-9]{1,20}$/', (string) $id);
    }

    private function plain(string $text, int $max): string
    {
        // Bale formats Markdown automatically; do not allow user-created links or formatting.
        return mb_substr(str_replace(['[', ']', '(', ')', '*', '_', '`'], ['［', '］', '（', '）', '＊', '＿', 'ˋ'], $text), 0, $max);
    }
}
