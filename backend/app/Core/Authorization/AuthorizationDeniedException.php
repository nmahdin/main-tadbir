<?php

namespace App\Core\Authorization;

/**
 * The request is authenticated but not authorized in this workspace
 * context (HTTP 403). Reason codes are stable contract strings.
 */
class AuthorizationDeniedException extends AuthorizationException
{
    public const ACCOUNT_INACTIVE = 'account_inactive';

    public const WORKSPACE_INACTIVE = 'workspace_inactive';

    public const MEMBERSHIP_MISSING = 'workspace_membership_missing';

    public const MEMBERSHIP_INACTIVE = 'workspace_membership_inactive';

    public const ORGANIZATION_MEMBERSHIP_MISSING = 'organization_membership_missing';

    public const ORGANIZATION_MEMBERSHIP_INACTIVE = 'organization_membership_inactive';

    public const ORGANIZATION_SUSPENDED = 'organization_suspended';

    public const PERMISSION_MISSING = 'permission_missing';

    public const GATE_UNIMPLEMENTED = 'gate_unimplemented';

    public const GATE_DENIED = 'gate_denied';

    public function httpStatus(): int
    {
        return 403;
    }
}
