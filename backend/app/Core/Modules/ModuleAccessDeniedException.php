<?php

namespace App\Core\Modules;

use App\Core\Authorization\AuthorizationDeniedException;

/**
 * Operational access to a business module was denied by the
 * module access guard (Stage C4-2). Reason codes are stable:
 * module_unknown, module_unavailable, module_not_enabled,
 * organization_policy_denied, entitlement_missing. Always 403 —
 * the module layer never widens an RBAC decision.
 */
final class ModuleAccessDeniedException extends AuthorizationDeniedException
{
    public const MODULE_UNKNOWN = 'module_unknown';

    public const MODULE_UNAVAILABLE = 'module_unavailable';

    public const MODULE_NOT_ENABLED = 'module_not_enabled';

    public const ORGANIZATION_POLICY_DENIED = 'organization_policy_denied';

    public const ENTITLEMENT_MISSING = 'entitlement_missing';

    public function __construct(string $reason, string $message)
    {
        parent::__construct($reason, $message);
    }
}
