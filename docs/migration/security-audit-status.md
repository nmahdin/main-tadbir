# Security Audit Status Matrix — A01–A16 at the Stage 00 Audited Commit

- **Baseline:** `main` @ `b30bfefdeb4550fa971e76006c42af143c19e745` (same commit as Stage 00).
- **Sources:** original audit `docs/security/access-control-review.md` (2026-09-28; 16 probes, 14 failing pre-fix), phase-1 report `docs/security/access-control-phase1.md` (9 of 14 fixed; A04, A05, A06, A12, A13 left open), current code/tests at the baseline.
- **Method (read-only):** each ID was classified by (a) existence of a named regression test in `backend/tests/Feature/AccessControlHardeningTest.php` (41 tests) or a later suite, and (b) direct inspection of the implementing code at baseline. Backend PHPUnit was NOT executed in the Stage 00/01 sandboxes (no PHP binary); "VERIFIED FIXED" therefore means *a regression test targeting this exact behavior exists in the suite that CI ran green for this commit* (CI run 38242087918, Stage 00 §8) — not a fresh local execution. Where behavior plausibly changed but no targeted test exists, the status is NOT YET VERIFIED, never "fixed".
- **Caveat:** the original external audit suite (`backend/audits/AccessControlAuditTest.php`) no longer exists in the tree; the 16-probe matrix is maintained through the hardening suite. Re-running the original probes verbatim is impossible without recreating them — a Stage 04 (authorization) task.

| ID | Finding (short) | Status at `b30bfef` | Evidence / note |
|---|---|---|---|
| A01 | Blocked/inactive account with existing session reads tasks | **VERIFIED FIXED** | `test_a01_blocked_existing_session_cannot_read_tasks`; `EnsureActiveAccount` re-reads persisted status per request (logout exempted) |
| A02 | Inactive role still grants permissions | **VERIFIED FIXED** | `test_a02_disabled_role_does_not_grant_task_access`; `User::permissionKeys()` requires active user + active role |
| A03 | `tasks.status`-only user changes title via generic PUT | **VERIFIED FIXED** | `test_a03…` + field-level grant tests in `TaskOperations::updateFields` |
| A04 | `content.view`-only user reads unrelated content (no record scope) | **STILL OPEN** (policy-level) | `ContentAccess::visibleTo` still returns *all* content to `content.view` holders; department/participant scoping helps only non-holders. Under the target model this resolves as "content.view **within a workspace**" — ratified direction (ADR-0008) but not implemented; until Stage 05 Content slice, treat as open |
| A05 | Department member without `content.edit` cannot edit own department's content | **VERIFIED FIXED** | Implemented post-phase-1: `ContentAccess::canEdit/guardEdit`; `CompletionCommandsTest::test_department_members_can_edit_only_their_content_without_role_edit_and_revocation_is_live` (covers revocation + cross-department denial). Note: this legacy department-grant behavior is *not* carried into workspace RBAC (ADR-0006) |
| A06 | `content.edit` alone can force `published` via generic update | **VERIFIED FIXED** | `ContentPublication::guardGenericWrite` in `ContentController::update`; `ContentPublicationTasksTest::test_generic_content_write_cannot_forge_publication_or_receipt`, `test_only_active_content_publish_and_view_holders_can_publish` |
| A07 | Chat non-member reads others' messages | **VERIFIED FIXED** | `test_a07…`; `ChatAccess` membership enforced on list/show |
| A08 | Chat non-member edits another's message | **VERIFIED FIXED** | `test_a08…` + `test_chat_members_can_read_but_not_edit_another_authors_message` |
| A09 | Bulk delete bypasses single-delete policy | **VERIFIED FIXED** | `test_a09…` + `test_chat_batch_delete_is_all_or_nothing` |
| A10 | `users.edit` promotes another account to admin | **VERIFIED FIXED** | `test_a10…` + delegation-ceiling tests (`test_role_assignment_requires_consistent_identity_and_delegation_ceiling`, password-reset protection) |
| A11 | `users.status`-only operator cannot change status (over-restriction) | **VERIFIED FIXED** | `test_a11…` + `test_status_only_update_works_but_mixed_update_is_atomic` |
| A12 | Activity feed exposes other users' activity | **STILL OPEN** | `ActivityLogController` still gates only on `reports.view` and masks task/project *links* by permission; no per-record membership/workspace scoping, no targeted test. Target resolution: ADR-0008 scoped projections (Stage 05 Reporting) |
| A13 | `thinktank.vote` can replace the whole votes array, deleting others' votes | **STILL OPEN** | `WorkspaceRecordController::ideaActionPermissions` still treats a `votes`-only payload replace as a vote action; no per-user vote command/test. Target resolution: personal vote command in Operational Records slice (Stage 05) |
| A14 | Pending account can log in | **VERIFIED FIXED** | `test_a14_pending_user_cannot_login`; `AuthController::blockedMessage` rejects pending/unknown statuses |
| A15 | Positive control: single message delete denied to non-member | **VERIFIED FIXED** (control holds) | `test_a15_positive_control_single_message_delete_is_denied` |
| A16 | Positive control: profile editor cannot change own role | **VERIFIED FIXED** (control holds) | `test_a16…` + `test_a_member_cannot_promote_themselves…` (chat analogue) |

## Summary
- **VERIFIED FIXED: 13 / 16** (A01, A02, A03, A05, A06, A07, A08, A09, A10, A11, A14, A15, A16)
- **STILL OPEN: 3 / 16** (A04 policy-level, A12, A13) — each is absorbed into a named Stage 05 slice (Content, Reporting, Operational Records) under ADR-0008, not into Stage 02/03.
- **NOT YET VERIFIED: 0** as a category — every ID has either a targeted test or inspectable still-open code. However, all VERIFIED FIXED labels rest on CI evidence for this commit plus code inspection; a fresh local PHPUnit execution remains outstanding wherever PHP is available (Stage 02 should record it).
- New workspace-era adversarial tests (cross-workspace IDOR etc.) do not exist yet and are Stage 04 acceptance criteria — they are not represented in this legacy matrix.
