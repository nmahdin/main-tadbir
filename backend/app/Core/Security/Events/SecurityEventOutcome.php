<?php

namespace App\Core\Security\Events;

enum SecurityEventOutcome: string
{
    case SUCCESS = 'success';
    case FAILURE = 'failure';
    case BLOCKED = 'blocked';
    case RATE_LIMITED = 'rate_limited';
}
