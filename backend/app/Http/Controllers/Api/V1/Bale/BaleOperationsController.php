<?php

namespace App\Http\Controllers\Api\V1\Bale;

use App\Bot\Bale\Meetings\MeetingReminders;
use App\Bot\Bale\Notifications\NotificationCatalog;
use App\Bot\Bale\Notifications\NotificationDelivery;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\OperationsSchema;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\BaleOutbox;
use App\Models\BaleUserLink;
use App\Models\DomainRecord;
use App\Models\WorkspaceRecord;
use App\Services\Access\UserPermissionGate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class BaleOperationsController extends Controller
{
    public function preview(Request $request, WorkspaceRecord $meeting, MeetingReminders $reminders)
    {
        return response()->json(['data' => $reminders->preview($request->user(), $meeting)]);
    }

    public function remind(Request $request, WorkspaceRecord $meeting, MeetingReminders $reminders)
    {
        $data = $request->validate(['request_id' => 'required|uuid', 'version' => 'required|string|size:64', 'confirm' => 'required|accepted']);

        return response()->json(['data' => $reminders->send($request->user(), $meeting, $data['request_id'], $data['version'])]);
    }

    public function deliverRun(Request $request, WorkspaceRecord $meeting, int $run, MeetingReminders $reminders)
    {
        return response()->json(['data' => $reminders->deliver($request->user(), $meeting, $run)]);
    }

    public function deliver(Request $request, NotificationDelivery $delivery)
    {
        app(UserPermissionGate::class)->authorizeAny($request->user(), 'settings.manage');

        return response()->json(['data' => ['sent' => $delivery->sendNow()]]);
    }

    public function testNotification(Request $request)
    {
        abort_unless($request->user()->isActive(), 403);
        app(OperationsSchema::class)->require('notifications');
        $data = $request->validate(['request_id' => 'required|uuid']);
        $link = BaleUserLink::where('user_id', $request->user()->id)->firstOrFail();
        abort_unless($link->notifications_enabled && app(Settings::class)->ready(), 422, 'اتصال و دریافت اعلان را ابتدا فعال کنید.');
        $record = DB::transaction(fn () => DomainRecord::firstOrCreate(
            ['notification_key' => hash('sha256', 'bale-test:'.$request->user()->id.':'.$data['request_id'])],
            ['domain' => 'notification', 'user_id' => $request->user()->id, 'title' => '🔔 آزمون دریافت اعلان',
                'payload' => ['title' => 'آزمون دریافت اعلان', 'userId' => (string) $request->user()->id, 'message' => 'اتصال اعلان‌های تدبیر به بله را با این پیام بررسی کنید.', 'type' => 'info', 'read' => false, 'timestamp' => now()->toIso8601String()]]
        ));
        $status = BaleOutbox::where('subject_type', 'notification')->where('subject_id', $record->id)->value('status');

        return response()->json(['data' => ['status' => $status ?? 'not_queued']]);
    }

    public function preferences(Request $request)
    {
        abort_unless($request->user()->isActive(), 403);
        app(OperationsSchema::class)->require('notifications');
        $catalog = app(NotificationCatalog::class);
        $data = $request->validate([
            'notifications_enabled' => ['required', 'boolean'],
            'enabled_categories' => ['sometimes', 'array', 'list', 'max:20'],
            'enabled_categories.*' => ['required', 'string', 'distinct', Rule::in($catalog->all())],
        ]);
        $link = BaleUserLink::where('user_id', $request->user()->id)->firstOrFail();
        $enabledCategories = array_values(array_intersect(
            $catalog->all(),
            $data['enabled_categories'] ?? $catalog->enabledFor($link),
        ));
        $link->update([
            'notifications_enabled' => $data['notifications_enabled'],
            'notification_preferences' => ['enabled_categories' => $enabledCategories],
        ]);
        ActivityLog::create(['user_id' => $request->user()->id, 'type' => 'bale_preferences_changed', 'action' => 'تغییر دسته‌بندی اعلان‌های بله']);

        return response()->json(['data' => [
            'notifications_enabled' => (bool) $link->notifications_enabled,
            'enabled_categories' => $enabledCategories,
        ]]);
    }
}
