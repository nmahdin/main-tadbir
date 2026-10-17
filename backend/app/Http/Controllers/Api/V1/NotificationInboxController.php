<?php

namespace App\Http\Controllers\Api\V1;

use App\Bot\Bale\Notifications\NotificationCatalog;
use App\Bot\Bale\Settings as BaleSettings;
use App\Http\Controllers\Controller;
use App\Http\Resources\DomainRecordResource;
use App\Models\BaleUserLink;
use App\Services\NotificationInbox;
use App\Support\Notifications\NotificationPolicy;
use Throwable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class NotificationInboxController extends Controller
{
    public function index(Request $request, NotificationInbox $inbox)
    {
        $request->validate(['page' => ['sometimes', 'integer', 'between:1,100000'], 'per_page' => ['sometimes', 'integer', 'between:1,200'],
            'read' => ['sometimes', Rule::in(['unread', 'read'])], 'type' => ['sometimes', 'string', 'max:80'],
            'category' => ['sometimes', Rule::in(NotificationInbox::CATEGORIES)]]);
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
        if ($request->filled('category')) {
            $inbox->category($query, $request->string('category')->toString());
        }

        return DomainRecordResource::collection($query->orderByDesc('id')->paginate($request->integer('per_page', 20))->withQueryString())
            ->additional(['meta' => ['unread_count' => $unread, 'types' => $types, 'categories' => NotificationInbox::CATEGORIES]]);
    }

    /**
     * تصویر زندهٔ اعلان‌ها برای تب «اعلان‌ها و هشدارها»ی تنظیمات.
     *
     * همهٔ اعداد از دادهٔ واقعی همین کاربر ساخته می‌شوند: شمار هر دسته از
     * دسته‌بندی رسمی سامانه (NotificationCatalog)، وضعیت اتصال بله و سیاست
     * سازمانی اعلان‌ها. هیچ عدد یا برچسب ساختگی اینجا نیست.
     */
    public function overview(Request $request, NotificationInbox $inbox, NotificationCatalog $catalog): JsonResponse
    {
        $user = $request->user();
        $categories = [];
        $totals = ['all' => 0, 'unread' => 0];

        foreach ($catalog->publicCatalog() as $id => $meta) {
            $scoped = $inbox->query($user);
            $inbox->category($scoped, (string) $id);

            $total = (clone $scoped)->count();
            $unread = $inbox->unread(clone $scoped)->count();
            $totals['all'] += $total;
            $totals['unread'] += $unread;

            $categories[] = [
                'id' => (string) $id,
                'label' => (string) ($meta['label'] ?? $id),
                'description' => (string) ($meta['description'] ?? ''),
                'types' => array_values(array_map('strval', (array) ($meta['types'] ?? []))),
                'total' => $total,
                'unread' => $unread,
                'bale' => true,
            ];
        }

        $link = null;

        try {
            $link = BaleUserLink::query()->where('user_id', $user->id)->first();
        } catch (Throwable) {
            $link = null;
        }

        $recent = [];

        foreach ($inbox->query($user)->orderByDesc('id')->limit(5)->get() as $record) {
            $payload = is_array($record->payload) ? $record->payload : [];
            $recent[] = [
                'id' => (string) $record->id,
                'title' => (string) ($payload['title'] ?? $record->title ?? 'اعلان سامانه'),
                'category' => $catalog->category($record),
                'type' => (string) ($payload['type'] ?? ''),
                'read' => (bool) ($payload['read'] ?? false),
                'at' => $record->created_at?->toIso8601String(),
            ];
        }

        return response()->json(['data' => [
            'categories' => $categories,
            'totals' => $totals,
            'recent' => $recent,
            'bale' => [
                'linked' => $link !== null,
                'enabled' => (bool) ($link?->notifications_enabled ?? false),
                'ready' => app(BaleSettings::class)->ready(),
                'enabled_categories' => $link ? $catalog->enabledFor($link) : $catalog->all(),
                'all_categories' => $catalog->all(),
            ],
            'policy' => [
                'deadlineReminders' => NotificationPolicy::enabled('deadlineReminders'),
                'mentionAlerts' => NotificationPolicy::enabled('mentionAlerts'),
            ],
        ]]);
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
