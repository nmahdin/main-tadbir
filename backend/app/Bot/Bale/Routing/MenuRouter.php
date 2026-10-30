<?php

namespace App\Bot\Bale\Routing;

use App\Bot\Bale\Auth\AccountLinker;
use App\Bot\Bale\Automations;
use App\Bot\Bale\Handlers\ContentPublishInfo;
use App\Bot\Bale\Handlers\ContentStageOutputs;
use App\Bot\Bale\Handlers\OperationalMenus;
use App\Bot\Bale\Handlers\TaskAssets;
use App\Bot\Bale\Outbox;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\MenuNavigation;
use App\Bot\Bale\Support\ConversationCheckpoint;
use App\Bot\Bale\Support\OperationsSchema;
use App\Bot\Bale\Support\IncomingFile;
use App\Bot\Bale\Support\PanelLinks;
use App\Bot\Bale\Support\PersianDate;
use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\Access\UserPermissionGate;
use App\Services\Organization\DepartmentConsolidation;
use App\Support\OrganizationTime;
use App\Services\ContentPublication;
use App\Services\TaskOperations;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class MenuRouter
{
    private const LABELS = ['backlog' => 'در صف بررسی', 'in_progress' => 'در حال انجام', 'review' => 'بازبینی', 'completed' => 'تکمیل‌شده', 'archived' => 'بایگانی'];

    public function __construct(
        private AccountLinker $linker,
        private Outbox $outbox,
        private Settings $settings,
        private TaskOperations $tasks,
        private UserPermissionGate $permissions,
    ) {}

    /** Invoked through UpdateProcessor, after transport authentication and under RuntimeLock. */
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
        // پرونده‌ای که کاربر در خودِ گفتگو فرستاده است (سند یا تصویر).
        $incomingFile = $callback ? null : app(IncomingFile::class)->describe($message);
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
        $callbackMessageId = $callback['message']['message_id'] ?? null;
        if ($callback && (is_int($callbackMessageId) || (is_string($callbackMessageId) && ctype_digit($callbackMessageId)))
            && (int) $callbackMessageId > 0 && (int) $callbackMessageId < PHP_INT_MAX) {
            $this->outbox->enqueueCallbackCleanup($key.':cleanup', $chat, (int) $callbackMessageId, $link);
        }
        $session = BaleConversation::where('link_id', $link->id)->first();
        if ($session && $session->expires_at->lte(now())) {
            $session->delete();
            $session = null;
        }
        // A prompt already sent to Bale may outlive an unexpectedly missing
        // conversation row (e.g. a background cleanup/deployment). Recover
        // only the newest non-terminal, non-expired encrypted checkpoint.
        // Explicit navigation always wins; never revive after /menu or /cancel.
        if (! $session
            && ! in_array($action, ['home', 'cancel'], true)
            && ! (! $callback && in_array(app(Automations::class)->normalize($text), ['/start', '/menu', '/cancel'], true))) {
            $session = app(ConversationCheckpoint::class)->recover(
                $link, $chat, (string) $this->settings->read()['bot_id']
            );
        }
        // جریانِ باز نفس می‌کشد: با هر تعامل، عمرش تمدید می‌شود تا کاربر در
        // میانهٔ نوشتنِ متن یا فرستادنِ فایل، خود را در منوی اصلی نبیند.
        MenuNavigation::touch($session);

        try {
            app(DepartmentConsolidation::class)->requireReady();
            $automations = app(Automations::class);
            $reserved = ! $callback && in_array($automations->normalize($text), ['/start', '/menu', '/cancel'], true);
            // شناسهٔ خودکارسازی فقط برای دکمه‌های «تأیید/انتخاب» معنا دارد؛ متنِ
            // فیلدها با همان مرحلهٔ فرمِ باز سنجیده می‌شود. پیش‌تر اگر قاعده
            // میانِ فرم ویرایش می‌شد، پاسخِ فیلد با ۴۰۹ بسته و نشست پاک می‌شد و
            // پیام بعدی کاربر «منوی اصلی» می‌آمد.
            $identity = $callback && MenuNavigation::drafting($session)
                && preg_match('/^(confirm|assetpick|priority|choose):/', $action)
                ? ($session?->data['_automation'] ?? null) : null;
            if ($identity && ! $automations->valid($identity, $user)) {
                // قاعده میانِ فرم غیرفعال، حذف یا از دسترس خارج شده است: پیش‌نویس
                // بی‌اعتبار می‌شود و صریح گفته می‌شود، نه با پیامِ عمومی.
                $session?->delete();
                $this->reply($key, $chat, $link, '⚠️ قاعدهٔ خودکارسازیِ این فرم تغییر کرده، غیرفعال شده یا دسترسی شما به آن تغییر کرده است؛ فرم بسته شد. از منوی اصلی دوباره شروع کنید.');

                return;
            }
            // دکمهٔ «لغو فرم و ادامه»: همان دکمه‌ای که وسطِ فرم مسدود شده بود،
            // با یک تأیید صریح اجرا می‌شود. اقدامِ داخلِ آن فقط callback_data
            // ساده است و دوباره اعتبارسنجی می‌شود.
            if ($callback && preg_match('/^flowdrop:([A-Za-z0-9:_-]{1,55})$/', (string) $action, $drop)) {
                $session?->delete();
                $session = null;
                $action = $drop[1];
            }
            // جریانِ ناتمام تا پایان یا تا «لغو/بازگشت به منو» زنده است: کلیک روی
            // دکمه‌های بخش‌های دیگر، پیش‌نویس را پاک نمی‌کند.
            // Current-step callbacks only. An old notification, stale menu, or
            // action for a different form must not overwrite the user's draft.
            // Navigation out of the flow always needs an explicit home/cancel
            // or the separate "لغو فرم و ادامه" confirmation.
            if ($callback && MenuNavigation::active($session)
                && ! in_array($action, ['home', 'cancel'], true)
                && ! MenuNavigation::acceptsCallback($session, (string) $action)) {
                $this->flowReminder($key, $chat, $link, $session, (string) $action);

                return;
            }
            if (! $callback && ! $reserved && str_starts_with($text, '/') && MenuNavigation::active($session)) {
                $this->reply($key, $chat, $link, 'فرم جاری باز است. ابتدا آن را تکمیل کنید یا با /cancel لغو کنید؛ سپس فرمان جدید را بفرستید.');

                return;
            }
            $rule = ! $callback && ! $reserved ? $automations->match($text, $user, $link, $session) : null;
            if ($rule) {
                $session?->delete();
                $session = null;
                $action = $automations->action($rule);
            }
            $this->authorizeAction($user, $action, $session);
            if ($incomingFile) {
                // پرونده در فرمِ باز (ثبت دارایی یا ثبت خروجیِ مرحله) و حتی بدون
                // فرم پذیرفته می‌شود: اگر کاربر همین‌طور عکس یا فایل بفرستد، جریانِ
                // «ثبت دارایی» خودش باز می‌شود. فقط وقتی جریانِ *دیگری* باز است،
                // چیزی ذخیره نمی‌شود تا پیش‌نویس فعلی از دست نرود.
                $uploads = $this->permissions->all($user, ['assets.view', 'assets.upload']);
                $drafting = MenuNavigation::drafting($session);
                if (! $drafting && ! $uploads) {
                    $this->reply($key, $chat, $link, 'برای ثبت پرونده در تدبیر به مجوز «مشاهدهٔ دارایی‌ها» و «بارگذاری دارایی» نیاز دارید؛ از مدیر بخواهید مجوز را بدهد.');
                } elseif (! $drafting) {
                    $session = $this->session($link, 'asset_file', ['task_id' => null]);
                }
                $handled = $drafting || $session
                    ? (app(TaskAssets::class)->receiveFile($key, $chat, $link, $user, $session, $incomingFile)
                        || app(ContentStageOutputs::class)->receiveFile($key, $chat, $link, $user, $session, $incomingFile))
                    : false;
                if ($drafting && ! $handled) {
                    $this->reply($key, $chat, $link, 'این پرونده در «'.MenuNavigation::label($session).'» ثبت نمی‌شود. فرم جاری محفوظ است؛ برای ثبت فایل ابتدا «لغو» را بزنید یا از همان وظیفه «ثبت خروجی محتوا» را انتخاب کنید.');
                }

                return;
            }
            if ($rule && $action === 'automation_reply') {
                $this->reply($key, $chat, $link, $this->plain($rule['response'], 3000));
            } elseif ($action === 'cancel' || $action === 'home' || $reserved) {
                $session?->delete();
                $this->home($key, $chat, $link);
            } elseif (app(TaskAssets::class)->handle($key, $chat, $link, $user, $session, $action, ($callback || $rule) ? null : $text)) {
                // Text assets use the existing DAM service and explicit confirmation.
            } elseif (app(ContentStageOutputs::class)->handle($key, $chat, $link, $user, $session, $action, ($callback || $rule) ? null : $text)) {
                // ثبت خروجیِ مرحلهٔ محتوا از بات؛ همان مسیرِ پنل با تأییدِ کاربر.
            } elseif (app(ContentPublishInfo::class)->handle($key, $chat, $link, $user, $session, $action)) {
                // اطلاعات انتشار محتوا برای وظیفه‌های انتشار (خروجی‌ها و کپشن).
            } elseif (app(OperationalMenus::class)->handle($key, $chat, $link, $user, $session, $action, ($callback || $rule) ? null : $text)) {
                // Extended forms share this update transaction and outbox.
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
                $this->listTasks($key, $chat, $link, $user, 'all', 0);
            } elseif ($action === 'taskfilters') {
                $session?->delete();
                $rows = [];
                foreach (['open' => 'وظایف باز', 'in_progress' => 'در حال انجام', 'soon' => 'مهلت نزدیک', 'all' => 'همه وظایف باز من'] as $filter => $label) {
                    $rows[] = [['text' => $label, 'callback_data' => 'tasks:'.$filter.':0']];
                }
                $this->reply($key, $chat, $link, 'وظایف من', $rows);
            } elseif (preg_match('/^task:(\d{1,18})$/', $action, $m)) {
                $session?->delete();
                $task = $this->ownTask($user, $m[1]);
                $priority = ['low' => 'کم', 'medium' => 'متوسط', 'high' => 'زیاد', 'urgent' => 'فوری'][$task->priority] ?? 'نامشخص';
                $body = '📌 *'.$this->plain($task->title, 255)."* \n\n"
                    .'🏷 وضعیت: '.(self::LABELS[$task->status] ?? 'نامشخص')
                    ."\n📅 مهلت: ".PersianDate::format($task->deadline)
                    ."\n⚡ اولویت: ".$priority
                    ."\n\n📝 *توضیحات* \n".$this->plain($task->description ?: 'توضیحی ثبت نشده است.', 1800);
                $buttons = [];
                // وظیفه‌ای که به پروندهٔ محتوا وصل است، بخشِ پیوست ندارد: خروجیِ
                // آن در همان مرحلهٔ جریان محتوا ثبت می‌شود (داراییِ پراکنده در
                // اینجا معنا ندارد).
                if (! $task->content_id && $this->permissions->any($user, 'assets.view')) {
                    $buttons[] = [['text' => '📎 ثبت دارایی', 'callback_data' => 'taskasset:'.$task->id]];
                }
                // ثبت خروجیِ مرحلهٔ محتوا مستقیم از همین بات.
                if ($task->content_id && $task->content_stage_id && app(ContentStageOutputs::class)->stageOf($task)) {
                    $buttons[] = [['text' => '📤 ثبت خروجی محتوا', 'callback_data' => 'pubout:'.$task->id]];
                }
                if (app(ContentPublishInfo::class)->publishContent($task)) {
                    $buttons[] = [['text' => '📣 اطلاعات انتشار', 'callback_data' => 'pubinfo:'.$task->id]];
                }
                if ($this->tasks->editable($user, $task)) {
                    $buttons[] = [['text' => 'ویرایش مشخصات', 'callback_data' => 'edit:'.$task->id]];
                }
                // منوی تغییر وضعیت حذف شده است: وظیفه مستقیم و با تأیید تکمیل
                // می‌شود (وضعیتِ وظیفه‌های محتوایی را همان جریان محتوا پیش می‌برد).
                $completable = ! in_array($task->status, ['completed', 'archived'], true)
                    && ! ($task->content_id && in_array($task->kind, [null, 'general'], true));
                if ($completable) {
                    $buttons[] = [['text' => '✅ تکمیل وظیفه', 'callback_data' => 'done:'.$task->id]];
                } elseif (in_array($task->status, ['completed', 'archived'], true)) {
                    $body .= "\nاین وظیفه تکمیل شده است.";
                } else {
                    $body .= "\nتکمیل این وظیفهٔ محتوایی را در پنل انجام دهید.";
                }
                // برای وظیفهٔ متصل به محتوا، دکمهٔ سامانه همان پروندهٔ محتوا را
                // باز می‌کند (نه برگهٔ وظیفه را).
                $panel = is_numeric($task->content_id) ? ['content', (int) $task->content_id] : null;
                $this->reply($key, $chat, $link, $body, $buttons, 'task', $task->id, [], false, $panel);
            } elseif (preg_match('/^report:(\d{1,18})$/', $action, $m)) {
                $task = $this->ownTask($user, $m[1]);
                $this->session($link, 'report_text', ['task_id' => $task->id]);
                $this->reply($key, $chat, $link, 'متن گزارش را بنویسید. قبل از ثبت، پیش‌نمایش و تأیید نمایش داده می‌شود.', [], 'task', $task->id);
            } elseif (preg_match('/^done:(\d{1,18})$/', $action, $m)) {
                $task = $this->ownTask($user, $m[1]);
                abort_if(in_array($task->status, ['completed', 'archived'], true), 409, 'این وظیفه پیش‌تر تکمیل شده است.');
                // وظیفهٔ عمومیِ متصل به محتوا را همان جریان محتوا در پنل پیش می‌برد.
                abort_if($task->content_id && in_array($task->kind, [null, 'general'], true), 403, 'تکمیل این وظیفه در پنل انجام می‌شود.');
                // وظیفهٔ انتشارِ محتوا با تکمیل، همان انتشار را ثبت می‌کند؛ پس
                // مجوزِ انتشار پیش از نمایشِ دکمهٔ تأیید سنجیده می‌شود.
                if ($task->kind === ContentPublication::KIND && ! $user->hasPermission('content.publish')) {
                    $this->reply($key, $chat, $link, 'تکمیل این وظیفه یعنی ثبت انتشار محتوا و به مجوز «انتشار محتوا» نیاز دارد.',
                        [[['text' => '↩️ بازگشت به تسک', 'callback_data' => 'task:'.$task->id]]], 'task', $task->id);

                    return;
                }
                $session = $this->session($link, 'done_confirm', ['task_id' => $task->id, 'expected_status' => $task->status]);
                $note = $task->content_id && $task->content_stage_id
                    ? "\nبا تکمیل، همان مرحلهٔ جریان محتوا هم پیش می‌رود."
                    : '';
                $this->reply($key, $chat, $link, 'تکمیل وظیفهٔ «'.$this->plain($task->title, 120).'» تأیید شود؟'.$note,
                    [[['text' => '✅ تأیید تکمیل', 'callback_data' => 'confirm:'.$session->nonce]],
                        [['text' => 'انصراف', 'callback_data' => 'task:'.$task->id]]], 'task', $task->id);
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
                if (! $session || ! in_array($session->step, ['status_select', 'status_confirm'], true)) {
                    $this->reply($key, $chat, $link, '⏳ فرم تغییر وضعیت بسته یا منقضی شده است (S01). تسک را دوباره باز کنید.', [[['text' => 'وظایف من', 'callback_data' => 'tasks']]]);

                    return;
                }
                if (! hash_equals($session->nonce, $m[1])) {
                    $this->reply($key, $chat, $link, '🔄 این دکمه مربوط به فرم قبلی است (S02). از جدیدترین پیام تغییر وضعیت استفاده کنید.', [[['text' => 'باز کردن تسک', 'callback_data' => 'task:'.$session->data['task_id']]]]);

                    return;
                }
                if ($session->step === 'status_confirm' && ($session->data['status'] ?? '') !== $m[2]) {
                    $this->reply($key, $chat, $link, 'وضعیتی قبلاً انتخاب شده است (S03). برای انتخاب دیگری، فرم را دوباره باز کنید.', [[['text' => 'انتخاب مجدد وضعیت', 'callback_data' => 'status:'.$session->data['task_id']]]]);

                    return;
                }
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
                $this->reply($key, $chat, $link, '👤 *'.$this->plain($user->name, 150)."* \n\n🛡 نقش: ".$this->plain($user->role?->name ?? $user->role_key ?? 'تعیین نشده', 120)."\n🔗 حساب متصل به تدبیر\n🔔 دریافت اعلان: ".($link->notifications_enabled ? 'روشن' : 'خاموش'), [[['text' => 'قطع اتصال حساب', 'callback_data' => 'unlink']]]);
            } elseif ($action === 'unlink') {
                $session = $this->session($link, 'unlink', []);
                $this->reply($key, $chat, $link, 'اتصال حساب قطع شود؟', [[['text' => 'بله، قطع اتصال', 'callback_data' => 'confirm:'.$session->nonce]]]);
            } elseif ($action === 'help') {
                $session?->delete();
                $this->reply($key, $chat, $link, 'از دکمه‌ها استفاده کنید. متن فقط در فرم فعال (گزارش، ویرایش وظیفه یا ثبت دارایی) و اتصال حساب پذیرفته می‌شود. بازگشت یا لغو، فرم جاری را پاک می‌کند. پیام‌ها با Webhook امن دریافت می‌شوند و تلاش مجدد ارسال توسط scheduler سامانه انجام می‌شود.');
            } elseif (! $callback && MenuNavigation::active($session)) {
                // جریان باز است و این پاسخ به آن نمی‌خورد: راهنمای همان مرحله
                // گفته می‌شود تا کاربر بداند چه بفرستد؛ پیش‌نویس حفظ می‌شود.
                // (شاملِ صفحهٔ انتخاب جدول که پاسخِ متنی نمی‌گیرد.)
                $this->reply($key, $chat, $link, '⏳ جریانِ «'.MenuNavigation::label($session).'» باز است. '
                    .MenuNavigation::hint($session));
            } elseif (! $callback && str_starts_with($text, '/')) {
                // فرمانی که هیچ قاعده‌ای آن را تعریف نکرده است: پیش‌تر پیامِ
                // خوش‌آمدگویی می‌آمد و کاربر فکر می‌کرد خودکارسازی خراب است.
                $this->reply($key, $chat, $link, 'این فرمان در خودکارسازی ربات تعریف نشده است. اگر تازه ساخته‌اید، «فعال» بودن قاعده و ذخیرهٔ آن را در تنظیمات ← بله ← خودکارسازی بررسی کنید.',
                    [[['text' => 'منوی اصلی', 'callback_data' => 'home']]]);
            } elseif ($callback) {
                // دکمه‌ای که به هیچ مسیرِ زنده‌ای نمی‌خورد (پیامِ کهنه یا فرمِ
                // جایگزین‌شده). پیش‌تر پاسخش «منوی اصلی» بود و کاربر وسطِ کار،
                // جریانش را از دست‌رفته می‌دید؛ حالا اگر جریانی باز است، همان
                // جریان حفظ می‌شود و توضیح + راهِ ادامه داده می‌شود.
                $this->staleButton($key, $chat, $link, $session);
            } else {
                // Arbitrary text is not permission to restart the bot.
                // Only /start, /menu or the explicit home button show the menu.
                $this->reply($key, $chat, $link,
                    'برای شروع، /menu را بفرستید. اگر در حال تکمیل فرم بودید، پاسخ‌های آن باید در همان مرحله دریافت شوند.');
            }
            if ($rule) {
                $automations->tag($rule, $link, $key);
            } elseif ($identity) {
                $automations->tagMessage($identity, $key);
            }
        } catch (ValidationException $e) {
            // دلیلِ واقعیِ ردشدن مقدار گفته می‌شود؛ پیامِ عمومی کاربر را گیج می‌کرد.
            $this->rejectInput($key, $chat, $link, $session, collect($e->errors())->flatten()->first());
        } catch (HttpException $e) {
            if ($e->getStatusCode() === 429) {
                $this->reply($key, $chat, $link, 'تعداد درخواست‌ها زیاد است؛ یک دقیقه بعد دوباره تلاش کنید.');

                return;
            }
            if ($e->getStatusCode() === 503 && $e->getMessage() === OperationsSchema::MESSAGE) {
                $session?->delete();
                $this->reply($key, $chat, $link, '⚠️ نصب امکانات بله در دیتابیس کامل نیست؛ از مدیر بخواهید راهنمای تعمیر نصب بله را اجرا کند.');

                return;
            }
            if (! in_array($e->getStatusCode(), [403, 404, 409, 422], true)) {
                throw $e;
            }
            // خطای «مجوز/موجودیت» پیش‌نویس را بی‌اعتبار می‌کند و باید بسته شود؛
            // اما خطای نوع/مقدار/نسخه (۴۰۹ و ۴۲۲) جریان را باز نگه می‌دارد.
            // پیش‌تر هر خطایی نشست را پاک می‌کرد و کاربر «منوی اصلی» می‌گرفت.
            if (in_array($e->getStatusCode(), [403, 404], true)) {
                $keep = $session !== null;
                $session?->delete();
                $this->reply($key, $chat, $link, '⚠️ '.$this->httpReason($e).($keep ? ' فرم بسته شد؛ از منوی اصلی دوباره انتخاب کنید.' : ' دوباره تلاش کنید.'));

                return;
            }
            // خطاهایی که خودشان می‌گویند «دوباره شروع کنید» یعنی پیش‌نویس با
            // نسخهٔ تازه سازگار نیست (ویرایش هم‌زمان یا فرمِ کهنه)؛ فقط همان‌ها
            // فرم را می‌بندند. خطای دکمهٔ کهنه یا مقدار نامعتبر، فرم را باز
            // نگه می‌دارد.
            $this->rejectInput($key, $chat, $link, $session, $this->httpReason($e),
                (bool) preg_match('/(دوباره آن را باز کنید|دوباره شروع کنید|تغییر کرده است)/u', (string) $e->getMessage()));
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
        abort_unless(in_array($session->step, ['report_confirm', 'status_confirm', 'done_confirm'], true), 409);
        $task = $this->ownTask($user, $session->data['task_id']);
        if ($session->step === 'report_confirm') {
            $comment = $this->tasks->report($user, $task, $session->data['text'], 'bale');
            $result = 'گزارش شماره '.$comment->id.' ثبت شد. زمان: '.$comment->created_at->toIso8601String();
        } elseif ($session->step === 'done_confirm') {
            $task = $this->tasks->changeStatus($user, $task, 'completed', $session->data['expected_status'] ?? null, 'bale');
            $result = '✅ وظیفه تکمیل شد: '.(self::LABELS[$task->status] ?? $task->status);
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
        $this->permissions->authorizeAny($user, 'tasks.view');
        // وظیفه‌های تکمیل‌شده در هیچ فهرستی نمی‌آیند: کارتابلِ بات فقط کارهای
        // باز را نشان می‌دهد.
        $query = Task::where('assignee_id', $user->id)->whereNotIn('status', ['completed', 'archived']);
        match ($filter) {
            'open' => $query->whereIn('status', ['backlog', 'review']),
            'in_progress' => $query->where('status', $filter),
            'soon' => $query->whereBetween('deadline', [app(OrganizationTime::class)->date(), app(OrganizationTime::class)->now()->addDays(3)->toDateString()]),
            default => null,
        };
        $tasks = $query->orderByDesc('id')->offset($page * 5)->limit(6)->get();
        $rows = [];
        $body = '📋 *وظایف من* — صفحه '.PersianDate::digits($page + 1)."\n\n";
        foreach ($tasks->take(5) as $i => $task) {
            $number = PersianDate::digits($i + 1);
            $body .= $number.'. *'.$this->plain($task->title, 180)."* \n🏷 ".(self::LABELS[$task->status] ?? 'نامشخص').'  |  📅 '.PersianDate::format($task->deadline)."\n\n";
            $rows[] = [['text' => '🔎 جزئیات تسک '.$number.' · '.mb_substr($task->title, 0, 30), 'callback_data' => 'task:'.$task->id]];
        }
        $this->pages($rows, 'tasks:'.$filter.':', $page, $tasks->count() > 5);
        $rows[] = [['text' => '🔎 فیلتر وظایف', 'callback_data' => 'taskfilters']];
        $this->reply($key, $chat, $link, $tasks->isEmpty() ? '📋 وظیفه‌ای در این صفحه نیست.' : $body, $rows, 'tasks', null, $tasks->take(5)->pluck('id')->all());
    }

    private function ownTask(User $user, int|string $id): Task
    {
        return $this->tasks->ownForBale($user, $id);
    }

    private function projects(User $user): Builder
    {
        $this->permissions->authorizeAny($user, 'projects.view');

        return Project::where(fn ($q) => $q->where('project_manager_id', $user->id)->orWhereHas('members', fn ($q) => $q->where('users.id', $user->id)));
    }

    private function session(BaleUserLink $link, string $step, array $data): BaleConversation
    {
        return BaleConversation::updateOrCreate(['link_id' => $link->id], [
            'step' => $step, 'nonce' => bin2hex(random_bytes(12)), 'data' => $data,
            'expires_at' => MenuNavigation::lifetime(),
        ]);
    }

    private function authorizeAction(User $user, string $action, ?BaleConversation $session): void
    {
        $step = $session?->step ?? '';
        if (preg_match('/^(tasks(?::|$)|task(?::|$)|taskfilters$|report:|status:|choose:|done:|edit:|editfield:|priority:)/', $action)
            || in_array($step, ['report_text', 'report_confirm', 'status_select', 'status_confirm', 'done_confirm', 'edit_value', 'edit_confirm'], true)) {
            $this->permissions->authorizeAny($user, 'tasks.view');
        }
        if (preg_match('/^projects?(?::|$)/', $action)) {
            $this->permissions->authorizeAny($user, 'projects.view');
        }
        if (preg_match('/^meetings?(?::|$)/', $action)) {
            $this->permissions->authorizeAny($user, 'meetings.view');
        }
        if (preg_match('/^pub(info|file|cap|publish|confirm):/', $action)
            || preg_match('/^pubout(text|add|file)?:/', $action)
            || preg_match('/^(outdone|outmore):/', $action)
            || in_array($step, ['output_text', 'output_confirm', 'output_file', 'output_file_confirm', 'publish_confirm'], true)) {
            $this->permissions->authorizeAny($user, 'tasks.view');
        }
        if (preg_match('/^(assets?$|taskasset:|asset|department|tableform)/', $action)
            || str_starts_with($step, 'asset_') || str_starts_with($step, 'text_asset_')) {
            $this->permissions->authorizeAny($user, ['assets.view', 'assets.upload', 'assets.edit_info']);
        }
    }

    private function home(string $key, string $chat, BaleUserLink $link): void
    {
        $user = User::find($link->user_id);
        abort_unless($user?->isActive(), 403);
        $rows = [];
        foreach ([
            'tasks' => ['📋 وظایف من', 'tasks.view'],
            'meetings' => ['📅 جلسات من', 'meetings.view'],
        ] as $action => [$label, $permission]) {
            if ($this->permissions->any($user, $permission)) {
                $rows[] = [['text' => $label, 'callback_data' => $action]];
            }
        }
        // ثبت دارایی با هر یک از مجوزهای مشاهده، بارگذاری یا ویرایش دارایی در
        // دسترس است؛ سطحِ دقیقِ دسترسی همان‌جا در مخزن سنجیده می‌شود.
        if ($this->permissions->any($user, ['assets.view', 'assets.upload', 'assets.edit_info'])) {
            $rows[] = [['text' => '📎 ثبت دارایی', 'callback_data' => 'assets']];
        }
        $rows[] = [['text' => '👤 پروفایل و تنظیمات', 'callback_data' => 'profile']];
        $rows = [...$rows, ...app(PanelLinks::class)->panelButtons($link)];
        $this->reply($key, $chat, $link, 'به تدبیر خوش آمدید. فقط بخش‌های مجاز حساب شما نمایش داده شده‌اند و همهٔ دکمه‌ها در همین مینی‌اپِ تدبیر باز می‌شوند.', $rows, home: true);
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

    /**
     * دکمهٔ ناشناخته یا کهنه.
     *
     * اگر جریانی باز باشد، هرگز «منوی اصلی» فرستاده نمی‌شود: جریان دست‌نخورده
     * می‌ماند، دلیل گفته می‌شود و راهِ ادامه (همان راهنمای مرحله) نمایش داده
     * می‌شود. فقط وقتی هیچ جریانی باز نیست، منوی اصلی پاسخِ درست است.
     */
    private function staleButton(string $key, string $chat, BaleUserLink $link, ?BaleConversation $session): void
    {
        if (! $session) {
            $this->reply($key, $chat, $link, 'این دکمه مربوط به پیام قبلی است و دیگر معتبر نیست. برای دیدن منوی اصلی /menu را بفرستید.');

            return;
        }
        $this->reply($key, $chat, $link, '🔄 این دکمه به یکی از پیام‌های قبلی تعلق دارد و دیگر اجرا نمی‌شود. '
            .'جریانِ «'.MenuNavigation::label($session).'» باز است و اطلاعاتِ قبلی محفوظ مانده‌اند. '
            .MenuNavigation::hint($session));
    }

    /**
     * یادآوریِ جریانِ باز، همراه با دکمهٔ «لغو فرم و ادامه».
     *
     * دکمه‌های اعلان‌ها (مثل «ثبت خروجی محتوا» یا «تکمیل وظیفه») همیشه باید
     * کاری بکنند؛ پیش‌تر وسطِ یک فرم فقط یک یادآوری می‌آمد، همان پیامِ اعلان هم
     * پاک می‌شد و کاربر نمی‌دانست چطور به انتخابِ خودش برگردد. حالا همان انتخاب
     * با خودِ دکمه حمل می‌شود و یک ضربه، فرم را می‌بندد و آن را اجرا می‌کند.
     */
    private function flowReminder(string $key, string $chat, BaleUserLink $link, BaleConversation $session, string $action = ''): void
    {
        $rows = [];
        if ($action !== '' && preg_match('/^[A-Za-z0-9:_-]{1,55}$/', $action) && strlen('flowdrop:'.$action) <= 64) {
            $rows[] = [['text' => '🚪 لغو فرم و ادامه', 'callback_data' => 'flowdrop:'.$action]];
        }
        $this->reply($key, $chat, $link, '⏳ شما در میانهٔ «'.MenuNavigation::label($session).'» هستید و پیش‌نویس شما محفوظ است. '
            .MenuNavigation::hint($session).($rows === [] ? '' : ' برای اجرای همان گزینه، «لغو فرم و ادامه» را بزنید.')
            .' برای خروج «لغو» یا «بازگشت به منو» را بزنید.', $rows);
    }

    /**
     * ردشدنِ یک مقدار یا یک اقدام: دلیلِ واقعی گفته می‌شود و جریان باز می‌ماند.
     */
    private function rejectInput(string $key, string $chat, BaleUserLink $link, ?BaleConversation $session, ?string $reason, bool $stale = false): void
    {
        $reason = is_string($reason) ? trim($reason) : '';
        $reason = $reason !== '' ? $this->plain($reason, 400) : 'مقدار ارسالی پذیرفته نشد.';
        if (! MenuNavigation::drafting($session)) {
            // صفحهٔ انتخاب (مثل انتخاب جدول) هم جریان است؛ کاربر نباید به منوی
            // اصلی برگردد.
            $this->reply($key, $chat, $link, MenuNavigation::active($session)
                ? '⚠️ '.$reason.' جریانِ «'.MenuNavigation::label($session).'» باز است. '.MenuNavigation::hint($session)
                : '⚠️ '.$reason.' دوباره تلاش کنید یا از منوی اصلی گزینهٔ دیگری را انتخاب کنید.');

            return;
        }
        if ($stale) {
            // پیش‌نویس با نسخهٔ تازه سازگار نیست؛ نگه داشتنش فقط کاربر را گیر
            // می‌اندازد، پس صریح بسته می‌شود.
            $session->delete();
            $this->reply($key, $chat, $link, '⚠️ '.$reason.' فرمِ «'.MenuNavigation::label($session).'» بسته شد؛ از منوی اصلی دوباره شروع کنید.');

            return;
        }
        $this->reply($key, $chat, $link, '⚠️ '.$reason."\n".'جریانِ «'.MenuNavigation::label($session).'» باز است و پاسخ‌های قبلی حفظ شده‌اند؛ '
            .'مقدار اصلاح‌شده را دوباره بفرستید، همان دکمهٔ آخرین پیام را بزنید یا «لغو» را انتخاب کنید.');
    }

    /** دلیلِ خوانا برای خطاهای HTTP؛ پیام‌های فارسیِ خودِ سرویس مقدم هستند. */
    private function httpReason(HttpException $error): string
    {
        $message = trim($error->getMessage());
        if ($message !== '' && preg_match('/\p{Arabic}/u', $message)) {
            return $message;
        }

        return match ($error->getStatusCode()) {
            403 => 'مجوز لازم برای این اقدام را ندارید یا وظیفه در دسترس شما نیست.',
            404 => 'این مورد پیدا نشد یا پیش‌تر حذف شده است.',
            409 => 'این مرحله از فرم با وضعیت فعلی سازگار نیست.',
            422 => 'مقدار ارسالی با قواعد این فیلد سازگار نیست.',
            default => 'انجام این درخواست ممکن نشد.',
        };
    }

    /**
     * پیامِ روشن پس از خطای پردازشِ یک به‌روزرسانی.
     *
     * از `UpdateProcessor` صدا زده می‌شود؛ جریانِ باز پاک نمی‌شود و کاربر
     * می‌داند چه شد و چگونه ادامه دهد (پیش‌تر هیچ پیامی نمی‌آمد).
     */
    public function failureNotice(array $update, string $reason): void
    {
        $callback = $update['callback_query'] ?? null;
        $message = $callback['message'] ?? $update['message'] ?? null;
        $sender = $callback['from']['id'] ?? $message['from']['id'] ?? null;
        $chat = $message['chat']['id'] ?? null;
        if (($message['chat']['type'] ?? '') !== 'private' || ! $this->validId($sender) || ! $this->validId($chat)) {
            return;
        }
        $link = BaleUserLink::where('bale_user_id', (string) $sender)->first();
        if (! $link) {
            return;
        }
        $key = ((string) ($this->settings->read()['bot_id'] ?? '')).':'.$update['update_id'].':failed';
        $session = BaleConversation::where('link_id', $link->id)->first();
        $keep = MenuNavigation::drafting($session);
        $body = '⚠️ '.($reason !== '' ? $this->plain($reason, 300) : 'پردازش این پیام ناموفق بود.')."\n"
            .($keep
                ? 'جریانِ «'.MenuNavigation::label($session).'» باز مانده و پاسخ‌های قبلی حفظ شده‌اند؛ دوباره تلاش کنید یا «لغو» را بزنید.'
                : 'دوباره تلاش کنید یا از منوی اصلی گزینهٔ دیگری را انتخاب کنید.');
        $this->reply($key, (string) $chat, $link, $body);
    }

    /**
     * @param  array<int, int>  $ids
     * @param  ?array{0: string, 1: int}  $panel  مقصدِ دکمهٔ «باز کردن در سامانه»؛ برای وظیفه‌های محتوایی همان پروندهٔ محتواست.
     */
    private function reply(string $key, string $chat, ?BaleUserLink $link, string $text, array $rows = [], ?string $type = null, ?int $id = null, array $ids = [], bool $home = false, ?array $panel = null): void
    {
        $rows = [...$rows, ...MenuNavigation::rows($link, $home)];
        $rows = [...$rows, ...app(PanelLinks::class)->buttons($link, $panel[0] ?? $type, $panel[1] ?? $id)];
        $this->outbox->enqueue($key, $chat, ['text' => $text, ...($rows ? ['reply_markup' => ['inline_keyboard' => $rows]] : []), '_subject_ids' => $ids], $link, $type, $id);
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
