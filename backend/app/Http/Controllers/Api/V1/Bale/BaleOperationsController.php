<?php

namespace App\Http\Controllers\Api\V1\Bale;

use App\Bot\Bale\Meetings\MeetingReminders;
use App\Bot\Bale\Notifications\NotificationDelivery;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\BaleUserLink;
use App\Models\WorkspaceRecord;
use Illuminate\Http\Request;

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
        abort_unless($request->user()->isActive() && $request->user()->hasPermission('settings.manage'), 403);

        return response()->json(['data' => ['sent' => $delivery->sendNow()]]);
    }

    public function preferences(Request $request)
    {
        abort_unless($request->user()->isActive(), 403);
        $data = $request->validate(['notifications_enabled' => 'required|boolean']);
        $link = BaleUserLink::where('user_id', $request->user()->id)->firstOrFail();
        $link->update($data);
        ActivityLog::create(['user_id' => $request->user()->id, 'type' => 'bale_preferences_changed', 'action' => 'تغییر دریافت اعلان بله']);

        return response()->json(['data' => $data]);
    }
}
