<?php

namespace App\Core\Security\Mfa;

enum MfaFactorStatus: string
{
    case PENDING = 'pending';
    case ACTIVE = 'active';
    case DISABLED = 'disabled';
}
