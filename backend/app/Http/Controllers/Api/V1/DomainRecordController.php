<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\DomainRecordRequest;
use App\Http\Resources\DomainRecordResource;
use App\Models\DomainRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;

/**
 * کنترلر عمومی رکوردهای دامنه برای ماژول‌های اعلان، DAM و چت.
 *
 * مسیرها با پارامتر پیش‌فرض domain تعیین می‌شوند؛ مثال:
 *   Route::get('dam/assets', ...)->defaults('domain', DomainRecord::DOMAIN_ASSET);
 */
class DomainRecordController extends Controller
{
    /**
     * ماتریس دسترسی هر دامنه؛ دامنه‌های شخصی (اعلان/چت) فقط
     * به احراز هویت نیاز دارند.
     *
     * @var array<string, array{view: string, create: string, edit: string, delete: string}|null>
     */
    private const DOMAIN_PERMISSIONS = [
        DomainRecord::DOMAIN_ASSET_FOLDER => [
            'view' => 'assets.view',
            'create' => 'assets.upload',
            'edit' => 'assets.edit_info',
            'delete' => 'assets.delete',
        ],
        DomainRecord::DOMAIN_ASSET => [
            'view' => 'assets.view',
            'create' => 'assets.upload',
            'edit' => 'assets.edit_info',
            'delete' => 'assets.delete',
        ],
        DomainRecord::DOMAIN_NOTIFICATION => null,
        DomainRecord::DOMAIN_CONVERSATION => null,
        DomainRecord::DOMAIN_CHAT_MESSAGE => null,
    ];

    public function index(Request $request): AnonymousResourceCollection
    {
        $domain = $this->domain($request);
        $this->authorizePermission($request, $domain, 'view');

        $records = DomainRecord::query()
            ->where('domain', $domain)
            ->when($domain === DomainRecord::DOMAIN_NOTIFICATION, fn ($query) => $query->where('user_id', $request->user()?->id))
            ->when($domain === DomainRecord::DOMAIN_CHAT_MESSAGE && $request->filled('conversation_id'), function ($query) use ($request): void {
                $query->where('parent_id', (int) $request->integer('conversation_id'));
            })
            ->latest()
            ->paginate(min(max($request->integer('per_page', 100), 1), 200));

        return DomainRecordResource::collection($records);
    }

    public function store(DomainRecordRequest $request): JsonResponse
    {
        $domain = $this->domain($request);
        $this->authorizePermission($request, $domain, 'create');

        $record = DomainRecord::create($this->attributes($request, $domain));

        return (new DomainRecordResource($record))->response()->setStatusCode(201);
    }

    public function show(Request $request, DomainRecord $domain_record): DomainRecordResource
    {
        $domain = $this->domain($request);
        abort_unless($domain_record->domain === $domain, 404);
        $this->authorizeScopedRecord($request, $domain, $domain_record, 'view');

        return new DomainRecordResource($domain_record);
    }

    public function update(DomainRecordRequest $request, DomainRecord $domain_record): DomainRecordResource
    {
        $domain = $this->domain($request);
        abort_unless($domain_record->domain === $domain, 404);
        $this->authorizeScopedRecord($request, $domain, $domain_record, 'edit');

        $merged = [...($domain_record->payload ?? []), ...$request->all()];
        $domain_record->update($this->attributes($request, $domain, $merged, $domain_record->user_id));

        return new DomainRecordResource($domain_record->refresh());
    }

    public function destroy(Request $request, DomainRecord $domain_record): Response
    {
        $domain = $this->domain($request);
        abort_unless($domain_record->domain === $domain, 404);
        $this->authorizeScopedRecord($request, $domain, $domain_record, 'delete');
        $domain_record->delete();

        return response()->noContent();
    }

    /**
     * حذف دسته‌ای (برای خالی کردن سطل زباله DAM).
     */
    public function destroyBatch(Request $request): Response
    {
        $domain = $this->domain($request);
        $this->authorizePermission($request, $domain, 'delete');

        $ids = collect($request->array('ids'))
            ->map(fn ($id) => (int) $id)
            ->filter(fn (int $id) => $id > 0)
            ->values();

        if ($ids->isNotEmpty()) {
            DomainRecord::query()
                ->where('domain', $domain)
                ->whereIn('id', $ids)
                ->when($domain === DomainRecord::DOMAIN_NOTIFICATION, fn ($query) => $query->where('user_id', $request->user()?->id))
                ->delete();
        }

        return response()->noContent();
    }

    /**
     * @param  array<string, mixed>|null  $payload
     * @return array<string, mixed>
     */
    private function attributes(Request $request, string $domain, ?array $payload = null, ?int $currentUserId = null): array
    {
        $payload ??= $request->all();
        $payload = Arr::except($payload, ['id', 'createdAt', 'updatedAt']);

        $owner = $payload['userId']
            ?? $payload['createdBy']
            ?? $payload['senderId']
            ?? null;

        $conversationId = $payload['conversationId'] ?? null;

        return [
            'domain' => $domain,
            'user_id' => $domain === DomainRecord::DOMAIN_NOTIFICATION
                ? (is_numeric($owner) ? (int) $owner : $request->user()?->id)
                : ($currentUserId ?? (is_numeric($owner) ? (int) $owner : $request->user()?->id)),
            'parent_id' => is_numeric($conversationId) ? (int) $conversationId : null,
            'title' => is_string($payload['title'] ?? null) ? $payload['title'] : null,
            'status' => is_string($payload['status'] ?? null) ? $payload['status'] : null,
            'payload' => $payload,
        ];
    }

    private function domain(Request $request): string
    {
        return (string) $request->route('domain');
    }

    private function authorizePermission(Request $request, string $domain, string $action): void
    {
        $permission = self::DOMAIN_PERMISSIONS[$domain][$action] ?? null;

        if ($permission !== null) {
            abort_unless($request->user()?->hasAnyPermission($permission), 403, 'دسترسی لازم برای این بخش را ندارید.');
        }
    }

    /**
     * رکوردهای شخصی (اعلان‌ها) فقط برای صاحبشان قابل ویرایش/حذف‌اند.
     */
    private function authorizeScopedRecord(Request $request, string $domain, DomainRecord $record, string $action): void
    {
        $this->authorizePermission($request, $domain, $action);

        if ($domain === DomainRecord::DOMAIN_NOTIFICATION) {
            abort_unless($record->user_id === $request->user()?->id, 403, 'این اعلان متعلق به شما نیست.');
        }
    }
}
