<?php

namespace App\Core\Security\Mfa;

enum MfaFactorType: string
{
    case TOTP = 'totp';
}
