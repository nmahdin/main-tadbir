<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Invitations\CoreInvitation;
use App\Core\Invitations\InvitationEmailNotifier;
use App\Core\Invitations\InvitationException;
use App\Core\Invitations\InvitationService;
use App\Core\Invitations\IssuedInvitation;
use App\Core\Organizations\Organization;
use App\Core\Workspaces\Workspace;
use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Thin HTTP layer over the Stage C6-1 invitation service
 * (Stage C6-3). ALL authorization (scope `*.members.manage`
 * authority, independent Grant Ceilings, organization lifecycle)
 * is enforced inside InvitationService; this controller only
 * validates input shape, maps stable domain codes to HTTP
 * statuses, and presents allowlisted fields.
 *
 * Token discipline: list/revoke responses never contain the raw
 * token or its hash. The raw token is returned exactly once, in
 * the issuance response to the authorized inviter, together with
 * the invitation link — the same one-time channel the invitation
 * email uses. After issuance the token is unrecoverable; recovery
 * from a failed email delivery is revoke + reissue.
 */
final class InvitationController extends Controller
{
    public function __construct(
        private readonly InvitationService $invitations,
        private readonly InvitationEmailNotifier $notifier,
    ) {}

    public function indexForOrganization(Request $request, Organization $organization): JsonResponse
    {
        try {
            $invitations = $this->invitations->listForOrganization($request->user(), $organization);
        } catch (InvitationException $exception) {
            return $this->domainError($exception);
        }

        return response()->json([
            'data' => array_map(fn (CoreInvitation $invitation) => $this->present($invitation), $invitations),
        ]);
    }

    public function indexForWorkspace(Request $request, Workspace $workspace): JsonResponse
    {
        try {
            $invitations = $this->invitations->listForWorkspace($request->user(), $workspace);
        } catch (InvitationException $exception) {
            return $this->domainError($exception);
        }

        return response()->json([
            'data' => array_map(fn (CoreInvitation $invitation) => $this->present($invitation), $invitations),
        ]);
    }

    public function storeForOrganization(Request $request, Organization $organization): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email', 'max:254'],
            'organization_role_id' => ['required', 'integer', 'min:1'],
            'message' => ['nullable', 'string', 'max:1000'],
            'expires_at' => ['nullable', 'date'],
        ]);

        try {
            $issued = $this->invitations->issueOrganizationInvitation(
                $request->user(),
                $organization,
                $data['email'],
                (int) $data['organization_role_id'],
                $data['message'] ?? null,
                isset($data['expires_at']) ? CarbonImmutable::parse($data['expires_at']) : null,
            );
        } catch (InvitationException $exception) {
            return $this->domainError($exception);
        }

        return $this->issuedResponse($issued, (string) $request->user()->name);
    }

    public function storeForWorkspace(Request $request, Workspace $workspace): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email', 'max:254'],
            'workspace_role_id' => ['required', 'integer', 'min:1'],
            'message' => ['nullable', 'string', 'max:1000'],
            'expires_at' => ['nullable', 'date'],
        ]);

        try {
            $issued = $this->invitations->issueWorkspaceInvitation(
                $request->user(),
                $workspace,
                $data['email'],
                (int) $data['workspace_role_id'],
                $data['message'] ?? null,
                isset($data['expires_at']) ? CarbonImmutable::parse($data['expires_at']) : null,
            );
        } catch (InvitationException $exception) {
            return $this->domainError($exception);
        }

        return $this->issuedResponse($issued, (string) $request->user()->name);
    }

    public function storeCombined(Request $request, Workspace $workspace): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email', 'max:254'],
            'organization_role_id' => ['required', 'integer', 'min:1'],
            'workspace_role_id' => ['required', 'integer', 'min:1'],
            'message' => ['nullable', 'string', 'max:1000'],
            'expires_at' => ['nullable', 'date'],
        ]);

        try {
            $issued = $this->invitations->issueCombinedInvitation(
                $request->user(),
                $workspace,
                $data['email'],
                (int) $data['organization_role_id'],
                (int) $data['workspace_role_id'],
                $data['message'] ?? null,
                isset($data['expires_at']) ? CarbonImmutable::parse($data['expires_at']) : null,
            );
        } catch (InvitationException $exception) {
            return $this->domainError($exception);
        }

        return $this->issuedResponse($issued, (string) $request->user()->name);
    }

    public function revoke(Request $request, CoreInvitation $invitation): JsonResponse
    {
        try {
            $revoked = $this->invitations->revoke($request->user(), $invitation);
        } catch (InvitationException $exception) {
            return $this->domainError($exception);
        }

        return response()->json(['data' => $this->present($revoked)]);
    }

    /**
     * One-time issuance response: the ONLY HTTP response that ever
     * contains the raw token, returned to the authorized inviter
     * over authenticated transport. Email delivery is attempted
     * exactly once, after the issuance transaction committed; its
     * status is reported explicitly, never implied.
     */
    private function issuedResponse(IssuedInvitation $issued, string $inviterName): JsonResponse
    {
        $deliveryStatus = $this->notifier->notifyIssued($issued, $inviterName);

        return response()->json([
            'data' => [
                'invitation' => $this->present($issued->invitation),
                'invitation_token' => $issued->rawToken,
                'accept_url' => InvitationEmailNotifier::acceptUrl($issued->rawToken),
                'email_delivery_status' => $deliveryStatus,
            ],
        ], 201);
    }

    /**
     * Allowlisted admin presentation: no raw token, no token hash,
     * no private authorization metadata.
     *
     * @return array<string, mixed>
     */
    private function present(CoreInvitation $invitation): array
    {
        return [
            'id' => (int) $invitation->id,
            'type' => $invitation->type,
            'email' => $invitation->email_normalized,
            'organization_id' => $invitation->organization_id !== null ? (int) $invitation->organization_id : null,
            'workspace_id' => $invitation->workspace_id !== null ? (int) $invitation->workspace_id : null,
            'intended_organization_role_id' => $invitation->intended_organization_role_id !== null ? (int) $invitation->intended_organization_role_id : null,
            'intended_workspace_role_id' => $invitation->intended_workspace_role_id !== null ? (int) $invitation->intended_workspace_role_id : null,
            'message' => $invitation->message,
            'status' => $this->invitations->effectiveState($invitation)->value,
            'expires_at' => $invitation->expires_at?->toIso8601String(),
            'accepted_at' => $invitation->accepted_at?->toIso8601String(),
            'revoked_at' => $invitation->revoked_at?->toIso8601String(),
            'created_at' => $invitation->created_at?->toIso8601String(),
        ];
    }

    private function domainError(InvitationException $exception): JsonResponse
    {
        $status = match ($exception->errorCode) {
            'invitation_not_found' => 404,
            'invitation_forbidden', 'invitation_grant_ceiling' => 403,
            'invitation_duplicate_pending', 'invitation_already_accepted',
            'invitation_already_revoked', 'invitation_invalid_state',
            'invitation_organization_unavailable' => 409,
            default => 422,
        };

        return response()->json([
            'message' => $exception->getMessage(),
            'code' => $exception->errorCode,
        ], $status);
    }
}
