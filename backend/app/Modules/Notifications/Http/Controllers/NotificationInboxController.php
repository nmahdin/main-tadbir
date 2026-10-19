<?php

namespace App\Modules\Notifications\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Notifications\Services\NotificationInbox;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationInboxController extends Controller
{
    public function index(Request $request, NotificationInbox $inbox)
    {
        return $inbox->listing($request);
    }

    public function readAll(Request $request, NotificationInbox $inbox)
    {
        $count = DB::transaction(function () use ($request, $inbox) {
            $query = $inbox->unread($inbox->query($request->user()));
            $max = (clone $query)->max('id');

            // SQL subject/recipient scope applies to every row; update only the read flag.
            // No per-record HTTP fan-out, unbounded hydration, or lost unrelated payload fields.
            return $query->where('id', '<=', $max ?? 0)->update(['payload->read' => true]);
        });

        return response()->json(['data' => ['updated' => $count], 'message' => 'اعلان‌ها خوانده شدند.']);
    }
}
