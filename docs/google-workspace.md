# Google Workspace integration

Tadbir uses one server-side Google Workspace provider for Drive, Docs, Sheets, Calendar, and Meet. Native DAM text assets and data tables remain authoritative. A Google file is an optional linked editor, not a second asset registry.

## Supported flow

- A user with native edit access explicitly sends the current version to Google.
- The returned Google file is linked to the existing DAM asset or data table.
- Users may open the linked file in Google, push a newer native version, or pull the latest Google changes.
- Pulling a Doc creates an append-only DAM text version.
- Pushing or pulling a Sheet records a complete table snapshot in the table version history.
- Disconnecting removes only the Tadbir link; the Google file is preserved.
- Automatic two-way synchronization and background workers are intentionally not required.

## Conflict protection

Every successful operation records both the remote Drive version and a fingerprint of the native record.

- A push is rejected with HTTP 409 when the remote file changed since the last synchronization.
- A pull is rejected with HTTP 409 when the native record changed since the last synchronization.
- Pulls verify provider metadata before and after reading, and recheck the native fingerprint under a database lock before writing.
- The UI explains the conflict and requires explicit confirmation before a forced operation.

For Sheets, Tadbir writes a hidden identity column and hidden schema row. These identifiers preserve stable native row and column IDs when edits are imported. Task and Content links on rows are retained for rows whose stable IDs remain present.

## Google Cloud preparation

The deployment administrator must enable the Google Drive, Google Docs, Google Sheets, and Google Calendar APIs. The server connection can use either a server-managed access token or a service account. Google Workspace domain-wide delegation is optional and should be limited to the required scopes:

- `drive.file`
- `documents`
- `spreadsheets`
- `calendar.events`

Credentials, private keys, and tokens are server-owned operational configuration. They must never be entered into organization settings, returned by the API, or stored in browser state.

The optional Drive folder identifier controls where newly-created Docs and Sheets are placed. The service account or delegated user must have access to that folder.

## Limits

Manual Sheet synchronization is bounded by configurable row, cell, and serialized-payload limits. The defaults are 5,000 rows, 200,000 cells, and 8 MiB per linked table. Sheet reads are range-bounded and include one overflow row so oversized imports fail closed instead of being silently truncated. Larger datasets should remain in Tadbir or be integrated through a dedicated reporting pipeline rather than bypassing these safeguards.
