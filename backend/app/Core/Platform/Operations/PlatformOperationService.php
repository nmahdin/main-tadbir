<?php

namespace App\Core\Platform\Operations;

use App\Core\Audit\AuditWriter;
use App\Core\Identity\AccountStatus;
use App\Core\Platform\PlatformControlLock;
use App\Core\Platform\PlatformOperationRequest;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Bootstrap and emergency-recovery execution (Stage C2-4).
 *
 * Transport-independent: Artisan adapters verify a signed token
 * and call execute(); nothing here knows about HTTP, cron, or SSH,
 * and no HTTP endpoint may call it. Legacy admin status plays no
 * role anywhere in this service.
 *
 * Transaction contract (one transaction per operation): control
 * lock → replay check → precondition checks → grant → bootstrap
 * closure (bootstrap only) → operation-request consumption → audit
 * record. Any failure rolls all of it back. The audit actor is
 * null: the attributable identity is the independently established
 * infrastructure operator recorded in the summary — no application
 * user identity is ever invented for the operator.
 */
final class PlatformOperationService
{
    public function __construct(
        private readonly PlatformControlLock $controlLock,
        private readonly PlatformRoleProvisioner $provisioner,
        private readonly AuditWriter $audit,
    ) {}

    public function execute(VerifiedOperation $operation): PlatformRoleAssignment
    {
        return DB::transaction(fn (): PlatformRoleAssignment => $operation->isBootstrap()
            ? $this->bootstrap($operation)
            : $this->recover($operation));
    }

    /**
     * Best-effort diagnostic for a rejected request. Kept strictly
     * separate from the transactional audit semantics: failures
     * here never affect the rejection itself, and no secret or
     * token material is ever recorded.
     */
    public function recordRejection(VerifiedOperation $operation, string $failureCode): void
    {
        try {
            PlatformOperationRequest::updateOrCreate(
                ['request_id' => $operation->requestId],
                [
                    'operation' => $operation->operation,
                    'operator_id' => $operation->operatorId,
                    'incident_id' => $operation->incidentId,
                    'status' => 'rejected',
                    'failure_code' => $failureCode,
                ],
            );
        } catch (Throwable) {
            // Diagnostics must never mask the real rejection.
        }
    }

    private function bootstrap(VerifiedOperation $operation): PlatformRoleAssignment
    {
        $control = $this->controlLock->lock();
        $this->assertNotReplayed($operation);

        if ($control->bootstrap_completed_at !== null) {
            throw new PlatformOperationException('bootstrap_closed', 'Platform bootstrap has already completed.');
        }

        $primaryRole = $this->provisioner->ensurePrimaryAdministrator();

        $historyExists = PlatformRoleAssignment::query()
            ->where('platform_role_id', $primaryRole->id)
            ->exists();
        if ($historyExists) {
            throw new PlatformOperationException(
                'bootstrap_history_exists',
                'A Primary Administrator assignment has existed before; bootstrap is permanently closed.',
            );
        }

        $target = $this->resolveOperationalTarget($operation);

        if ($this->activeAssignmentOf($target) !== null) {
            throw new PlatformOperationException(
                'operation_conflict',
                'The bootstrap target already holds an active platform role.',
            );
        }

        $assignment = PlatformRoleAssignment::create([
            'user_id' => $target->id,
            'platform_role_id' => $primaryRole->id,
            'granted_by_user_id' => null,
        ]);

        $control->forceFill([
            'bootstrap_completed_at' => now(),
            'bootstrapped_user_id' => $target->id,
        ])->save();

        $this->consume($operation, $target);
        $this->audit->record(
            null,
            'platform.bootstrap_completed',
            $this->summary($operation),
            'platform',
            null,
            'user',
            (int) $target->id,
        );

        return $assignment;
    }

    private function recover(VerifiedOperation $operation): PlatformRoleAssignment
    {
        $control = $this->controlLock->lock();
        $this->assertNotReplayed($operation);

        if ($control->bootstrap_completed_at === null) {
            throw new PlatformOperationException(
                'bootstrap_not_completed',
                'Emergency recovery requires a previously completed bootstrap.',
            );
        }

        if ($operation->incidentId === null
            || $operation->incidentReason === null
            || $operation->evidenceReferences === []
            || $operation->verificationMethod === null
            || $operation->verificationReference === null) {
            throw new PlatformOperationException(
                'incident_evidence_missing',
                'Recovery requires an incident ID, reason, evidence references, and independent verification metadata.',
            );
        }

        $primaryRole = $this->provisioner->ensurePrimaryAdministrator();

        // Database-observable usability: an operationally active
        // account holding an unrevoked primary assignment. An
        // active primary whose credentials are merely claimed lost
        // is still usable here and blocks recovery — unverifiable
        // lockout assertions fail closed.
        $usablePrimaryExists = PlatformRoleAssignment::query()
            ->where('platform_role_id', $primaryRole->id)
            ->whereNull('revoked_at')
            ->whereHas('user', fn ($query) => $query->where('status', 'active'))
            ->exists();
        if ($usablePrimaryExists) {
            throw new PlatformOperationException(
                'recovery_not_needed',
                'A usable Primary Administrator exists; emergency recovery is not permitted.',
            );
        }

        $target = $this->resolveOperationalTarget($operation);

        $current = $this->activeAssignmentOf($target);
        if ($current !== null) {
            $current->forceFill(['revoked_at' => now(), 'revoked_by_user_id' => null])->save();
        }

        $assignment = PlatformRoleAssignment::create([
            'user_id' => $target->id,
            'platform_role_id' => $primaryRole->id,
            'granted_by_user_id' => null,
        ]);

        $this->consume($operation, $target);
        $this->audit->record(
            null,
            'platform.emergency_recovery',
            $this->summary($operation) + [
                'incident_id' => $operation->incidentId,
                'reason' => $operation->incidentReason,
                'evidence' => $operation->evidenceReferences,
                'verification_method' => $operation->verificationMethod,
                'verification_reference' => $operation->verificationReference,
            ],
            'platform',
            null,
            'user',
            (int) $target->id,
        );

        return $assignment;
    }

    private function assertNotReplayed(VerifiedOperation $operation): void
    {
        $consumed = PlatformOperationRequest::query()
            ->where('request_id', $operation->requestId)
            ->where('status', 'consumed')
            ->exists();
        if ($consumed) {
            throw new PlatformOperationException(
                'request_replayed',
                'This operation request has already been consumed.',
            );
        }
    }

    private function resolveOperationalTarget(VerifiedOperation $operation): User
    {
        $target = User::where('username', $operation->targetUsername)->lockForUpdate()->first();
        if ($target === null) {
            throw new PlatformOperationException('target_not_found', 'The selected target user does not exist.');
        }

        $status = AccountStatus::of($target->status);
        if ($status === null || ! $status->allowsOperationalAccess()) {
            throw new PlatformOperationException(
                'target_not_operational',
                'The target account does not permit operational access.',
            );
        }

        return $target;
    }

    private function activeAssignmentOf(User $user): ?PlatformRoleAssignment
    {
        return PlatformRoleAssignment::query()
            ->where('user_id', $user->id)
            ->whereNull('revoked_at')
            ->lockForUpdate()
            ->first();
    }

    private function consume(VerifiedOperation $operation, User $target): void
    {
        PlatformOperationRequest::updateOrCreate(
            ['request_id' => $operation->requestId],
            [
                'operation' => $operation->operation,
                'operator_id' => $operation->operatorId,
                'target_user_id' => $target->id,
                'incident_id' => $operation->incidentId,
                'status' => 'consumed',
                'failure_code' => null,
                'consumed_at' => now(),
            ],
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function summary(VerifiedOperation $operation): array
    {
        return [
            'operator_id' => $operation->operatorId,
            'request_id' => $operation->requestId,
            'operation' => $operation->operation,
        ];
    }
}
