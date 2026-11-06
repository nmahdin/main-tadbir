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
                    'stageTitle' => $stage['title'] ?? '', 'stageDescription' => $stage['description'] ?? null,
                    'outputs' => $this->reviewOutputs($task->content, $stage),
                    'workReport' => $stage['workReport'] ?? null,
                    'contentId' => (string) $task->content_id, 'stageId' => $task->content_stage_id,
                    'status' => $stage['status'], 'createdAt' => $task->created_at?->toIso8601String(), 'deadline' => $task->deadline?->toDateString(),
                    'expectedVersion' => ContentReview::version($task->content)];
            }
        });

        return response()->json(['data' => $rows, 'meta' => ['current_page' => $number, 'last_page' => max(1, (int) ceil($total / $size)), 'per_page' => $size, 'total' => $total]]);
    }

    /**
     * خروجی‌های همان مرحله‌ای که در انتظار بررسی است.
     *
     * چرا بازنویسی شد (دور ۸۹): در دور ۸۸ برای پرکردن پنجرهٔ خالی، خروجی
     * مرحله‌های پیشین هم می‌آمد؛ ولی داور باید فقط چیزی را ببیند که **همین
     * مرحله** تحویل داده است، نه همهٔ خروجی‌های محتوا. پس فقط دو دسته برمی‌گردد:
     * خروجی خودِ مرحله، و خروجی‌هایی که مرحلهٔ دیگری صریحاً به این مرحله ارجاع
     * داده است (`forwardedToStageId`). هر قلم نام مرحلهٔ مبدأ و نسبتش را با
     * خود دارد تا اگر ارجاعی بود، مبدأ روشن باشد.
     *
     * @return array<int, array<string, mixed>>
     */
    private function reviewOutputs(Content $content, array $stage): array
    {
        $stageId = (string) ($stage['id'] ?? '');
        $collected = [];

        $push = function (array $source, string $relation) use (&$collected): void {
            foreach ((is_array($source['outputs'] ?? null) ? $source['outputs'] : []) as $output) {
                if (! is_array($output)) {
                    continue;
                }
                $key = (string) ($output['id'] ?? '');
                if ($key === '') {
                    $key = md5((string) json_encode($output));
                }
                if (isset($collected[$key])) {
                    continue;
                }
                $collected[$key] = [...$output,
                    'stageId' => (string) ($source['id'] ?? ''),
                    'stageTitle' => (string) ($source['title'] ?? ''),
                    'relation' => $relation];
            }
        };

        // ۱) خروجی‌های خودِ همین مرحله.
        $push($stage, 'current');

        // ۲) خروجی‌هایی که مرحلهٔ دیگری آن‌ها را به این مرحله ارجاع داده است.
        foreach (collect(is_array($content->payload['stages'] ?? null) ? $content->payload['stages'] : [])->filter(fn ($item) => is_array($item)) as $source) {
            if ((string) ($source['id'] ?? '') === $stageId) {
                continue;
            }
            $forwarded = array_values(array_filter(
                is_array($source['outputs'] ?? null) ? $source['outputs'] : [],
                fn ($output) => is_array($output) && (string) ($output['forwardedToStageId'] ?? '') === $stageId,
            ));
            if ($forwarded !== []) {
                $push(['id' => $source['id'] ?? '', 'title' => $source['title'] ?? '', 'outputs' => $forwarded], 'forwarded');
            }
        }

        return array_values($collected);
    }

    public function forwardOutput(Request $request, Content $content, string $stage, string $output, ContentReview $review)
    {
        $data = $request->validate([
            'expectedVersion' => ['required', 'string', 'size:64'],
        ], [
            'expectedVersion.required' => 'نسخهٔ خروجی در دسترس نیست؛ صفحه را دوباره بارگذاری کنید.',
            'expectedVersion.size' => 'نسخهٔ خروجی معتبر نیست؛ صفحه را دوباره بارگذاری کنید.',
        ]);

        return new ContentResource($review->forwardOutput($request->user(), $content, $stage, $output, $data['expectedVersion']));
    }

    public function decide(Request $request, Content $content, string $stage, ContentReview $review)
    {
        $data = $request->validate(['decision' => ['required', Rule::in(['approve', 'reject'])],
            'expectedVersion' => ['required', 'string', 'size:64'],
            'note' => ['required_if:decision,reject', 'nullable', 'string', 'max:3000'],
            'correctionAssigneeId' => ['prohibited_unless:decision,reject', 'nullable', 'integer', 'exists:users,id'],
        ]);

        return new ContentResource($review->decide($request->user(), $content, $stage, $data));
    }
}
