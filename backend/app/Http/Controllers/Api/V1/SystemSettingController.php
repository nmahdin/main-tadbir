<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SystemSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * تنظیمات سیستمی سازمان: انواع محتوا، دسته‌بندی‌ها، الگوهای فرایند،
 * پلتفرم‌های انتشار و گردش‌کارها — هر کلید یک آرایه کامل JSON.
 */
class SystemSettingController extends Controller
{
    private const ALLOWED_KEYS = [
        'content_types',
        'categories',
        'process_templates',
        'publishing_platforms',
        'workflows',
    ];

    public function index(): JsonResponse
    {
        return response()->json([
            'data' => SystemSetting::query()->pluck('value', 'key')->all(),
        ]);
    }

    public function show(string $key): JsonResponse
    {
        abort_unless(in_array($key, self::ALLOWED_KEYS, true), 404);

        return response()->json([
            'data' => [
                'key' => $key,
                'value' => SystemSetting::query()->where('key', $key)->value('value'),
            ],
        ]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        abort_unless(in_array($key, self::ALLOWED_KEYS, true), 404, 'کلید تنظیمات پشتیبانی نمی‌شود.');

        $user = $request->user();
        abort_unless(
            $user !== null && ($user->isAdmin() || $user->hasAnyPermission('content.manage_process', 'workflows.manage')),
            403,
            'برای تغییر تنظیمات سامانه دسترسی لازم را ندارید.',
        );

        $data = Validator::make($request->all(), [
            'value' => ['present'],
        ])->validate();

        SystemSetting::updateOrCreate(
            ['key' => $key],
            ['value' => $data['value'], 'updated_by' => $request->user()?->id],
        );

        return response()->json([
            'data' => [
                'key' => $key,
                'value' => $data['value'],
            ],
            'message' => 'تنظیمات با موفقیت ذخیره شد.',
        ]);
    }
}
