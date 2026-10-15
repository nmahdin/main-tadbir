<?php

namespace App\Core\Authorization\Contracts;

use App\Core\Workspaces\Workspace;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Contract for operational records owned by exactly one workspace
 * (core.md §2/ADR-0002). Business-module models implement this (with
 * the ScopesToWorkspace trait) when they migrate in Stage 05; Stage
 * 04A defines the contract only and changes no legacy model.
 */
interface WorkspaceOwned
{
    public function workspace(): BelongsTo;

    public function getWorkspaceId(): ?int;

    public function isInWorkspace(Workspace $workspace): bool;
}
