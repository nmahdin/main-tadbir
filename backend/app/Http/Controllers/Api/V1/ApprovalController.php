<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ContentResource;
use App\Models\Content;
use App\Models\Task;
use App\Services\ContentAccess;
use App\Services\ContentReview;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ApprovalController extends Controller
{
    public function index(Request $request, ContentReview $review)
    {
        $request->validate(['page' => ['sometimes', 'integer', 'between:1,100000'], 'per_page' => ['sometimes', 'integer', 'between:1,100'], 'item' => ['sometimes', 'integer', 'min:1'], 'content_id' => ['sometimes', 'integer', 'min:1'], 'stage_id' => ['sometimes', 'string', 'max:120']]);
        abort_unless(app(ContentAccess::class)->canEnter($request->user()) && $request->user()->hasPermission('content.approve'), 403);
        $query = Task::where('kind', 'content_review')->where('assignee_id', $request->user()->id)
            ->whereNotIn('status', ['completed', 'archived'])->whereHas('content')
            ->when($request->filled('item'), fn ($q) => $q->whereKey($request->integer('item')))
            ->when($request->filled('content_id'), fn ($q) => $q->where('content_id', $request->integer('content_id')))
            ->when($request->filled('stage_id'), fn ($q) => $q->where('content_stage_id', $request->input('stage_id')));
        // Source ACL is checked before counting. Retain only one page, never an
        // unbounded array of IDs / huge WHERE IN clause. The scan is still O(candidates).
        $number = $request->integer('page', 1);
        $size = $request->integer('per_page', 20);
        $offset = ($number - 1) * $size;
        $total = 0;
        $rows = [];
        $query->with('content')->chunkById(200, function ($tasks) use ($review, $request, $offset, $size, &$total, &$rows) {
            foreach ($tasks as $task) {
                $stage = collect($task->content->payload['stages'] ?? [])->firstWhere('id', $task->content_stage_id);
                if (! is_array($stage) || ! $review->canReview($request->user(), $task->content, $stage)) {
                    continue;
                }
                $position = $total++;
                if ($position < $offset || count($rows) >= $size) {
                    continue;
                }
                $rows[] = ['id' => (string) $task->id, 'type' => 'content_stage', 'title' => $task->content->title,
                    'stageTitle' => $stage['title'] ?? '', 'contentId' => (string) $task->content_id, 'stageId' => $task->content_stage_id,
                    'status' => $stage['status'], 'createdAt' => $task->created_at?->toIso8601String(), 'deadline' => $task->deadline?->toDateString(),
                    'expectedVersion' => ContentReview::version($task->content)];
            }
        });

        return response()->json(['data' => $rows, 'meta' => ['current_page' => $number, 'last_page' => max(1, (int) ceil($total / $size)), 'per_page' => $size, 'total' => $total]]);
    }

    public function decide(Request $request, Content $content, string $stage, ContentReview $review)
    {
        $data = $request->validate(['decision' => ['required', Rule::in(['approve', 'reject'])],
            'expectedVersion' => ['required', 'string', 'size:64'], 'note' => ['required_if:decision,reject', 'nullable', 'string', 'max:3000']]);

        return new ContentResource($review->decide($request->user(), $content, $stage, $data));
    }
}
