<?php

namespace App\Core\Support;

/**
 * Explicit status state machine for platform support tickets.
 * Transitions are enforced server-side in SupportTicketService.
 */
enum SupportTicketStatus: string
{
    case NEW = 'new';
    case OPEN = 'open';
    case PENDING_REPLY = 'pending_reply';
    case PENDING_USER = 'pending_user';
    case RESOLVED = 'resolved';
    case CLOSED = 'closed';

    /**
     * @return array<int, self>
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::NEW => [self::OPEN, self::PENDING_USER, self::CLOSED],
            self::OPEN => [self::PENDING_REPLY, self::PENDING_USER, self::RESOLVED, self::CLOSED],
            self::PENDING_REPLY => [self::OPEN, self::PENDING_USER, self::RESOLVED, self::CLOSED],
            self::PENDING_USER => [self::OPEN, self::RESOLVED, self::CLOSED],
            self::RESOLVED => [self::OPEN, self::CLOSED], // reopen
            self::CLOSED => [self::OPEN], // reopen only
        };
    }

    public function canTransitionTo(self $target): bool
    {
        return in_array($target, $this->allowedTransitions(), true);
    }
}
