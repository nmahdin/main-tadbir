<?php

namespace App\Core\Authorization;

use App\Core\Workspaces\Workspace;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Reusable workspace scoping for WorkspaceOwned models (Stage 04A).
 * Provides the workspace relation, the context-based query scopes,
 * and the ownership predicate, so a migrating module model gets the
 * full contract by using this trait — its controllers stay free of
 * scoping logic. Assumes a `workspace_id` column, per the module
 * migration contract in core.md.
 *
 * @mixin Model
 */
trait ScopesToWorkspace
{
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function getWorkspaceId(): ?int
    {
        return $this->workspace_id !== null ? (int) $this->workspace_id : null;
    }

    public function isInWorkspace(Workspace $workspace): bool
    {
        return $this->getWorkspaceId() === (int) $workspace->id;
    }

    public function scopeForWorkspace(Builder $query, Workspace $workspace): Builder
    {
        return $query->where('workspace_id', (int) $workspace->id);
    }

    public function scopeForContext(Builder $query, WorkspaceContext $context): Builder
    {
        return $query->where('workspace_id', $context->workspaceId());
    }
}
