<?php

namespace App\Core\Messaging;

/**
 * Audience scope for an official system message:
 *  - platform: every active user
 *  - organization: all active members of a specific organization
 *  - personal: a single user
 */
enum SystemMessageAudience: string
{
    case Platform = 'platform';
    case Organization = 'organization';
    case Personal = 'personal';
}
