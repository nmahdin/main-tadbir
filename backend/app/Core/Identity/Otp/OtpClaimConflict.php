<?php

namespace App\Core\Identity\Otp;

use RuntimeException;

/** Verified phone already claimed by another account (AMB-06 fail-closed). */
final class OtpClaimConflict extends RuntimeException {}
