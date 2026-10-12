<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Content;
use App\Models\ContentWatcher;
use App\Services\ContentWatchAccess;
use Illuminate\Http\Request;

class ContentWatchController extends Controller
{
    public function store(Request $request, Content $content)
    {
        $actor = $request->user()?->fresh();
        // Neither content.view nor content.watch alone grants a global follow.
        abort_unless(app(ContentWatchAccess::class)->canFollow($actor, $content), 403);
        $watch = ContentWatcher::firstOrCreate(['content_id' => $content->id, 'user_id' => $actor->id], ['created_by' => $actor->id]);
        return response()->json(['data' => ['contentId' => (string) $content->id, 'watching' => true]], $watch->wasRecentlyCreated ? 201 : 200);
    }

    public function destroy(Request $request, Content $content)
    {
        $actor = $request->user()?->fresh();
        abort_unless($actor?->isActive() && $actor->hasPermission('content.watch'), 403);
        ContentWatcher::where('content_id', $content->id)->where('user_id', $actor->id)->delete();
        return response()->json(['data' => ['contentId' => (string) $content->id, 'watching' => false]]);
    }
}
