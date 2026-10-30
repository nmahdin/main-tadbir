<?php

namespace App\Bot\Bale;

use App\Bot\Bale\Support\MenuNavigation;
use App\Bot\Bale\Support\OperationsSchema;
use App\Models\BaleConversation;
use App\Models\BaleOutbox;
use App\Models\BaleUserLink;
use App\Models\DamDataTable;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\Access\UserPermissionGate;
use App\Services\DamTableAccess;
use App\Services\DamTableRows;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

/** Declarative allowlisted actions, never arbitrary PHP, SQL, URLs or callback data. */
final class Automations
{
    public const KEY = 'bale_automations_private';

    public const ACTIONS = ['reply', 'table_row', 'asset_text', 'asset_file', 'assets', 'tasks', 'meetings'];

    private const RESERVED = ['/start', '/menu', '/cancel', '/help'];

    public function read(): array
    {
        return SystemSetting::where('key', self::KEY)->first()?->value ?? ['revision' => 0, 'rules' => []];
    }

    /**
     * نرمال‌سازی یکسانِ محرک و متنِ ورودی.
     *
     * قاعده با همین تابع ذخیره و با همین تابع تطبیق داده می‌شود، پس هر تغییری
     * دوطرفه است: نویسه‌های نامرئی (نیم‌فاصله، جهت‌دهنده‌ها، BOM و کشیده) حذف
     * می‌شوند، ارقام عربی/فارسی به لاتین برمی‌گردند و نامِ ربات از فرمان
     * برداشته می‌شود؛ پیش‌تر «/revayat@my_bot» یا متنی که نیم‌فاصلهٔ متفاوت
     * داشت هیچ‌وقت با قاعده تطبیق نمی‌خورد و بات بی‌پاسخ می‌ماند.
     */
    public function normalize(string $text): string
    {
        $text = trim($text);
        if (str_starts_with($text, '/')) {
            // «/revayat@tadbir_bot» همان «/revayat» است.
            $text = preg_replace('~^(/[^\s@]+)@\S+~u', '$1', $text) ?? $text;
        }
        $text = preg_replace('/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}\x{FEFF}\x{0640}\x{200C}]/u', '', $text) ?? $text;
        $text = strtr($text, [
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            'ي' => 'ی', 'ك' => 'ک',
        ]);

        return mb_strtolower(trim(preg_replace('/\s+/u', ' ', $text)));
    }

    public function save(User $actor, array $input): void
    {
        $data = Validator::make($input, [
            'revision' => ['required', 'integer', 'min:0'],
            'rules' => ['present', 'array', 'max:40'],
            'rules.*' => ['array:id,name,enabled,trigger_type,trigger,action,response,table_id,department_id'],
            'rules.*.id' => ['required', 'uuid', 'distinct'],
            'rules.*.name' => ['required', 'string', 'max:100'],
            'rules.*.enabled' => ['required', 'boolean'],
            'rules.*.trigger_type' => ['required', Rule::in(['command', 'text'])],
            'rules.*.trigger' => ['required', 'string', 'max:200'],
            'rules.*.action' => ['required', Rule::in(self::ACTIONS)],
            'rules.*.response' => ['nullable', 'string', 'max:3000'],
            'rules.*.table_id' => ['nullable', 'integer', 'min:1'],
            // سازگاری عقب‌رو: دپارتمان دیگر بخشی از قاعده نیست و نادیده گرفته می‌شود.
            'rules.*.department_id' => ['nullable', 'integer', 'min:0'],
        ])->validate();
        $data['revision'] = (int) $data['revision'];
        $seen = [];
        foreach ($data['rules'] as $i => &$rule) {
            $rule['enabled'] = (bool) $rule['enabled'];
            $rule['trigger'] = $this->normalize($rule['trigger']);
            $command = $rule['trigger_type'] === 'command';
            if ($rule['trigger'] === '' || ($command && ! preg_match('~^/[a-z][a-z0-9_]{0,31}$~D', $rule['trigger']))
                || (! $command && str_starts_with($rule['trigger'], '/')) || in_array($rule['trigger'], self::RESERVED, true)
                || isset($seen[$rule['trigger']])) {
                throw ValidationException::withMessages(["rules.$i.trigger" => 'محرک تکراری/رزروشده یا نامعتبر است. فرمان با / و حروف انگلیسی شروع می‌شود؛ متن دقیق نباید با / شروع شود.']);
            }
            $seen[$rule['trigger']] = true;
            if ($rule['action'] === 'reply' && trim($rule['response'] ?? '') === '') {
                throw ValidationException::withMessages(["rules.$i.response" => 'متن پاسخ الزامی است.']);
            }
            if ($rule['action'] === 'table_row') {
                app(OperationsSchema::class)->require('assets');
                $table = DamDataTable::find($rule['table_id'] ?? 0);
                if (! $table) {
                    throw ValidationException::withMessages(["rules.$i.table_id" => 'جدول مقصد را انتخاب کنید.']);
                }
                // ستون‌ها همین‌جا اعتبارسنجی می‌شوند تا قاعدهٔ ناقص ذخیره نشود.
                app(DamTableRows::class)->schema($table);
            }
            // Drop settings irrelevant to the action instead of retaining stale targets.
            // دپارتمان از قاعده حذف شده است؛ دسترسی هنگام اجرا با مجوز خودِ کاربر
            // و `DamTableAccess::canEdit` (شامل عضویت دپارتمان) سنجیده می‌شود.
            $rule = [...$rule, 'response' => $rule['action'] === 'reply' ? $rule['response'] : null,
                'table_id' => $rule['action'] === 'table_row' ? (int) $rule['table_id'] : null,
                'department_id' => null];
        }
        unset($rule);
        DB::transaction(function () use ($actor, $data): void {
            abort_unless($this->read()['revision'] === $data['revision'], 409, 'تنظیمات توسط شخص دیگری تغییر کرده است؛ دوباره دریافت کنید.');
            SystemSetting::updateOrCreate(['key' => self::KEY], ['value' => ['revision' => $data['revision'] + 1, 'rules' => $data['rules']], 'updated_by' => $actor->id]);
            app(Settings::class)->audit($actor, 'bale_automations_changed');
        });
    }

    public function match(string $text, User $user, BaleUserLink $link, ?BaleConversation $session): ?array
    {
        // پاسخِ فرم یا انتخابِ داخلِ جریان هیچ‌گاه به‌عنوان محرکِ متنی تفسیر
        // نمی‌شود؛ وگرنه یک کلمهٔ معمولی وسطِ کار، قاعده را اجرا می‌کرد و فرم را
        // (با حذفِ نشست) از بین می‌برد.
        if (MenuNavigation::active($session)) {
            return null;
        }
        $trigger = $this->normalize($text);
        foreach ($this->read()['rules'] as $rule) {
            // محرکِ ذخیره‌شده هم دوباره نرمال می‌شود: قاعده‌هایی که پیش از این
            // نرمال‌سازی (با نیم‌فاصله یا ارقام فارسی) ذخیره شده‌اند، همچنان
            // تطبیق می‌خورند.
            if ($rule['enabled'] && $this->normalize((string) $rule['trigger']) === $trigger) {
                $rateKey = 'bale-rule:'.$link->id;
                abort_if(RateLimiter::tooManyAttempts($rateKey, 20), 429, 'تعداد درخواست‌ها زیاد است؛ یک دقیقه بعد دوباره تلاش کنید.');
                RateLimiter::hit($rateKey, 60);
                $this->authorize($user, $rule);

                return $rule;
            }
        }

        return null;
    }

    public function authorize(User $user, array $rule): void
    {
        $user = $user->fresh();
        abort_unless($user, 403);
        $permissions = app(UserPermissionGate::class);
        if ($rule['action'] === 'table_row') {
            $permissions->authorizeAny($user, 'assets.view');
            $table = DamDataTable::find($rule['table_id'] ?? 0);
            $departmentId = isset($rule['department_id']) && (int) $rule['department_id'] > 0 ? (int) $rule['department_id'] : null;
            // قاعدهٔ تازه دپارتمان ندارد: همان کاربر بات باید مجوز ویرایش جدول را
            // داشته باشد (canEdit خودش عضویت دپارتمان‌های جدول را می‌سنجد).
            $allowed = $table && ($departmentId === null
                ? ($user->isActive() && app(DamTableAccess::class)->canEdit($user, $table))
                : app(DamTableAccess::class)->botAllowed($user, $table, $departmentId));
            abort_unless($allowed, 403);
        } elseif (in_array($rule['action'], ['asset_text', 'asset_file'], true)) {
            $permissions->authorizeAll($user, ['assets.view', 'assets.upload']);
        } else {
            $permission = match ($rule['action']) {
                'assets' => 'assets.view', 'tasks' => 'tasks.view', 'meetings' => 'meetings.view', default => null,
            };
            if ($permission) {
                $permissions->authorizeAny($user, $permission);
            } else {
                abort_unless($user->isActive(), 403);
            }
        }
    }

    public function action(array $rule): string
    {
        return match ($rule['action']) {
            'table_row' => empty($rule['department_id'])
                ? 'tableform:'.$rule['table_id']
                : 'departmentform:'.$rule['department_id'].':'.$rule['table_id'],
            'asset_text' => 'assettext:0', 'asset_file' => 'assetfile:0', 'reply' => 'automation_reply',
            default => $rule['action'],
        };
    }

    private function identity(array $rule): array
    {
        return ['id' => $rule['id'], 'version' => hash('sha256', json_encode($rule))];
    }

    public function tag(array $rule, BaleUserLink $link, string $key): void
    {
        $identity = $this->identity($rule);
        $session = BaleConversation::where('link_id', $link->id)->first();
        if (MenuNavigation::drafting($session)) {
            $session->update(['data' => [...$session->data, '_automation' => $identity]]);
        }
        $this->tagMessage($identity, $key);
    }

    public function tagMessage(array $identity, string $key): void
    {
        $message = BaleOutbox::where('deduplication_key', $key)->first();
        $message?->update(['payload' => [...$message->payload, '_automation' => $identity]]);
    }

    public function valid(array $identity, User $user): bool
    {
        foreach ($this->read()['rules'] as $rule) {
            if ($rule['enabled'] && $this->identity($rule) === $identity) {
                try {
                    $this->authorize($user, $rule);

                    return true;
                } catch (HttpException $e) {
                    if (! in_array($e->getStatusCode(), [403, 404], true)) {
                        throw $e;
                    }

                    return false;
                }
            }
        }

        return false;
    }
}
