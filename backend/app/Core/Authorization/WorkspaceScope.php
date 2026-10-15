<?php

namespace App\Core\Authorization;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Query-level workspace scoping for operational data (Stage 04A,
 * ADR-0008 §3). Business modules use this with a resolved
 * WorkspaceContext instead of embedding permission or membership logic
 * in controllers: list queries are constrained server-side, and any
 * record fetched by ID (direct or nested) is asserted to belong to
 * the context, with foreign and missing records indistinguishable
 * (404) so direct-object-reference probing learns nothing.
 */
final class WorkspaceScope
{
    public static function apply(Builder $query, WorkspaceContext $context, string $column = 'workspace_id'): Builder
    {
        return $query->where($column, $context->workspaceId());
    }

    /**
     * @throws InvalidAuthorizationContextException when the record is
     *         outside the context (or carries no workspace reference)
     */
    public static function assertRecordInContext(Model $record, WorkspaceContext $context, string $attribute = 'workspace_id'): void
    {
        $recordWorkspaceId = $record->getAttribute($attribute);

        if ($recordWorkspaceId === null || (int) $recordWorkspaceId !== $context->workspaceId()) {
            throw new InvalidAuthorizationContextException(
                'record_outside_workspace',
                'The record does not belong to the resolved workspace.',
            );
        }
    }

    /**
     * Nested-resource guard: a child record must belong both to the
     * resolved context and to the already-authorized parent record
     * (parent ownership is expressed by the child's foreign key).
     *
     * @throws InvalidAuthorizationContextException
     */
    public static function assertNestedInContext(Model $child, Model $parent, WorkspaceContext $context, string $parentKey = 'workspace_id', string $workspaceAttribute = 'workspace_id'): void
    {
        self::assertRecordInContext($child, $context, $workspaceAttribute);

        $childParentId = $child->getAttribute($parentKey);
        if ($parentKey !== $workspaceAttribute
            && ($childParentId === null || (int) $childParentId !== (int) $parent->getKey())) {
            throw new InvalidAuthorizationContextException(
                'record_outside_parent',
                'The record does not belong to the resolved parent resource.',
            );
        }
    }
}
