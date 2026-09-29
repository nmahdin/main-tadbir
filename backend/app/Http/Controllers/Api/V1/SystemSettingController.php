<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SystemSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * تنظیمات سیستمی سازمان — هر کلید یک آرایه/شیء کامل JSON:
 *
 *  - content_types         انواع محتوا (لیست)
 *  - categories            دسته‌بندی‌های سامانه (لیست)
 *  - process_templates     الگوهای فرایند تولید محتوا (لیست)
 *  - publishing_platforms  پلتفرم‌های انتشار (لیست)
 *  - workflows             گردش‌کارها (لیست)
 *  - general               هویت سازمان، اسپرینت، تقویم، منطقه زمانی و رنگ سامانه (شیء)
 *  - notifications         سیاست اعلان‌ها و هشدارها (شیء)
 *  - security              سیاست‌های امنیتی: رمز عبور و نشست (شیء)
 *  - task_priorities       اولویت‌های سفارشی وظایف (لیست)
 *  - task_statuses         وضعیت‌های سفارشی وظایف (لیست)
 *  - dam_statuses          وضعیت‌های سفارشی دارایی‌های دیجیتال (لیست)
 *  - content_statuses      وضعیت‌های سفارشی محتوا (لیست)
 */
class SystemSettingController extends Controller
{
    /**
     * کلیدهایی که مقدار آن‌ها یک «شیء» است؛ بقیه لیست هستند.
     */
    private const OBJECT_KEYS = [
        'general',
        'notifications',
        'security',
    ];

    private const ALLOWED_KEYS = [
        'content_types',
        'categories',
        'process_templates',
        'publishing_platforms',
        'workflows',
        'general',
        'notifications',
        'security',
        'task_priorities',
        'task_statuses',
        'dam_statuses',
        'content_statuses',
    ];

    /**
     * مقادیر پیش‌فرض برای کلیدهای شیءای؛ هنگام اولین ذخیره‌سازی به‌عنوان
     * پایه اعمال می‌شود تا ساختار تنظیمات همیشه کامل بماند.
     */
    private const DEFAULTS = [
        'general' => [
            'orgName' => 'سامانه سازمانی تدبیر',
            'workspaceSlug' => 'tadbir-corp',
            'sprintLength' => '2 weeks',
            'timezone' => 'Asia/Tehran',
            'calendar' => 'jalali',
            'themeColor' => '#4f46e5',
        ],
        'notifications' => [
            'deadlineReminders' => true,
            'mentionAlerts' => true,
        ],
        'security' => [
            'twoFactorEnforced' => false,
            'passwordMinLength' => 8,
            'sessionLifetimeMinutes' => 480,
            'maxLoginAttempts' => 5,
        ],
    ];

    public function index(): JsonResponse
    {
        // با hydrate شدن مدل، کست «array» ستون json اعمال می‌شود؛
        // pluck کست را دور می‌زند و رشته خام JSON برمی‌گرداند.
        $settings = SystemSetting::query()->whereIn('key', self::ALLOWED_KEYS)->get()->pluck('value', 'key')->all();

        foreach (self::DEFAULTS as $key => $default) {
            $settings[$key] = $this->mergeWithDefault($key, $settings[$key] ?? null);
        }

        return response()->json([
            'data' => $settings,
        ]);
    }

    public function show(string $key): JsonResponse
    {
        abort_unless(in_array($key, self::ALLOWED_KEYS, true), 404);

        /** @var SystemSetting|null $setting */
        $setting = SystemSetting::query()->where('key', $key)->first();

        return response()->json([
            'data' => [
                'key' => $key,
                'value' => $this->mergeWithDefault($key, $setting?->value),
            ],
        ]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        abort_unless(in_array($key, self::ALLOWED_KEYS, true), 404, 'کلید تنظیمات پشتیبانی نمی‌شود.');

        $user = $request->user();
        abort_unless(
            $user !== null && (
                $user->isAdmin()
                || $user->hasPermission('settings.manage')
                || (in_array($key, ['process_templates', 'workflows'], true) && $user->hasAnyPermission(['content.manage_process', 'workflows.manage']))
            ),
            403,
            'برای تغییر تنظیمات سامانه دسترسی لازم را ندارید.',
        );

        $data = Validator::make($request->all(), [
            'value' => ['present', 'array'],
        ])->validate();

        $value = $data['value'];
        if (in_array($key, self::OBJECT_KEYS, true)) {
            $value = $this->mergeWithDefault($key, $value);
        }

        SystemSetting::updateOrCreate(
            ['key' => $key],
            ['value' => $value, 'updated_by' => $request->user()?->id],
        );

        return response()->json([
            'data' => [
                'key' => $key,
                'value' => $value,
            ],
            'message' => 'تنظیمات با موفقیت ذخیره شد.',
        ]);
    }

    /**
     * مقدار ذخیره‌شده را با پیش‌فرض‌های ساختاری کلیدهای شیءای ترکیب می‌کند.
     *
     * @return array<string, mixed>
     */
    private function mergeWithDefault(string $key, mixed $value): array
    {
        $default = self::DEFAULTS[$key] ?? [];

        if (! is_array($value)) {
            return $default;
        }

        $merged = [...$default, ...$value];
        if ($key === 'notifications') {
            unset($merged['emailAlerts'], $merged['weeklyDigest']);
        }
        if ($key === 'security') {
            $merged['passwordMinLength'] = 8;
        }

        return $merged;
    }
}
