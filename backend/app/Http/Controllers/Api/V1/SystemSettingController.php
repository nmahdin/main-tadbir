<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\DamAsset;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\GoogleMeetService;
use App\Services\Organization\OrganizationSettings;
use App\Support\Maintenance\MaintenanceMode;
use App\Support\Media\PublicMedia;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Organization settings backed by one authoritative schema registry. */
class SystemSettingController extends Controller
{
    public function __construct(private readonly OrganizationSettings $settings) {}

    /** Safe visual identity required by the login page before authentication. */
    public function publicIdentity(): JsonResponse
    {
        /** @var SystemSetting|null $setting */
        $setting = SystemSetting::query()->where('key', 'general')->first();
        $general = $this->settings->hydrate('general', $setting?->value);
        $defaults = OrganizationSettings::DEFAULTS['general'];
        $orgName = is_string($general['orgName'] ?? null)
            ? trim(mb_substr($general['orgName'], 0, 160)) : $defaults['orgName'];
        $description = is_string($general['loginDescription'] ?? null)
            ? trim(mb_substr($general['loginDescription'], 0, 240)) : '';
        $themeColor = is_string($general['themeColor'] ?? null)
            && preg_match('/^#[0-9a-f]{6}$/i', $general['themeColor'])
                ? $general['themeColor'] : $defaults['themeColor'];
        $secondaryColor = is_string($general['secondaryColor'] ?? null)
            && preg_match('/^#[0-9a-f]{6}$/i', $general['secondaryColor'])
                ? $general['secondaryColor'] : $defaults['secondaryColor'];
        // مسیر فایل هویت بصری فقط از دیسک عمومی و پوشهٔ brand پذیرفته می‌شود و
        // به شکل نشانی مطلقِ کارا روی هر دامنه برگردانده می‌شود.
        $brandFile = static fn (mixed $value): string => PublicMedia::path($value) === null
            ? ''
            : PublicMedia::url($value);

        return response()->json(['data' => [
            'orgName' => $orgName,
            'loginDescription' => $description,
            'themeColor' => $themeColor,
            'secondaryColor' => $secondaryColor,
            'logoUrl' => $brandFile($general['logoUrl'] ?? null),
            'faviconUrl' => $brandFile($general['faviconUrl'] ?? null),
            // صفحهٔ ورود پیش از احراز هویت باید بداند سامانه در حالت تعمیر است
            // تا به‌جای فرم ورود، پیام تعمیر را نشان دهد.
            'maintenance' => app(MaintenanceMode::class)->publicState(),
        ]], 200, [
            // وضعیت تعمیر نباید کش شود؛ در غیر این صورت پس از خاموش‌کردن آن،
            // کاربران تا پایان عمر کش همچنان صفحهٔ تعمیر می‌دیدند.
            'Cache-Control' => 'no-store, private',
        ]);
    }

    /**
     * بارگذاری لوگو یا فاوآیکون سامانه.
     *
     * فایل روی دیسک عمومی و در پوشهٔ `brand` ذخیره می‌شود و مسیر نسبی‌اش
     * بازگردانده می‌شود؛ ذخیرهٔ نهایی همان PUT تنظیمات `general` است تا یک
     * مسیر نوشتن باقی بماند. محتوا فقط تصویر raster است (SVG پذیرفته نمی‌شود)
     * تا فایل بارگذاری‌شده نتواند اسکریپت اجرا کند.
     */
    public function branding(Request $request, string $kind): JsonResponse
    {
        abort_unless(in_array($kind, ['logo', 'favicon'], true), 404, 'نوع فایل هویت بصری پشتیبانی نمی‌شود.');

        $request->validate([
            'file' => ['required', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
        ], [
            'file.required' => 'فایلی انتخاب نشده است.',
            'file.image' => 'فایل باید تصویر باشد.',
            'file.mimes' => 'فقط تصویر PNG، JPG یا WebP پذیرفته می‌شود.',
            'file.max' => 'حجم فایل نباید بیشتر از ۲ مگابایت باشد.',
        ]);

        $path = $request->file('file')->store('brand', 'public');

        return response()->json([
            // نشانی مطلق تا پیش‌نمایش همان لحظه در پنل هم درست لود شود.
            'data' => ['kind' => $kind, 'url' => PublicMedia::url($path)],
            'message' => $kind === 'logo' ? 'لوگوی سامانه بارگذاری شد.' : 'فاوآیکون سامانه بارگذاری شد.',
        ], 201);
    }

    /**
     * مسیرهای ذخیره‌شدهٔ هویت بصری را برای مرورگر به نشانی مطلق تبدیل می‌کند.
     *
     * `logoUrl` و `faviconUrl` در پایگاه داده همان مسیر `/storage/brand/...`
     * می‌مانند (قرارداد ذخیره‌سازی)، اما خروجی API باید نشانی کامل باشد؛ وگرنه
     * مرورگر آن را نسبت به دامنهٔ پنل می‌خواند و تصویر شکسته می‌شود.
     *
     * @param  array<string, mixed>  $value
     * @return array<string, mixed>
     */
    private function exposeMediaUrls(array $value): array
    {
        foreach (['logoUrl', 'faviconUrl'] as $key) {
            if (! array_key_exists($key, $value)) {
                continue;
            }
            // فقط مسیرهای شناخته‌شدهٔ `/storage/...` تفسیر می‌شوند؛ مقدار ناشناس
            // دست‌نخورده می‌ماند تا داده‌ای در نمایش پاک نشود.
            $value[$key] = PublicMedia::url($value[$key]);
        }

        return $value;
    }

    /**
     * مهرِ زمانِ شروع/پایان و نامِ تغییردهنده را سرور تعیین می‌کند، نه کلاینت.
     *
     * مقدارِ ورودی فقط `enabled` و `message` را دارد؛ کلیدهای `startedAt` و
     * `updatedBy` همیشه از سمت سرور پر می‌شوند تا با زمان و کاربر واقعی منطبق
     * باشند و نتوان آن‌ها را جعل کرد.
     *
     * @param  array<string, mixed>  $value
     * @return bool  وضعیتِ پیش از این تغییر
     */
    private function applyMaintenanceTimestamps(array &$value, User $actor): bool
    {
        $previous = $this->settings->hydrate(
            MaintenanceMode::KEY,
            SystemSetting::query()->where('key', MaintenanceMode::KEY)->value('value'),
        );
        $mode = app(MaintenanceMode::class);
        $enabled = (bool) ($value['enabled'] ?? false);
        $wasEnabled = (bool) ($previous['enabled'] ?? false);

        $value['enabled'] = $enabled;
        $value['message'] = trim((string) ($value['message'] ?? ''));
        $value['startedAt'] = $enabled
            ? ($wasEnabled && is_string($previous['startedAt'] ?? null) && $previous['startedAt'] !== ''
                ? $previous['startedAt']
                : $mode->now())
            : null;
        $value['updatedBy'] = $actor->name;

        return $wasEnabled;
    }

    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();
        $keys = $this->settings->readableKeys($actor);
        // Hydrating models applies the JSON array cast; pluck would return raw JSON.
        $stored = SystemSetting::query()->whereIn('key', $keys)->get()->pluck('value', 'key')->all();
        $result = [];
        foreach ($keys as $key) {
            if (array_key_exists($key, $stored) || array_key_exists($key, OrganizationSettings::DEFAULTS)) {
                $result[$key] = $this->settings->hydrate($key, $stored[$key] ?? null);
                if ($key === 'google_meet') {
                    $result[$key] = [...$result[$key], ...app(GoogleMeetService::class)->connectionStatus()];
                }
                if ($key === 'general') {
                    $result[$key] = $this->exposeMediaUrls($result[$key]);
                }
            }
        }

        return response()->json(['data' => $result]);
    }

    public function show(Request $request, string $key): JsonResponse
    {
        abort_unless($this->settings->supports($key), 404);
        abort_unless($this->settings->canRead($request->user(), $key), 403);

        /** @var SystemSetting|null $setting */
        $setting = SystemSetting::query()->where('key', $key)->first();

        $value = $this->settings->hydrate($key, $setting?->value);
        if ($key === 'google_meet') {
            $value = [...$value, ...app(GoogleMeetService::class)->connectionStatus()];
        }
        if ($key === 'general') {
            $value = $this->exposeMediaUrls($value);
        }

        return response()->json(['data' => [
            'key' => $key,
            'value' => $value,
        ]]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        abort_unless($this->settings->supports($key), 404, 'کلید تنظیمات پشتیبانی نمی‌شود.');
        $actor = $request->user();
        abort_unless(
            $this->settings->canWrite($actor, $key),
            403,
            $key === MaintenanceMode::KEY
                ? 'فقط نقش مدیریت کل سیستم می‌تواند حالت تعمیر را تغییر دهد.'
                : 'برای تغییر تنظیمات سامانه دسترسی لازم را ندارید.',
        );

        $value = $this->settings->validate($key, $request->input('value'));
        if ($key === 'general') {
            // مسیر هویت بصری همیشه به شکل کانونیک `/storage/...` ذخیره می‌شود،
            // حتی اگر پنل نشانی مطلق برگشتیِ API را دوباره بفرستد.
            foreach (['logoUrl', 'faviconUrl'] as $field) {
                if (array_key_exists($field, $value)) {
                    $value[$field] = PublicMedia::storedPath($value[$field]);
                }
            }
        }
        $maintenanceBefore = null;
        if ($key === MaintenanceMode::KEY) {
            $maintenanceBefore = $this->applyMaintenanceTimestamps($value, $actor);
        }
        DB::transaction(function () use ($actor, $key, $value): void {
            SystemSetting::updateOrCreate(
                ['key' => $key],
                ['value' => $value, 'updated_by' => $actor->id],
            );
            if ($key === 'dam_statuses') {
                $ids = collect($value)->pluck('id')->filter()->values()->all();
                DamAsset::query()->whereNotIn('status', $ids)->update(['status' => $ids[0]]);
            }
            $shape = array_is_list($value)
                ? 'items:'.count($value)
                : 'fields:'.implode(',', array_keys($value));
            ActivityLog::create([
                'user_id' => $actor->id,
                'type' => 'organization_setting_updated',
                'action' => 'تغییر تنظیمات سازمانی',
                // Values are deliberately excluded: logs must not become a second settings store.
                'details' => "setting:{$key}; {$shape}",
            ]);
        });

        if ($key === MaintenanceMode::KEY) {
            // حافظهٔ همین درخواست پاک می‌شود تا پاسخ بعدی وضعیت تازه را ببیند.
            app(MaintenanceMode::class)->forget();
            ActivityLog::create([
                'user_id' => $actor->id,
                'type' => 'maintenance_mode_changed',
                'action' => $value['enabled']
                    ? 'روشن کردن حالت تعمیر سامانه'
                    : 'خاموش کردن حالت تعمیر سامانه',
                'details' => $maintenanceBefore === $value['enabled']
                    ? 'وضعیت بدون تغییر بود.'
                    : 'دسترسی کاربران غیرمدیر به سامانه '.($value['enabled'] ? 'بسته' : 'باز').' شد.',
            ]);
        }

        $responseValue = $key === 'google_meet'
            ? [...$value, ...app(GoogleMeetService::class)->connectionStatus()]
            : $value;
        if ($key === 'general') {
            $responseValue = $this->exposeMediaUrls($responseValue);
        }

        return response()->json([
            'data' => ['key' => $key, 'value' => $responseValue],
            'message' => 'تنظیمات با موفقیت ذخیره شد.',
        ]);
    }
}
