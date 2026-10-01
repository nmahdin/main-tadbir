<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\SystemSetting;
use App\Services\Organization\OrganizationSettings;
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

        return response()->json(['data' => [
            'orgName' => $orgName,
            'loginDescription' => $description,
            'themeColor' => $themeColor,
        ]], 200, ['Cache-Control' => 'public, max-age=60']);
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

        return response()->json(['data' => [
            'key' => $key,
            'value' => $this->settings->hydrate($key, $setting?->value),
        ]]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        abort_unless($this->settings->supports($key), 404, 'کلید تنظیمات پشتیبانی نمی‌شود.');
        $actor = $request->user();
        abort_unless($this->settings->canWrite($actor, $key), 403, 'برای تغییر تنظیمات سامانه دسترسی لازم را ندارید.');

        $value = $this->settings->validate($key, $request->input('value'));
        DB::transaction(function () use ($actor, $key, $value): void {
            SystemSetting::updateOrCreate(
                ['key' => $key],
                ['value' => $value, 'updated_by' => $actor->id],
            );
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

        return response()->json([
            'data' => ['key' => $key, 'value' => $value],
            'message' => 'تنظیمات با موفقیت ذخیره شد.',
        ]);
    }
}
