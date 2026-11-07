<?php

namespace App\Core\Platform;

use DomainException;

/**
 * Raised when protected platform-role provisioning finds an existing
 * definition that conflicts with the approved one. Provisioning
 * never resolves such conflicts by silently changing privileges.
 */
final class PlatformProvisioningException extends DomainException {}
