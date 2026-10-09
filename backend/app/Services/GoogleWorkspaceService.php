<?php

namespace App\Services;

use App\Models\DamAsset;
use App\Models\DamDataRow;
use App\Models\DamDataRowActivity;
use App\Models\DamDataTable;
use App\Models\GoogleWorkspaceLink;
use App\Models\SystemSetting;
use App\Models\User;
use App\Support\Dam\DamRichText;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Manual, conflict-aware synchronization. Native DAM records remain canonical;
 * Google files are linked editors and never become a parallel asset registry.
 */
final class GoogleWorkspaceService
{
    private const DOCUMENT_MIME = 'application/vnd.google-apps.document';

    private const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

    private const SHEET_TITLE = 'داده‌ها';

    public function __construct(
        private readonly GoogleWorkspaceClient $google,
        private readonly GoogleDocsCodec $docsCodec,
        private readonly DamService $dam,
        private readonly DamTableRows $tableRows,
    ) {}

    /** @return array<string, mixed> */
    public function settingsStatus(): array
    {
        $settings = $this->settings();

        return [
            ...$this->google->connectionStatus(),
            'driveEnabled' => (bool) ($settings['driveEnabled'] ?? true),
            'docsEnabled' => (bool) ($settings['docsEnabled'] ?? true),
            'sheetsEnabled' => (bool) ($settings['sheetsEnabled'] ?? true),
        ];
    }

    public function assetLink(DamAsset $asset): ?array
    {
        return $asset->googleWorkspaceLink?->safePayload();
    }

    public function tableLink(DamDataTable $table): ?array
    {
        return $table->googleWorkspaceLink?->safePayload();
    }

    /** Create the Google Doc on first push, otherwise update the existing link. */
    public function pushAsset(DamAsset $asset, User $actor, bool $force = false): array
    {
        $this->assertEnabled('docsEnabled', 'Google Docs');
        abort_unless($asset->type === 'content' && $asset->contentItem, 422, 'فقط دارایی متنی را می‌توان به Google Docs ارسال کرد.');
        $body = (string) $asset->contentItem->content_body;
        if (DamRichText::plainText($body) === '') {
            throw ValidationException::withMessages(['googleWorkspace' => 'متن خالی را نمی‌توان به Google Docs ارسال کرد.']);
        }
        $localFingerprint = hash('sha256', DamRichText::sanitize($body));

        $settings = $this->settings();
        $client = $this->workspaceClient([
            GoogleWorkspaceClient::DRIVE_FILE_SCOPE,
            GoogleWorkspaceClient::DOCUMENTS_SCOPE,
        ], $settings);
        $link = $asset->googleWorkspaceLink;
        if ($link) {
            $remote = $this->remoteMetadata($client, $link->google_file_id);
            $this->assertRemoteType($remote, self::DOCUMENT_MIME);
            if (! $force && $this->remoteChanged($link, $remote)) {
                abort(409, 'نسخه Google Docs پس از آخرین همگام‌سازی تغییر کرده است. ابتدا آخرین تغییرات را دریافت کنید یا ارسال اجباری را تأیید کنید.');
            }
            $documentId = $link->google_file_id;
        } else {
            $created = $client->post('https://docs.googleapis.com/v1/documents', [
                'title' => $asset->title,
            ])->throw()->json();
            $documentId = trim((string) ($created['documentId'] ?? ''));
            if ($documentId === '') {
                throw ValidationException::withMessages(['googleWorkspace' => 'Google Docs شناسه سند جدید را برنگرداند.']);
            }
            $this->moveToConfiguredFolder($client, $documentId, $settings);
        }

        $this->replaceGoogleDocument($client, $documentId, $body);
        $remote = $this->remoteMetadata($client, $documentId);
        $link = DB::transaction(function () use ($asset, $actor, $link, $documentId, $remote, $localFingerprint): GoogleWorkspaceLink {
            $lockedAsset = DamAsset::query()->whereKey($asset->id)->lockForUpdate()->firstOrFail();
            $payload = $this->linkAttributes(
                GoogleWorkspaceLink::DOCUMENT,
                $documentId,
                $remote,
                $localFingerprint,
                $actor,
            );
            $payload['last_pushed_at'] = now();
            $payload['last_synced_at'] = now();
            if ($link) {
                $record = GoogleWorkspaceLink::query()
                    ->whereKey($link->id)
                    ->where('dam_asset_id', $lockedAsset->id)
                    ->lockForUpdate()
                    ->firstOrFail();
                $record->update($payload);
            } else {
                $record = $lockedAsset->googleWorkspaceLink()->create([...$payload, 'created_by' => $actor->id]);
            }
            $lockedAsset->activities()->create([
                'actor_id' => $actor->id,
                'action' => 'google_docs_pushed',
                'metadata' => ['provider' => 'google_workspace', 'resource' => 'document'],
            ]);

            return $record->refresh();
        });

        return $link->safePayload();
    }

    /** Pulling creates a normal append-only DAM version through the existing service. */
    public function pullAsset(DamAsset $asset, User $actor, bool $force = false): array
    {
        $this->assertEnabled('docsEnabled', 'Google Docs');
        abort_unless($asset->type === 'content' && $asset->contentItem, 422, 'فقط دارایی متنی را می‌توان از Google Docs دریافت کرد.');
        $link = $asset->googleWorkspaceLink;
        abort_unless($link && $link->resource_type === GoogleWorkspaceLink::DOCUMENT, 422, 'این دارایی به Google Docs متصل نیست.');
        if (! $force && $link->local_fingerprint && ! hash_equals($link->local_fingerprint, $this->assetFingerprint($asset))) {
            abort(409, 'نسخه بومی تدبیر پس از آخرین همگام‌سازی تغییر کرده است. دریافت اجباری، آن را به‌عنوان یک نسخه جدید جایگزین می‌کند.');
        }

        $settings = $this->settings();
        $client = $this->workspaceClient([
            GoogleWorkspaceClient::DRIVE_FILE_SCOPE,
            GoogleWorkspaceClient::DOCUMENTS_SCOPE,
        ], $settings);
        $remote = $this->remoteMetadata($client, $link->google_file_id);
        $this->assertRemoteType($remote, self::DOCUMENT_MIME);
        $document = $client->get('https://docs.googleapis.com/v1/documents/'.rawurlencode($link->google_file_id))->throw()->json();
        $html = $this->docsCodec->decode(is_array($document) ? $document : []);
        if (DamRichText::plainText($html) === '') {
            throw ValidationException::withMessages(['googleWorkspace' => 'سند Google Docs خالی است و نمی‌تواند جایگزین متن تدبیر شود.']);
        }

        $confirmedRemote = $this->remoteMetadata($client, $link->google_file_id);
        $this->assertRemoteType($confirmedRemote, self::DOCUMENT_MIME);
        if ($this->metadataChanged($remote, $confirmedRemote)) {
            abort(409, 'سند Google Docs هنگام دریافت تغییر کرد؛ لطفاً دوباره تلاش کنید.');
        }

        $expectedFingerprint = $link->local_fingerprint;
        $asset = DB::transaction(function () use ($asset, $actor, $link, $html, $force, $expectedFingerprint, $confirmedRemote): DamAsset {
            $revised = $this->dam->revise(
                $asset,
                $actor,
                null,
                $html,
                'دریافت تغییرات از Google Docs',
                function (DamAsset $locked) use ($force, $expectedFingerprint): void {
                    if (! $force && $expectedFingerprint && ! hash_equals($expectedFingerprint, $this->assetFingerprint($locked))) {
                        abort(409, 'نسخه بومی تدبیر هنگام دریافت تغییر کرد. دوباره تلاش کنید یا دریافت اجباری را تأیید کنید.');
                    }
                },
            );
            $lockedLink = GoogleWorkspaceLink::query()
                ->whereKey($link->id)
                ->where('dam_asset_id', $revised->id)
                ->lockForUpdate()
                ->firstOrFail();
            $lockedLink->update([
                ...$this->linkAttributes(
                    GoogleWorkspaceLink::DOCUMENT,
                    $lockedLink->google_file_id,
                    $confirmedRemote,
                    $this->assetFingerprint($revised),
                    $actor,
                ),
                'last_pulled_at' => now(),
                'last_synced_at' => now(),
            ]);
            $revised->activities()->create([
                'actor_id' => $actor->id,
                'action' => 'google_docs_pulled',
                'metadata' => ['provider' => 'google_workspace', 'resource' => 'document'],
            ]);

            return $revised;
        });

        return [
            'link' => $link->refresh()->safePayload(),
            'asset' => $asset->fresh()->load(['contentItem', 'versions.file', 'versions.creator:id,name']),
        ];
    }

    public function disconnectAsset(DamAsset $asset, User $actor): void
    {
        $link = $asset->googleWorkspaceLink;
        abort_unless($link, 404);
        DB::transaction(function () use ($asset, $actor, $link): void {
            $lockedAsset = DamAsset::query()->whereKey($asset->id)->lockForUpdate()->firstOrFail();
            $lockedLink = GoogleWorkspaceLink::query()
                ->whereKey($link->id)
                ->where('dam_asset_id', $lockedAsset->id)
                ->lockForUpdate()
                ->firstOrFail();
            $lockedLink->delete();
            $lockedAsset->activities()->create([
                'actor_id' => $actor->id,
                'action' => 'google_workspace_disconnected',
                'metadata' => ['provider' => 'google_workspace', 'resource' => 'document', 'remote_file_preserved' => true],
            ]);
        });
    }

    /** Create the Google Sheet on first push, otherwise replace its data range. */
    public function pushTable(DamDataTable $table, User $actor, bool $force = false): array
    {
        $this->assertEnabled('sheetsEnabled', 'Google Sheets');
        $settings = $this->settings();
        $client = $this->workspaceClient([
            GoogleWorkspaceClient::DRIVE_FILE_SCOPE,
            GoogleWorkspaceClient::SPREADSHEETS_SCOPE,
        ], $settings);
        $link = $table->googleWorkspaceLink;
        [$values, $columnIds, $sheetId, $localFingerprint, $snapshot] = $this->tableValues($table, $link);
        if ($link) {
            $remote = $this->remoteMetadata($client, $link->google_file_id);
            $this->assertRemoteType($remote, self::SPREADSHEET_MIME);
            if (! $force && $this->remoteChanged($link, $remote)) {
                abort(409, 'نسخه Google Sheets پس از آخرین همگام‌سازی تغییر کرده است. ابتدا آخرین تغییرات را دریافت کنید یا ارسال اجباری را تأیید کنید.');
            }
            $spreadsheetId = $link->google_file_id;
            $sheetTitle = $this->linkedSheetTitle($client, $spreadsheetId, $link);
        } else {
            $created = $client->post('https://sheets.googleapis.com/v4/spreadsheets', [
                'properties' => ['title' => $table->name],
                'sheets' => [['properties' => ['title' => self::SHEET_TITLE, 'gridProperties' => ['frozenRowCount' => 1]]]],
            ])->throw()->json();
            $spreadsheetId = trim((string) ($created['spreadsheetId'] ?? ''));
            $sheetTitle = trim((string) ($created['sheets'][0]['properties']['title'] ?? self::SHEET_TITLE)) ?: self::SHEET_TITLE;
            $sheetId = (int) ($created['sheets'][0]['properties']['sheetId'] ?? 0);
            if ($spreadsheetId === '') {
                throw ValidationException::withMessages(['googleWorkspace' => 'Google Sheets شناسه شیت جدید را برنگرداند.']);
            }
            $this->moveToConfiguredFolder($client, $spreadsheetId, $settings);
        }

        $this->replaceSheetValues($client, $spreadsheetId, $sheetTitle, $values);
        $this->prepareSheetLayout($client, $spreadsheetId, $sheetId);
        $remote = $this->remoteMetadata($client, $spreadsheetId);
        $link = DB::transaction(function () use ($table, $actor, $link, $spreadsheetId, $sheetTitle, $sheetId, $columnIds, $remote, $localFingerprint, $snapshot): GoogleWorkspaceLink {
            $lockedTable = DamDataTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail();
            $payload = $this->linkAttributes(
                GoogleWorkspaceLink::SPREADSHEET,
                $spreadsheetId,
                $remote,
                $localFingerprint,
                $actor,
                ['sheet_title' => $sheetTitle, 'sheet_id' => $sheetId, 'column_ids' => $columnIds],
            );
            $payload['last_pushed_at'] = now();
            $payload['last_synced_at'] = now();
            if ($link) {
                $record = GoogleWorkspaceLink::query()
                    ->whereKey($link->id)
                    ->where('dam_data_table_id', $lockedTable->id)
                    ->lockForUpdate()
                    ->firstOrFail();
                $record->update($payload);
            } else {
                $record = $lockedTable->googleWorkspaceLink()->create([...$payload, 'created_by' => $actor->id]);
            }
            $this->createTableVersion($lockedTable, $actor, 'google_sheets_push', 'ارسال نسخه به Google Sheets', $snapshot);
            $this->logTableActivity($lockedTable, $actor, 'google_sheets_pushed', [
                'provider' => 'google_workspace',
                'rows' => count($snapshot['rows'] ?? []),
                'columns' => count($snapshot['columns'] ?? []),
            ]);

            return $record->refresh();
        });

        return $link->safePayload();
    }

    /** Import the linked sheet, preserving task/content links for stable row IDs. */
    public function pullTable(DamDataTable $table, User $actor, bool $force = false): array
    {
        $this->assertEnabled('sheetsEnabled', 'Google Sheets');
        $link = $table->googleWorkspaceLink;
        abort_unless($link && $link->resource_type === GoogleWorkspaceLink::SPREADSHEET, 422, 'این جدول به Google Sheets متصل نیست.');
        if (! $force && $link->local_fingerprint && ! hash_equals($link->local_fingerprint, $this->tableFingerprint($table))) {
            abort(409, 'جدول بومی تدبیر پس از آخرین همگام‌سازی تغییر کرده است. دریافت اجباری، نسخه Google Sheets را وارد می‌کند.');
        }

        $settings = $this->settings();
        $client = $this->workspaceClient([
            GoogleWorkspaceClient::DRIVE_FILE_SCOPE,
            GoogleWorkspaceClient::SPREADSHEETS_SCOPE,
        ], $settings);
        $remote = $this->remoteMetadata($client, $link->google_file_id);
        $this->assertRemoteType($remote, self::SPREADSHEET_MIME);
        $sheetTitle = $this->linkedSheetTitle($client, $link->google_file_id, $link);
        $values = $this->readSheetValues($client, $link->google_file_id, $sheetTitle);
        $confirmedRemote = $this->remoteMetadata($client, $link->google_file_id);
        $this->assertRemoteType($confirmedRemote, self::SPREADSHEET_MIME);
        if ($this->metadataChanged($remote, $confirmedRemote)) {
            abort(409, 'جدول Google Sheets هنگام دریافت تغییر کرد؛ لطفاً دوباره تلاش کنید.');
        }
        $remote = $confirmedRemote;
        [$columns, $rows, $columnIds] = $this->parseSheetValues($table, $link, $values, $actor);

        $expectedFingerprint = $link->local_fingerprint;
        $summary = DB::transaction(function () use ($table, $actor, $columns, $rows, $force, $expectedFingerprint, $link, $remote, $sheetTitle, $columnIds): array {
            $locked = DamDataTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail();
            if (! $force && $expectedFingerprint && ! hash_equals($expectedFingerprint, $this->tableFingerprint($locked))) {
                abort(409, 'جدول بومی تدبیر هنگام دریافت تغییر کرد. دوباره تلاش کنید یا دریافت اجباری را تأیید کنید.');
            }
            $existing = $locked->rows()->get()->keyBy('id');
            $seen = [];
            $created = 0;
            $updated = 0;
            foreach ($rows as $position => $incoming) {
                $rowId = $incoming['row_id'];
                $attributes = [
                    'cells' => $incoming['cells'],
                    'position' => $position + 1,
                    'updated_by' => $actor->id,
                ];
                $row = $rowId !== null ? $existing->get($rowId) : null;
                if ($row) {
                    $seen[] = $row->id;
                    $oldCells = $row->cells ?? [];
                    $changedColumns = array_values(array_filter(
                        array_unique([...array_keys($oldCells), ...array_keys($incoming['cells'])]),
                        fn (string $columnId) => ($oldCells[$columnId] ?? null) !== ($incoming['cells'][$columnId] ?? null),
                    ));
                    if ($changedColumns !== [] || (int) $row->position !== $position + 1) {
                        $row->update($attributes);
                        $updated++;
                        $this->logTableActivity($locked, $actor, 'google_sheets_row_updated', ['columns' => $changedColumns], $row);
                    }
                } else {
                    $row = $locked->rows()->create([
                        ...$attributes,
                        'created_by' => $actor->id,
                    ]);
                    $seen[] = $row->id;
                    $created++;
                    $this->logTableActivity($locked, $actor, 'google_sheets_row_created', ['columns' => array_keys($incoming['cells'])], $row);
                }
            }
            $removed = $locked->rows()->whereNotIn('id', $seen ?: [0])->get();
            foreach ($removed as $row) {
                $this->logTableActivity($locked, $actor, 'google_sheets_row_deleted', ['columns' => array_keys($row->cells ?? [])], $row);
                $row->delete();
            }
            $locked->update(['columns' => $columns]);
            $this->createTableVersion($locked, $actor, 'google_sheets_pull', 'دریافت تغییرات از Google Sheets');
            $this->logTableActivity($locked, $actor, 'google_sheets_pulled', [
                'provider' => 'google_workspace',
                'created' => $created,
                'updated' => $updated,
                'deleted' => $removed->count(),
            ]);
            $lockedLink = GoogleWorkspaceLink::query()
                ->whereKey($link->id)
                ->where('dam_data_table_id', $locked->id)
                ->lockForUpdate()
                ->firstOrFail();
            $lockedLink->update([
                ...$this->linkAttributes(
                    GoogleWorkspaceLink::SPREADSHEET,
                    $lockedLink->google_file_id,
                    $remote,
                    $this->tableFingerprint($locked),
                    $actor,
                    [
                        'sheet_title' => $sheetTitle,
                        'sheet_id' => (int) (($lockedLink->metadata ?? [])['sheet_id'] ?? 0),
                        'column_ids' => $columnIds,
                    ],
                ),
                'last_pulled_at' => now(),
                'last_synced_at' => now(),
            ]);

            return ['created' => $created, 'updated' => $updated, 'deleted' => $removed->count()];
        });

        return ['link' => $link->refresh()->safePayload(), 'summary' => $summary];
    }

    public function disconnectTable(DamDataTable $table, User $actor): void
    {
        $link = $table->googleWorkspaceLink;
        abort_unless($link, 404);
        DB::transaction(function () use ($table, $actor, $link): void {
            $lockedTable = DamDataTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail();
            $lockedLink = GoogleWorkspaceLink::query()
                ->whereKey($link->id)
                ->where('dam_data_table_id', $lockedTable->id)
                ->lockForUpdate()
                ->firstOrFail();
            $lockedLink->delete();
            $this->logTableActivity($lockedTable, $actor, 'google_workspace_disconnected', [
                'provider' => 'google_workspace',
                'resource' => 'spreadsheet',
                'remote_file_preserved' => true,
            ]);
        });
    }

    /** @param list<string> $scopes @param array<string, mixed> $settings */
    private function workspaceClient(array $scopes, array $settings): PendingRequest
    {
        return $this->google->authorized($scopes, (string) ($settings['delegatedUser'] ?? ''));
    }

    private function replaceGoogleDocument(PendingRequest $client, string $documentId, string $html): void
    {
        $document = $client->get('https://docs.googleapis.com/v1/documents/'.rawurlencode($documentId))->throw()->json();
        $content = is_array($document['body']['content'] ?? null) ? $document['body']['content'] : [];
        $endIndex = (int) collect($content)->max('endIndex');
        $encoded = $this->docsCodec->encode($html);
        if (trim($encoded['text']) === '') {
            throw ValidationException::withMessages(['googleWorkspace' => 'متن خالی را نمی‌توان به Google Docs ارسال کرد.']);
        }
        $requests = [];
        if ($endIndex > 2) {
            $requests[] = ['deleteContentRange' => ['range' => ['startIndex' => 1, 'endIndex' => $endIndex - 1]]];
        }
        $requests[] = ['insertText' => ['location' => ['index' => 1], 'text' => $encoded['text']]];
        $requests = [...$requests, ...$encoded['formatRequests']];
        $client->post(
            'https://docs.googleapis.com/v1/documents/'.rawurlencode($documentId).':batchUpdate',
            ['requests' => $requests],
        )->throw();
    }

    /** @return array<string, mixed> */
    private function remoteMetadata(PendingRequest $client, string $fileId): array
    {
        $response = $client->get(
            'https://www.googleapis.com/drive/v3/files/'.rawurlencode($fileId),
            ['fields' => 'id,name,mimeType,modifiedTime,version,trashed'],
        )->throw()->json();

        return is_array($response) ? $response : [];
    }

    /** @param array<string, mixed> $remote */
    private function assertRemoteType(array $remote, string $mime): void
    {
        abort_if(($remote['trashed'] ?? false) === true, 422, 'فایل متصل‌شده در سطل زباله Google Drive قرار دارد.');
        abort_unless((string) ($remote['mimeType'] ?? '') === $mime, 422, 'نوع فایل Google Workspace با رکورد تدبیر سازگار نیست.');
    }

    /** @param array<string, mixed> $settings */
    private function moveToConfiguredFolder(PendingRequest $client, string $fileId, array $settings): void
    {
        $folder = trim((string) ($settings['driveFolderId'] ?? config('google_workspace.drive_folder_id')));
        if ($folder === '') {
            return;
        }
        $query = http_build_query(['addParents' => $folder, 'fields' => 'id,parents'], '', '&', PHP_QUERY_RFC3986);
        $client->patch('https://www.googleapis.com/drive/v3/files/'.rawurlencode($fileId).'?'.$query, [])->throw();
    }

    /** @param list<list<mixed>> $values */
    private function replaceSheetValues(PendingRequest $client, string $spreadsheetId, string $sheetTitle, array $values): void
    {
        $range = $this->sheetRange($sheetTitle);
        $base = 'https://sheets.googleapis.com/v4/spreadsheets/'.rawurlencode($spreadsheetId).'/values/'.rawurlencode($range);
        $client->post($base.':clear')->throw();
        $client->put($base.'?valueInputOption=RAW', [
            'range' => $range,
            'majorDimension' => 'ROWS',
            'values' => $values,
        ])->throw();
    }

    private function linkedSheetTitle(PendingRequest $client, string $spreadsheetId, GoogleWorkspaceLink $link): string
    {
        $sheetId = (int) (($link->metadata ?? [])['sheet_id'] ?? 0);
        $response = $client->get(
            'https://sheets.googleapis.com/v4/spreadsheets/'.rawurlencode($spreadsheetId),
            ['fields' => 'sheets.properties(sheetId,title)'],
        )->throw()->json();
        foreach ($response['sheets'] ?? [] as $sheet) {
            $properties = is_array($sheet['properties'] ?? null) ? $sheet['properties'] : [];
            if ((int) ($properties['sheetId'] ?? -1) === $sheetId) {
                $title = trim((string) ($properties['title'] ?? ''));
                if ($title !== '') {
                    return $title;
                }
            }
        }

        throw ValidationException::withMessages([
            'googleWorkspace' => 'برگه متصل‌شده در Google Sheets یافت نشد یا دیگر در دسترس نیست.',
        ]);
    }

    /** @return list<list<mixed>> */
    private function readSheetValues(PendingRequest $client, string $spreadsheetId, string $sheetTitle): array
    {
        $base = 'https://sheets.googleapis.com/v4/spreadsheets/'.rawurlencode($spreadsheetId).'/values/';
        $headerRange = "'".str_replace("'", "''", $sheetTitle)."'!A1:CX2";
        $headerResponse = $client->get($base.rawurlencode($headerRange), ['majorDimension' => 'ROWS'])->throw()->json();
        $headerValues = is_array($headerResponse['values'] ?? null) ? $headerResponse['values'] : [];
        $this->assertSheetPayload($headerValues);
        $header = is_array($headerValues[0] ?? null) ? array_values($headerValues[0]) : [];
        $totalColumns = max(1, count($header));
        $maxRows = max(1, (int) config('google_workspace.max_sheet_rows', 5000));
        $maxCells = max(1, (int) config('google_workspace.max_sheet_cells', 200000));
        $allowedRows = max(0, min($maxRows, intdiv($maxCells, $totalColumns) - 2));
        $lastRow = 2 + $allowedRows + 1; // one overflow row makes an oversized sheet fail closed
        $lastColumn = $this->sheetColumnName(min($totalColumns, 102));
        $range = "'".str_replace("'", "''", $sheetTitle)."'!A1:{$lastColumn}{$lastRow}";
        $response = $client->get($base.rawurlencode($range), ['majorDimension' => 'ROWS'])->throw()->json();
        $values = is_array($response['values'] ?? null) ? $response['values'] : [];
        $this->assertSheetPayload($values);

        return $values;
    }

    private function sheetColumnName(int $number): string
    {
        $name = '';
        for ($number = max(1, $number); $number > 0; $number = intdiv($number - 1, 26)) {
            $name = chr(65 + (($number - 1) % 26)).$name;
        }

        return $name;
    }

    private function prepareSheetLayout(PendingRequest $client, string $spreadsheetId, int $sheetId): void
    {
        $client->post('https://sheets.googleapis.com/v4/spreadsheets/'.rawurlencode($spreadsheetId).':batchUpdate', [
            'requests' => [
                ['updateDimensionProperties' => [
                    'range' => ['sheetId' => $sheetId, 'dimension' => 'COLUMNS', 'startIndex' => 0, 'endIndex' => 1],
                    'properties' => ['hiddenByUser' => true],
                    'fields' => 'hiddenByUser',
                ]],
                ['updateDimensionProperties' => [
                    'range' => ['sheetId' => $sheetId, 'dimension' => 'ROWS', 'startIndex' => 1, 'endIndex' => 2],
                    'properties' => ['hiddenByUser' => true],
                    'fields' => 'hiddenByUser',
                ]],
                ['updateSheetProperties' => [
                    'properties' => ['sheetId' => $sheetId, 'gridProperties' => ['frozenRowCount' => 1]],
                    'fields' => 'gridProperties.frozenRowCount',
                ]],
            ],
        ])->throw();
    }

    /**
     * Capture one consistent native snapshot before any provider request. If a
     * user edits the table while Google is being updated, the stored fingerprint
     * still describes exactly what was sent and the next pull detects the edit.
     *
     * @return array{0:list<list<mixed>>,1:list<string>,2:int,3:string,4:array<string, mixed>}
     */
    private function tableValues(DamDataTable $table, ?GoogleWorkspaceLink $link): array
    {
        return DB::transaction(function () use ($table, $link): array {
            $locked = DamDataTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail();
            $columns = $this->tableRows->schema($locked);
            $rows = $locked->rows()->orderBy('position')->orderBy('id')->get();
            $this->assertSheetSize($rows->count(), count($columns));
            $columnIds = array_values(array_column($columns, 'id'));
            $values = [
                ['شناسه تدبیر', ...array_map(fn (array $column) => (string) $column['name'], $columns)],
                ['tadbir:columns', ...array_map(fn (string $id) => 'tadbir-column:'.$id, $columnIds)],
            ];
            foreach ($rows as $row) {
                $values[] = [
                    'tadbir:'.$row->id,
                    ...array_map(fn (array $column) => $row->cells[$column['id']] ?? '', $columns),
                ];
            }
            $this->assertSheetPayload($values);
            $snapshot = [
                'columns' => $locked->columns ?? [],
                'rows' => $rows->map(fn (DamDataRow $row) => [
                    'id' => $row->id,
                    'cells' => $row->cells ?? [],
                    'position' => $row->position,
                    'task_id' => $row->task_id,
                    'content_id' => $row->content_id,
                ])->all(),
            ];
            $fingerprint = $this->snapshotFingerprint($snapshot);
            $metadata = $link?->metadata ?? [];

            return [$values, $columnIds, (int) ($metadata['sheet_id'] ?? 0), $fingerprint, $snapshot];
        });
    }

    /**
     * @param list<list<mixed>> $values
     * @return array{0:list<array<string, mixed>>,1:list<array{row_id:?int,cells:array<string,mixed>}>,2:list<string>}
     */
    private function parseSheetValues(DamDataTable $table, GoogleWorkspaceLink $link, array $values, User $actor): array
    {
        if ($values === [] || ! is_array($values[0] ?? null)) {
            throw ValidationException::withMessages(['googleWorkspace' => 'Google Sheets فاقد سطر عنوان ستون‌ها است.']);
        }
        $headers = array_values($values[0]);
        array_shift($headers);
        if ($headers === [] || count($headers) > 100) {
            throw ValidationException::withMessages(['googleWorkspace' => 'تعداد ستون‌های Google Sheets باید بین ۱ تا ۱۰۰ باشد.']);
        }
        $hasIdentityRow = ($values[1][0] ?? null) === 'tadbir:columns';
        $this->assertSheetSize(max(0, count($values) - ($hasIdentityRow ? 2 : 1)), count($headers));
        $existingColumns = collect($table->columns ?? [])->keyBy('id');
        $storedIds = $hasIdentityRow
            ? array_map(
                fn ($value) => preg_match('/^tadbir-column:([A-Za-z0-9_-]{1,60})$/', (string) $value, $matches) === 1 ? $matches[1] : null,
                array_slice(array_values($values[1]), 1),
            )
            : array_values((array) (($link->metadata ?? [])['column_ids'] ?? []));
        $columnIds = [];
        $columns = [];
        foreach ($headers as $index => $header) {
            $name = trim((string) $header);
            if ($name === '') {
                $name = 'ستون '.($index + 1);
            }
            $id = isset($storedIds[$index]) && preg_match('/^[A-Za-z0-9_-]{1,60}$/', (string) $storedIds[$index])
                ? (string) $storedIds[$index]
                : 'gcol_'.substr(hash('sha256', $index.'|'.$name), 0, 16);
            while (in_array($id, $columnIds, true)) {
                $id = substr($id, 0, 52).'_'.substr(Str::random(6), 0, 6);
            }
            $columnIds[] = $id;
            $old = $existingColumns->get($id);
            $columns[] = is_array($old)
                ? [...$old, 'id' => $id, 'name' => mb_substr($name, 0, 120)]
                : ['id' => $id, 'name' => mb_substr($name, 0, 120), 'type' => 'text', 'required' => false, 'max_length' => 3000];
        }

        $validationTable = clone $table;
        $validationTable->setAttribute('columns', $columns);
        $validExistingIds = $table->rows()->pluck('id')->map(fn ($id) => (int) $id)->all();
        $usedIds = [];
        $parsed = [];
        foreach (array_slice($values, $hasIdentityRow ? 2 : 1) as $rowValues) {
            if (! is_array($rowValues)) {
                continue;
            }
            $identifier = trim((string) ($rowValues[0] ?? ''));
            $rowId = preg_match('/^tadbir:(\d+)$/', $identifier, $matches) === 1 ? (int) $matches[1] : null;
            if ($rowId !== null && (! in_array($rowId, $validExistingIds, true) || in_array($rowId, $usedIds, true))) {
                throw ValidationException::withMessages(['googleWorkspace' => 'شناسه ردیف در Google Sheets نامعتبر یا تکراری است.']);
            }
            if ($rowId !== null) {
                $usedIds[] = $rowId;
            }
            $cells = [];
            foreach ($columns as $index => $column) {
                $value = $rowValues[$index + 1] ?? '';
                if ($value !== '' && $value !== null) {
                    $cells[$column['id']] = $this->normalizeSheetCell($value, $column);
                }
            }
            if ($rowId === null && $cells === []) {
                continue;
            }
            $parsed[] = [
                'row_id' => $rowId,
                'cells' => $this->tableRows->validateCells($validationTable, $cells, $actor),
            ];
        }

        return [$columns, $parsed, $columnIds];
    }

    /** @param array<string, mixed> $column */
    private function normalizeSheetCell(mixed $value, array $column): mixed
    {
        $type = (string) ($column['type'] ?? 'text');
        if ($type === 'boolean') {
            if (is_bool($value)) {
                return $value;
            }
            $normalized = strtolower(trim((string) $value));

            return match ($normalized) {
                'true', '1', 'yes', 'بله' => true,
                'false', '0', 'no', 'خیر' => false,
                default => $value,
            };
        }
        if (in_array($type, ['number', 'user', 'asset'], true) && is_numeric($value)) {
            return $type === 'number' ? $value + 0 : (int) $value;
        }

        return trim((string) $value);
    }

    /** @param array<string, mixed> $remote @param array<string, mixed> $extraMetadata */
    private function linkAttributes(string $type, string $fileId, array $remote, string $fingerprint, User $actor, array $extraMetadata = []): array
    {
        $modified = isset($remote['modifiedTime']) ? CarbonImmutable::parse((string) $remote['modifiedTime']) : null;
        $fallbackUrl = $type === GoogleWorkspaceLink::DOCUMENT
            ? 'https://docs.google.com/document/d/'.rawurlencode($fileId).'/edit'
            : 'https://docs.google.com/spreadsheets/d/'.rawurlencode($fileId).'/edit';

        return [
            'resource_type' => $type,
            'google_file_id' => $fileId,
            'google_file_name' => mb_substr((string) ($remote['name'] ?? 'Google Workspace'), 0, 255),
            'google_mime_type' => (string) ($remote['mimeType'] ?? ($type === GoogleWorkspaceLink::DOCUMENT ? self::DOCUMENT_MIME : self::SPREADSHEET_MIME)),
            // Never persist an arbitrary provider URL into a browser-facing link.
            'web_url' => $fallbackUrl,
            'remote_version' => isset($remote['version']) ? (string) $remote['version'] : null,
            'remote_modified_at' => $modified,
            'local_fingerprint' => $fingerprint,
            'metadata' => $extraMetadata,
            'updated_by' => $actor->id,
        ];
    }

    /** @param array<string, mixed> $remote */
    private function remoteChanged(GoogleWorkspaceLink $link, array $remote): bool
    {
        $version = isset($remote['version']) ? (string) $remote['version'] : null;
        if ($link->remote_version !== null && $version !== null) {
            return ! hash_equals((string) $link->remote_version, $version);
        }
        $modified = isset($remote['modifiedTime']) ? CarbonImmutable::parse((string) $remote['modifiedTime']) : null;

        return $link->remote_modified_at && $modified && ! $link->remote_modified_at->equalTo($modified);
    }

    /** @param array<string, mixed> $before @param array<string, mixed> $after */
    private function metadataChanged(array $before, array $after): bool
    {
        $beforeVersion = isset($before['version']) ? (string) $before['version'] : null;
        $afterVersion = isset($after['version']) ? (string) $after['version'] : null;
        if ($beforeVersion !== null && $afterVersion !== null) {
            return ! hash_equals($beforeVersion, $afterVersion);
        }
        $beforeModified = isset($before['modifiedTime']) ? CarbonImmutable::parse((string) $before['modifiedTime']) : null;
        $afterModified = isset($after['modifiedTime']) ? CarbonImmutable::parse((string) $after['modifiedTime']) : null;

        return $beforeModified && $afterModified && ! $beforeModified->equalTo($afterModified);
    }

    private function assetFingerprint(DamAsset $asset): string
    {
        $asset->loadMissing('contentItem');

        return hash('sha256', DamRichText::sanitize((string) $asset->contentItem?->content_body));
    }

    private function tableFingerprint(DamDataTable $table): string
    {
        $rows = $table->rows()->orderBy('position')->orderBy('id')->get(['id', 'position', 'cells']);

        return $this->snapshotFingerprint([
            'columns' => $table->columns ?? [],
            'rows' => $rows->map(fn (DamDataRow $row) => [
                'id' => $row->id,
                'position' => $row->position,
                'cells' => $row->cells ?? [],
            ])->all(),
        ]);
    }

    /** @param array<string, mixed> $snapshot */
    private function snapshotFingerprint(array $snapshot): string
    {
        $rows = array_map(fn (array $row) => [
            'id' => $row['id'] ?? null,
            'position' => $row['position'] ?? null,
            'cells' => $row['cells'] ?? [],
        ], is_array($snapshot['rows'] ?? null) ? $snapshot['rows'] : []);

        return hash('sha256', json_encode([
            'columns' => is_array($snapshot['columns'] ?? null) ? $snapshot['columns'] : [],
            'rows' => $rows,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    }

    /** @param array<string, mixed>|null $snapshot */
    private function createTableVersion(DamDataTable $table, User $actor, string $source, string $description, ?array $snapshot = null): void
    {
        $table = DamDataTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail();
        $next = (int) $table->versions()->max('version_number') + 1;
        $snapshot ??= [
            'columns' => $table->columns ?? [],
            'rows' => $table->rows()->orderBy('position')->orderBy('id')->get()->map(fn (DamDataRow $row) => [
                'id' => $row->id,
                'cells' => $row->cells ?? [],
                'position' => $row->position,
                'task_id' => $row->task_id,
                'content_id' => $row->content_id,
            ])->all(),
        ];
        $table->versions()->create([
            'version_number' => $next,
            'source' => $source,
            'snapshot' => $snapshot,
            'change_description' => $description,
            'created_by' => $actor->id,
        ]);
    }

    /** @param array<string, mixed> $metadata */
    private function logTableActivity(DamDataTable $table, User $actor, string $action, array $metadata, ?DamDataRow $row = null): void
    {
        DamDataRowActivity::create([
            'table_id' => $table->id,
            'row_id' => $row?->id,
            'actor_id' => $actor->id,
            'action' => $action,
            'metadata' => $metadata,
        ]);
    }

    private function assertSheetSize(int $rows, int $columns): void
    {
        $maxRows = max(1, (int) config('google_workspace.max_sheet_rows', 5000));
        $maxCells = max(1, (int) config('google_workspace.max_sheet_cells', 200000));
        if ($rows > $maxRows || ($rows + 2) * ($columns + 1) > $maxCells) {
            throw ValidationException::withMessages([
                'googleWorkspace' => 'اندازه جدول از سقف امن همگام‌سازی Google Sheets بیشتر است.',
            ]);
        }
    }

    /** @param array<mixed> $values */
    private function assertSheetPayload(array $values): void
    {
        $encoded = json_encode($values, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $maxBytes = max(1024, (int) config('google_workspace.max_sheet_payload_bytes', 8388608));
        if (strlen($encoded) > $maxBytes) {
            throw ValidationException::withMessages([
                'googleWorkspace' => 'حجم داده جدول از سقف امن همگام‌سازی Google Sheets بیشتر است.',
            ]);
        }
    }

    private function sheetRange(string $sheetTitle): string
    {
        // One identity column plus the 100 native data columns allowed by DAM.
        return "'".str_replace("'", "''", $sheetTitle)."'!A:CW";
    }

    private function assertEnabled(string $key, string $label): void
    {
        $settings = $this->settings();
        if (! ($settings['driveEnabled'] ?? true) || ! ($settings[$key] ?? true)) {
            throw ValidationException::withMessages(['googleWorkspace' => "اتصال {$label} در تنظیمات سامانه غیرفعال است."]);
        }
        if (! $this->google->configured()) {
            throw ValidationException::withMessages(['googleWorkspace' => 'اتصال امن Google Workspace هنوز روی سرور آماده نشده است.']);
        }
    }

    /** @return array<string, mixed> */
    private function settings(): array
    {
        $defaults = [
            'driveEnabled' => true,
            'docsEnabled' => true,
            'sheetsEnabled' => true,
            'driveFolderId' => (string) config('google_workspace.drive_folder_id', ''),
            'delegatedUser' => (string) config('google_workspace.delegated_user', ''),
        ];
        $stored = SystemSetting::query()->where('key', 'google_meet')->value('value');
        if (is_string($stored)) {
            $stored = json_decode($stored, true);
        }

        return is_array($stored) ? [...$defaults, ...$stored] : $defaults;
    }
}
