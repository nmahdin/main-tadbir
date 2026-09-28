<?php

namespace App\Http\Controllers\Api\V1\Bale;

use App\Bot\Bale\Auth\AccountLinker;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\OperationsSchema;
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

        $missing = app(OperationsSchema::class)->missing();

        return response()->json(['data' => [
            'connected' => $link !== null,
            'installation_ready' => $missing === [],
            'installation_message' => $missing ? OperationsSchema::MESSAGE : null,
            'notifications_enabled' => $link ? (bool) $link->notifications_enabled : false,
            'linked_at' => $link?->created_at?->toIso8601String(),
            'bot_ready' => $this->settings->ready(),
            'transport' => $this->settings->read()['transport'] ?? 'short_polling',
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
