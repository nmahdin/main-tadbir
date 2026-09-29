<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\DomainRecordResource;
use App\Services\NotificationInbox;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class NotificationInboxController extends Controller
{
    public function index(Request $request, NotificationInbox $inbox)
    {
        $request->validate(['page' => ['sometimes', 'integer', 'between:1,100000'], 'per_page' => ['sometimes', 'integer', 'between:1,200'],
            'read' => ['sometimes', Rule::in(['unread', 'read'])], 'type' => ['sometimes', 'string', 'max:80']]);
        $query = $inbox->query($request->user());
        $unread = $inbox->unread(clone $query)->count();
        $types = (clone $query)->select('payload->type as type')->distinct()->get()->pluck('type')->filter()->values();
        if ($request->input('read') === 'unread') {
            $inbox->unread($query);
        }
        if ($request->input('read') === 'read') {
            $query->where('payload->read', true);
        }
        if ($request->filled('type')) {
            $query->where('payload->type', $request->input('type'));
        }

        return DomainRecordResource::collection($query->orderByDesc('id')->paginate($request->integer('per_page', 20))->withQueryString())
            ->additional(['meta' => ['unread_count' => $unread, 'types' => $types]]);
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
