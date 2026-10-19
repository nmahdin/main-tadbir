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
        $request->validate([
            'category' => ['sometimes', \Illuminate\Validation\Rule::in(NotificationInbox::CATEGORIES)],
            'group_key' => ['sometimes', 'string', 'max:120'],
        ]);
        $count = DB::transaction(function () use ($request, $inbox) {
            $query = $inbox->unread($inbox->query($request->user()));
            if ($request->filled('category')) {
                $inbox->category($query, $request->string('category')->toString());
            }
            if ($request->filled('group_key')) {
                $query->where('group_key', $request->string('group_key')->toString());
            }
            // Mandatory/security rows are never bulk-read (UX-02-4 policy).
            $query->where(function ($q) {
                $q->whereNull('payload->mandatory')->orWhere('payload->mandatory', false);
            })->where(function ($q) {
                $q->whereNull('payload->security')->orWhere('payload->security', false);
            })->where(function ($q) {
                $q->whereNull('payload->type')->orWhere('payload->type', 'not like', 'security%');
            });
            $max = (clone $query)->max('id');

            // SQL subject/recipient scope applies to every row; update only the read flag.
            // No per-record HTTP fan-out, unbounded hydration, or lost unrelated payload fields.
            return $query->where('id', '<=', $max ?? 0)->update(['payload->read' => true, 'read_at' => now()]);
        });

        return response()->json(['data' => ['updated' => $count], 'message' => 'اعلان‌ها خوانده شدند.']);
    }
}
