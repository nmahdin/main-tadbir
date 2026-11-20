<?php

namespace App\Core\Inbox;

use App\Core\Audit\AuditWriter;
use App\Core\Organizations\Organization;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * Service layer for CORE-REQ. Origin modules publish action items via
 * `publish()` and resolve them via `resolveOrigin()`; the controller
 * handles user-visible listing and the lifecycle sweep marks overdue
 * items. All mutating writes are transactional and audit-logged.
 */
final class ActionInboxService
{
    public function __construct(
        private readonly AuditWriter $audit,
    ) {}

    /**
     * Publish (upsert) an action item. Returns the saved model.
     *
     * @param  array{origin_module:string,origin_type:string,origin_id:int,action_kind:string,title:string,summary?:string,deep_link?:string,urgency?:string,due_at?:CarbonImmutable|null,assigned_user_id?:int|null,allowed_actions?:array<int,string>,origin_context?:array<string,mixed>|null}  $payload
     */
    public function publish(
        User $actor,
        array $payload,
        ?User $recipientUser = null,
        ?Organization $organization = null,
    ): CoreActionItem {
        if (($recipientUser === null) === ($organization === null)) {
            throw new InvalidArgumentException('Action item must target exactly one of user or organization.');
        }

        $kind = ActionItemStatus::from($payload['action_kind'] ?? ActionItemStatus::OPEN->value);
        $urgency = ActionItemUrgency::from($payload['urgency'] ?? ActionItemUrgency::NORMAL->value);

        return DB::transaction(function () use ($actor, $payload, $recipientUser, $organization, $kind, $urgency): CoreActionItem {
            /** @var CoreActionItem $item */
            $item = CoreActionItem::query()->updateOrCreate(
                [
                    'origin_module' => $payload['origin_module'],
                    'origin_type' => $payload['origin_type'],
                    'origin_id' => (int) $payload['origin_id'],
                    'recipient_user_id' => $recipientUser?->id,
                    'organization_id' => $organization?->id,
                ],
                [
                    'action_kind' => $kind->value,
                    'title' => mb_substr((string) $payload['title'], 0, 200),
                    'summary' => isset($payload['summary']) ? mb_substr((string) $payload['summary'], 0, 500) : null,
                    'deep_link' => isset($payload['deep_link']) ? CoreActionItem::safeDeepLink((string) $payload['deep_link']) : null,
                    'urgency' => $urgency->value,
                    'due_at' => $payload['due_at'] ?? null,
                    'assigned_user_id' => $payload['assigned_user_id'] ?? null,
                    'allowed_actions' => array_values(array_unique(Arr::wrap($payload['allowed_actions'] ?? []))),
                    'origin_context' => $payload['origin_context'] ?? null,
                    'resolved_at' => null,
                    'resolved_by_module' => null,
                ],
            );

            $this->audit->record(
                $actor,
                'action_item.publish',
                ['item_id' => (int) $item->id, 'origin' => $item->originModuleKey(), 'kind' => $kind->value],
            );

            return $item;
        });
    }

    /**
     * Resolve items for a given origin reference (idempotent). Used by
     * origin modules when the underlying business operation completes.
     *
     * @return int Number of items resolved (0 if already resolved).
     */
    public function resolveOrigin(
        string $originModule,
        string $originType,
        int $originId,
        string $byModule,
        ?User $actor = null,
    ): int {
        return DB::transaction(function () use ($originModule, $originType, $originId, $byModule, $actor): int {
            $items = CoreActionItem::query()
                ->where('origin_module', $originModule)
                ->where('origin_type', $originType)
                ->where('origin_id', $originId)
                ->whereNull('resolved_at')
                ->lockForUpdate()
                ->get();

            foreach ($items as $item) {
                $item->resolve($byModule, $actor, null, $this->audit);
            }

            return $items->count();
        });
    }

    /**
     * Mark items past their due_at as OVERDUE. Runs from the scheduler.
     * Returns the number of items newly marked overdue.
     */
    public function sweepOverdue(?CarbonImmutable $now = null): int
    {
        $now ??= CarbonImmutable::now('UTC');
        $n = 0;
        foreach (CoreActionItem::query()->overdue($now)->where('action_kind', '!=', ActionItemStatus::OVERDUE->value)->cursor() as $item) {
            if ($item->markOverdueIfDue($now)) {
                $n++;
            }
        }

        return $n;
    }

    /**
     * Unresolved-count for a user (used by the top-bar badge).
     */
    public function unresolvedCountForUser(User $user): int
    {
        return CoreActionItem::query()->forUser($user)->open()->count();
    }
}
