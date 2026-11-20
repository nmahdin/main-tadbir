<?php

namespace App\Core\Operations\Restore;

enum RestoreVerificationStatus: string
{
    case REQUESTED = 'requested';
    case PREFLIGHT_PASSED = 'preflight_passed';
    case RESTORING = 'restoring';
    case RESTORED = 'restored';
    case VERIFIED = 'verified';
    case FAILED = 'failed';
}
