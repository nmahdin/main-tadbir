<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CommentResource;
use App\Models\Comment;
use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\Task;
use App\Models\WorkspaceRecord;
use App\Services\CommentNotifications;
use App\Services\ContentAccess;
use App\Services\TaskOperations;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class CommentController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'subject_type' => ['nullable', Rule::in(Comment::SUBJECTS)],
            'subject_id' => ['nullable', 'integer', 'min:1'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'search' => ['nullable', 'string', 'max:200'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $user = $request->user();
        abort_unless($user?->isActive(), 403);

        $comments = Comment::query()->with('user:id,name,avatar')
            ->where(function (Builder $query) use ($user): void {
                if ($user->hasPermission('tasks.view')) {
                    $query->orWhere('subject_type', 'task');
                }
                if ($user->hasPermission('content.view')) {
                    $query->orWhere('subject_type', 'content');
                } elseif (app(ContentAccess::class)->departmentIds($user) !== []) {
                    $query->orWhere(function (Builder $query) use ($user): void {
                        $query->where('subject_type', 'content')
                            ->whereIn('subject_id', app(ContentAccess::class)->visibleTo($user)->select('id'));
                    });
                }
                if ($user->hasPermission('thinktank.view')) {
                    $query->orWhere('subject_type', 'idea');
                }
                if ($user->hasPermission('assets.view')) {
                    $query->orWhere('subject_type', 'asset');
                }
            })
            ->when($data['subject_type'] ?? null, fn (Builder $query, string $type) => $query->where('subject_type', $type))
            ->when($data['subject_id'] ?? null, fn (Builder $query, int $id) => $query->where('subject_id', $id))
            ->when($data['user_id'] ?? null, fn (Builder $query, int $id) => $query->where('user_id', $id))
            ->when($data['search'] ?? null, fn (Builder $query, string $search) => $query->where('body', 'like', "%{$search}%"))
            ->latest('created_at')->latest('id')
            ->paginate($data['per_page'] ?? 20)->withQueryString();

        $this->hydrateSubjects($comments->getCollection());

        return CommentResource::collection($comments);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subjectType' => ['required', Rule::in(Comment::SUBJECTS)],
            'subjectId' => ['required', 'integer', 'min:1'],
            'text' => ['required', 'string', 'max:3000'],
            'replyToId' => ['nullable', 'integer', 'exists:comments,id'],
            'assetIds' => ['nullable', 'array', 'max:10'],
            'assetIds.*' => ['integer', 'distinct'],
        ]);
        $user = $request->user();
        $type = $data['subjectType'];
        $id = (int) $data['subjectId'];
        $subject = $this->authorizeSubject($user, $type, $id);

        if (isset($data['replyToId'])) {
            $parent = Comment::whereKey($data['replyToId'])->where('subject_type', $type)->where('subject_id', $id)->first();
            abort_unless($parent, 422, 'پاسخ باید به دیدگاهی از همین مورد متصل باشد.');
            // Root comments are level zero; allow at most three nested replies.
            $depth = 1;
            $cursor = $parent;
            while ($cursor->parent_id && $depth <= 3) {
                $depth++;
                $cursor = Comment::query()->find($cursor->parent_id);
                if (! $cursor) {
                    break;
                }
            }
            abort_if($depth > 3, 422, 'حداکثر سه سطح پاسخ برای هر دیدگاه مجاز است.');
        }
        if ($type === 'task') {
            $comment = app(TaskOperations::class)->report($user, $subject, trim($data['text']));
            if (isset($data['replyToId']) || ! empty($data['assetIds'])) {
                $comment->update(['parent_id' => $data['replyToId'] ?? null, 'metadata' => ['asset_ids' => $data['assetIds'] ?? []]]);
            }
        } else {
            $comment = Comment::create([
                'user_id' => $user->id,
                'subject_type' => $type,
                'subject_id' => $id,
                'parent_id' => $data['replyToId'] ?? null,
                'body' => trim($data['text']),
                'metadata' => empty($data['assetIds']) ? null : ['asset_ids' => $data['assetIds']],
            ]);
        }
        $comment->load('user:id,name,avatar');
        $this->hydrateSubjects(collect([$comment]));
        app(CommentNotifications::class)->created($comment, $user);

        return (new CommentResource($comment))->response()->setStatusCode(201);
    }

    public function update(Request $request, Comment $comment): CommentResource
    {
        $data = $request->validate([
            'text' => ['required', 'string', 'max:3000'],
        ]);
        $user = $request->user();
        abort_unless(
            (int) $comment->user_id === (int) $user->id || $user->hasPermission('comments.edit_any'),
            403,
            'اجازه ویرایش این دیدگاه را ندارید.',
        );
        $this->authorizeSubject($user, $comment->subject_type, (int) $comment->subject_id);

        $comment->update(['body' => trim($data['text'])]);
        $comment->load('user:id,name,avatar');
        $this->hydrateSubjects(collect([$comment]));

        return new CommentResource($comment);
    }

    public function destroy(Request $request, Comment $comment): Response
    {
        $user = $request->user();
        abort_unless(
            (int) $comment->user_id === (int) $user->id || $user->hasPermission('comments.delete_any'),
            403,
            'اجازه حذف این دیدگاه را ندارید.',
        );
        $this->authorizeSubject($user, $comment->subject_type, (int) $comment->subject_id);
        $comment->delete();

        return response()->noContent();
    }

    private function authorizeSubject($user, string $type, int $id): Task|Content|WorkspaceRecord|DomainRecord
    {
        return match ($type) {
            'task' => tap(Task::findOrFail($id), fn () => abort_unless($user->hasPermission('tasks.view'), 403)),
            'content' => tap(Content::findOrFail($id), fn ($content) => abort_unless(app(ContentAccess::class)->canView($user, $content), 403)),
            'idea' => tap(WorkspaceRecord::where('kind', WorkspaceRecord::KIND_IDEA)->findOrFail($id), fn () => abort_unless($user->hasPermission('thinktank.view'), 403)),
            'asset' => tap(DomainRecord::where('domain', DomainRecord::DOMAIN_ASSET)->findOrFail($id), fn () => abort_unless($user->hasPermission('assets.view'), 403)),
        };
    }

    private function hydrateSubjects($comments): void
    {
        $types = $comments->groupBy('subject_type');
        $models = [
            'task' => Task::whereIn('id', $types->get('task', collect())->pluck('subject_id'))->pluck('title', 'id'),
            'content' => Content::whereIn('id', $types->get('content', collect())->pluck('subject_id'))->pluck('title', 'id'),
            'idea' => WorkspaceRecord::whereIn('id', $types->get('idea', collect())->pluck('subject_id'))->pluck('title', 'id'),
            'asset' => DomainRecord::whereIn('id', $types->get('asset', collect())->pluck('subject_id'))->pluck('title', 'id'),
        ];
        $urls = ['task' => '/tasks/', 'content' => '/contents/', 'idea' => '/thought-room?idea=', 'asset' => '/dam?asset='];
        foreach ($comments as $comment) {
            $comment->setAttribute('subject_title', $models[$comment->subject_type][$comment->subject_id] ?? 'مورد حذف‌شده');
            $comment->setAttribute('subject_url', ($urls[$comment->subject_type] ?? '/comments').$comment->subject_id);
        }
    }
}
