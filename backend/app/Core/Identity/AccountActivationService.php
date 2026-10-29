<?php

namespace App\Core\Identity;

use App\Core\Subscriptions\FreePlanActivator;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Post-verification activation (AUTH-EXT-01 §4.4/§4.5): flips a
 * verified pending account to active, provisions the one personal
 * workspace through the existing idempotent provisioner, and attaches
 * the Personal Free entitlement ONLY when the C5-owned plan key is
 * configured and published (AMB-02=A). A missing plan is recorded as
 * an explicit pending dependency — never faked.
 */
final class AccountActivationService
{
    public function __construct(
        private readonly PersonalWorkspaceProvisioner $workspaces,
        private readonly FreePlanActivator $freePlans,
    ) {}

    public function activate(User $user): User
    {
        return DB::transaction(function () use ($user): User {
            if ($user->status === 'pending') {
                $user->forceFill(['status' => 'active'])->save();
            }
            $workspace = $this->workspaces->ensureDefault($user);

            // C5-EXT-01 M1: entitlement attachment is delegated to the
            // C5-owned FreePlanActivator (no billing rules live here).
            // It is attempted whenever the workspace lacks a
            // subscription — NOT only on first provisioning — so
            // accounts previously recorded as `pending_plan` complete
            // automatically once the Free plan is published. The
            // outcome stays explicit in the audit record and a missing
            // plan is a recoverable pending state, never faked.
            $entitlement = $this->freePlans->activateForPersonalWorkspace(
                $user,
                $workspace,
                'auth-activation-'.$user->id,
            );

            $user->forceFill([
                'personal_workspace_provisioned_at' => $user->personal_workspace_provisioned_at ?? now(),
            ])->save();

            ActivityLog::create([
                'user_id' => $user->id,
                'action' => 'فعال‌سازی حساب و آماده‌سازی فضای کاری شخصی',
                'type' => 'auth.activated',
                'details' => 'entitlement='.$entitlement.' workspace='.$workspace->id.' correlation='.Str::uuid(),
            ]);

            return $user->fresh();
        });
    }
}
