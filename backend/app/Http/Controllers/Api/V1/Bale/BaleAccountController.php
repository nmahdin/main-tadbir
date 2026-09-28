<?php

namespace App\Http\Controllers\Api\V1\Bale;

use App\Bot\Bale\Auth\AccountLinker;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\RuntimeLock;
use App\Http\Controllers\Controller;
use App\Models\BaleUserLink;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class BaleAccountController extends Controller
{
    public function __construct(private AccountLinker $linker, private Settings $settings, private RuntimeLock $lock) {}

    public function show(Request $request): JsonResponse
    {
        abort_unless($request->user()->isActive(), 403);
        $link = BaleUserLink::where('user_id', $request->user()->id)->first();

        return response()->json(['data' => [
            'connected' => $link !== null,
            'notifications_enabled' => $link ? (bool) $link->notifications_enabled : false,
            'linked_at' => $link?->created_at?->toIso8601String(),
            'bot_ready' => $this->settings->ready(),
            'bot_username' => $this->settings->read()['bot_username'] ?? null,
        ]])->header('Cache-Control', 'no-store');
    }

    public function code(Request $request): JsonResponse
    {
        $data = $this->lock->run(fn () => $this->linker->issue($request->user()));

        return response()->json(['data' => $data])->header('Cache-Control', 'no-store');
    }

    public function disconnect(Request $request): JsonResponse
    {
        abort_unless($request->user()->isActive(), 403);
        $request->validate(['confirm' => ['required', 'accepted']]);
        $this->lock->run(fn () => $this->linker->disconnect($request->user()));

        return $this->show($request);
    }
}
