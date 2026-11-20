<?php

namespace App\Core\Security\Sessions;

use App\Core\Security\Events\SecurityEventOutcome;
use App\Core\Security\Events\SecurityEventWriter;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Record privileged step-up verifications for a given auth token and
 * permission scope. A step-up is valid for 15 minutes by default for
 * read-heavy operational pages and 5 minutes for high-risk actions
 * (backups, restores, role changes).
 */
final class StepUpService
{
    public const DEFAULT_TTL_MINUTES = 15;

    public const SENSITIVE_TTL_MINUTES = 5;

    public function __construct(private readonly SecurityEventWriter $events) {}

    public function markVerified(
        User $user,
        string $authTokenId,
        string $scope,
        Request $request,
        ?int $ttlMinutes = null,
    ): void {
        $ttl = $ttlMinutes ?? self::DEFAULT_TTL_MINUTES;
        $at = CarbonImmutable::now();
        // Revoke any prior entries for same (user, scope, token).
        DB::table('security_step_up_sessions')
            ->where('user_id', $user->id)
            ->where('auth_token_id', $authTokenId)
            ->where('scope', $scope)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => $at]);

        DB::table('security_step_up_sessions')->insert([
            'user_id' => $user->id,
            'auth_token_id' => $authTokenId,
            'scope' => $scope,
            'verified_at' => $at,
            'expires_at' => $at->addMinutes($ttl),
            'request_ip' => $request->ip(),
            'created_at' => $at,
        ]);
        $this->events->record('step_up.verified', SecurityEventOutcome::SUCCESS,
            $user, $user->id, scopeType: $scope, request: $request);
    }

    public function isVerified(User $user, string $authTokenId, string $scope): bool
    {
        return DB::table('security_step_up_sessions')
            ->where('user_id', $user->id)
            ->where('auth_token_id', $authTokenId)
            ->where('scope', $scope)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->exists();
    }

    public function revokeForUser(User $user, ?string $scope = null): void
    {
        $q = DB::table('security_step_up_sessions')
            ->where('user_id', $user->id)->whereNull('revoked_at');
        if ($scope !== null) {
            $q = $q->where('scope', $scope);
        }
        $q->update(['revoked_at' => now()]);
    }
}
