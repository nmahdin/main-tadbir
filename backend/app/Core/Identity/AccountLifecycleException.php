<?php

namespace App\Core\Identity;

use DomainException;

/**
 * An account lifecycle transition was rejected (invalid transition,
 * or a protected invariant such as the final-manager rule would be
 * violated). HTTP surfaces map this to 422; nothing was changed.
 */
final class AccountLifecycleException extends DomainException {}
