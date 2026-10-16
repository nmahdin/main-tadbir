<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Identity\AccountLifecycle;
use App\Core\Identity\AccountLifecycleException;
use App\Core\Rbac\RbacValidationException;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Stage C1 — Core v1 account lifecycle endpoint.
 *
 * POST /api/v1/users/{user}/account-lifecycle {action, reason?}
 *
 * Thin adapter over Core\Identity\AccountLifecycle. Authorization
 * mirrors the existing account-administration rule for status
 * changes (system admin or the dedicated users.status permission);
 * all transition rules, token revocation, membership termination
 * and audit live in the Core service.
 */
final class AccountLifecycleController extends Controller
{
    public function __invoke(Request $request, User $user, AccountLifecycle $lifecycle): UserResource
    {
        $actor = $request->user()->fresh();
        // Stage C2-3: platform.users.manage_status is an additional,
        // equivalent authorization path. All lifecycle rules and
        // C1 safeguards are unchanged and live in AccountLifecycle.
        abort_unless(
            $actor->isAdmin()
            || $actor->hasPermission('users.status')
            || app(\App\Core\Platform\PlatformAuthorizer::class)->allows($actor, 'platform.users.manage_status'),
            403,
        );

        $data = $request->validate([
            'action' => ['required', Rule::in(['suspend', 'restore', 'deactivate'])],
            'reason' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        try {
            $updated = match ($data['action']) {
                'suspend' => $lifecycle->suspend($actor, $user, $data['reason'] ?? null),
                'restore' => $lifecycle->restore($actor, $user),
                'deactivate' => $lifecycle->deactivate($actor, $user, $data['reason'] ?? null),
            };
        } catch (AccountLifecycleException|RbacValidationException $exception) {
            abort(422, $exception->getMessage());
        }

        return new UserResource($updated->load(['role.permissions', 'department']));
    }
}
