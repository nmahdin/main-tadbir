<?php

namespace App\Core\Platform;

use DomainException;

/**
 * Optimistic-concurrency conflict on a platform role update
 * (mapped to HTTP 409 by Platform controllers): the caller's
 * expected `version` no longer matches the stored role.
 */
final class PlatformVersionConflictException extends DomainException {}
