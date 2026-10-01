<?php

namespace App\Events;

/** A successful in-panel publication command, NOT proof of external delivery. */
final readonly class ContentPublished
{
    public function __construct(public int $contentId, public int $actorId, public string $eventId) {}
}
