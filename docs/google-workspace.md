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

## What is actually available in the UI today

The interface is deliberately narrow; nothing below is a placeholder, and nothing
outside this list should be described to users as an active capability.

| Capability | Where | Status |
| --- | --- | --- |
| Connection status per resource | DAM asset/text viewer, DAM data table | Implemented (`GET .../google-workspace`) |
| Send the current native version to Google (Docs/Sheets) | Same panels, «ارسال به Google» | Implemented (`POST .../push`) |
| Pull Google changes back (append-only text version / table snapshot) | Same panels, «دریافت از Google» | Implemented (`POST .../pull`) |
| Remove the link without deleting the Google file | Same panels, «قطع پیوند» | Implemented (`DELETE .../google-workspace`) |
| Conflict detection with explicit force confirmation | Panel dialogs (HTTP 409) | Implemented |
| Create a Meet link for a meeting | Meeting editor, organiser only | Implemented (`POST think-tank-meetings/{meeting}/google-meet`) |
| Automatic/background two-way sync | — | **Not implemented** (manual push/pull only) |
| Drive file browser inside Tadbir | — | **Not implemented** |
| Editing Docs/Sheets inside Tadbir | — | **Not implemented**; the linked file is opened in Google |
| Calendar event management beyond Meet creation | — | **Not implemented** |
| Setting Google credentials from the settings page | — | **Not implemented by design** (server env only) |

## Setup, step by step

1. **Create the Google Cloud project and enable APIs** — Google Drive, Google Docs,
   Google Sheets, Google Calendar. Without the matching API the first push fails
   with a provider error.
2. **Choose an identity** — either a server-managed access token
   (`GOOGLE_WORKSPACE_ACCESS_TOKEN`) for a short-lived integration test, or a
   service account (`GOOGLE_WORKSPACE_CREDENTIALS_PATH` / `..._JSON`) for
   production. Domain-wide delegation is optional; grant only
   `drive.file`, `documents`, `spreadsheets`, `calendar.events`.
3. **Set `GOOGLE_WORKSPACE_DELEGATED_USER`** when the service account must act on
   behalf of a real Workspace user (required for Calendar/Meet events to appear in
   someone's calendar). For Sheets/Docs shared through a folder, the service
   account must be granted access to that folder.
4. **Set `GOOGLE_WORKSPACE_DRIVE_FOLDER_ID`** so new Docs/Sheets land in a
   controlled folder. Leaving it empty places files in the drive root of the
   configured identity.
5. **Verify the deployment**: open a text asset or data table that has native
   content. The panel badge reads «اتصال سرور آماده نیست» until the server reports a
   working connection, then «آماده اتصال» (and «متصل» once a link exists). If it stays unconfigured, the credentials are
   missing or unreadable by the PHP process — check file permissions on the JSON
   key.
6. **First push** creates the Google file and stores both the Drive version and a
   fingerprint of the native record. Later pushes/pulls compare both.
7. **Tune the limits if needed**: `GOOGLE_WORKSPACE_MAX_SHEET_ROWS` (default 5000),
   `..._MAX_SHEET_CELLS` (200000), `..._MAX_SHEET_PAYLOAD_BYTES` (8388608). Larger
   tables must stay native or go through a reporting pipeline.

## Permissions and data flow

- Every endpoint is gated by the same permissions as the native resource:
  `assets.view` / `assets.edit` for DAM assets and tables, `meetings.edit` (and
  organiser ownership) for Meet creation.
- Credentials, private keys and access tokens live only in the server environment.
  They are never written to organisation settings, never returned by the API and
  never stored in browser state; the browser only ever receives a link, a web link
  and a sync status.
- Native DAM content stays authoritative. A Google file is an editing surface:
  pulling a Doc appends a new native text version, pulling a Sheet records a full
  table snapshot.
- Row/column identity for Sheets survives import through a hidden identity column
  and a hidden schema row, so task/content links on rows are preserved.

## Troubleshooting

| Symptom | Cause | Action |
| --- | --- | --- |
| «اتصال سرور آماده نیست» | No usable credential | Set `GOOGLE_WORKSPACE_*` in the server env, restart the PHP process; configuration is cached |
| 403 from Google | API not enabled, wrong scope, or the identity cannot see the file/folder | Enable the API, re-grant scopes, share `GOOGLE_WORKSPACE_DRIVE_FOLDER_ID` with the identity |
| 404 from Google | The linked Google file was deleted or moved out of reach | Disconnect and push again to create a fresh file |
| HTTP 409 on push | The Google file changed after the last sync | Pull first, or confirm the forced push in the dialog (it replaces the Google version) |
| HTTP 409 on pull | The native record changed after the last sync | Push first, or re-confirm the forced pull |
| Meet link fails (502) | Calendar API disabled or delegation missing | Enable Calendar, set `GOOGLE_WORKSPACE_DELEGATED_USER`, retry from the meeting editor |
| Table import rejected | Row/cell/byte limits exceeded | Keep large tables native or raise the limits deliberately |

## Deliberate non-goals

Automatic background synchronisation, a Drive file browser, in-place Google
editors and credential management from the UI are not implemented. They are listed
here so the integration is never described as more capable than it is; adding them
would be a new, reviewed feature rather than a configuration change.
