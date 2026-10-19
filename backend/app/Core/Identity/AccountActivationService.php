<?php

namespace App\Core\Identity;

use App\Core\Subscriptions\SubscriptionException;
use App\Core\Subscriptions\SubscriptionService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Models\ActivityLog;
use App\Models\User;
use Carbon\CarbonImmutable;
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
        private readonly SubscriptionService $subscriptions,
    ) {}

    public function activate(User $user): User
    {
        return DB::transaction(function () use ($user): User {
            if ($user->status === 'pending') {
                $user->forceFill(['status' => 'active'])->save();
            }
            $workspace = $this->workspaces->ensureDefault($user);

            $planKey = (string) config('auth.personal_free_plan_key', '');
            $entitlement = 'not_configured';
            if ($planKey !== '' && $user->personal_workspace_provisioned_at === null) {
                try {
                    $this->subscriptions->assignInitial(
                        $user,
                        $workspace,
                        $planKey,
                        (int) config('auth.personal_free_plan_version', 1),
                        CarbonImmutable::now(),
                        CarbonImmutable::now()->addYears(100),
                        'Personal Free entitlement on account activation (AUTH-EXT-01)',
                        'auth-activation-'.$user->id,
                    );
                    $entitlement = 'attached';
                } catch (SubscriptionException $exception) {
                    // Dependency of C5 policy (AMB-02): the plan may not
                    // exist yet. Workspace access is real; only the
                    // entitlement leg stays pending and visible.
                    $entitlement = 'pending_plan:'.$exception->errorCode;
                }
            }

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
