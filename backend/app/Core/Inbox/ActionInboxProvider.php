<?php

namespace App\Core\Inbox;

/**
 * Provider/adapter contract for CORE-REQ. Origin modules (billing,
 * invitations, content, etc.) implement this interface to register
 * action items. The inbox itself never executes business commands
 * based on an action id — the origin module remains authoritative.
 */
interface ActionInboxProvider
{
    /**
     * Stable machine key identifying this origin module, e.g. 'billing'.
     */
    public function originModuleKey(): string;

    /**
     * Called by the reconciliation sweep; the provider must publish
     * all currently-open items it owns via ActionInboxService::publish
     * and resolve any items whose underlying state is complete via
     * resolveOrigin. Implementations MUST be idempotent.
     */
    public function reconcile(ActionInboxService $inbox): void;
}
