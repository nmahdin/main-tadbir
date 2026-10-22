<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Invitations\InvitationAcceptanceService;
use App\Core\Invitations\InvitationException;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Authenticated invitation acceptance (Stage C6-3 over the
 * Stage C6-2 atomic service).
 *
 * The request may carry ONLY the raw invitation token: actor,
 * membership, role, and target scope always come from the
 * authenticated identity and the persisted invitation — any
 * client-supplied override fields are ignored by design (they
 * are never read). Acceptance requires the account's verified
 * normalized email to match the invitation target; every
 * semantic (atomic combined creation, role preservation, inviter
 * reauthorization, ceilings, single-use, exact expiry,
 * transactional audit, suspended/ended denial) is enforced
 * transactionally by InvitationAcceptanceService.
 */
final class InvitationAcceptanceController extends Controller
{
    public function __construct(
        private readonly InvitationAcceptanceService $acceptance,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'max:512'],
        ]);

        try {
            $result = $this->acceptance->accept($request->user(), $data['token']);
        } catch (InvitationException $exception) {
            $status = match ($exception->errorCode) {
                'invitation_not_found' => 404,
                'invitation_forbidden', 'invitation_email_mismatch',
                'invitation_grant_ceiling', 'invitation_inviter_authority_lost' => 403,
                'invitation_expired', 'invitation_revoked',
                'invitation_membership_conflict', 'invitation_prerequisite_missing',
                'invitation_organization_unavailable', 'invitation_already_accepted' => 409,
                default => 422,
            };

            return response()->json([
                'message' => $exception->getMessage(),
                'code' => $exception->errorCode,
            ], $status);
        }

        return response()->json([
            'data' => [
                'invitation_id' => $result->invitationId,
                'type' => $result->type,
                'organization_id' => $result->organizationId,
                'workspace_id' => $result->workspaceId,
                'created_organization_membership' => $result->createdOrganizationMembership,
                'created_workspace_membership' => $result->createdWorkspaceMembership,
                'preserved_existing_organization_role' => $result->preservedExistingOrganizationRole,
                'preserved_existing_workspace_role' => $result->preservedExistingWorkspaceRole,
                'navigation_target' => $result->navigationTarget(),
            ],
        ]);
    }
}
