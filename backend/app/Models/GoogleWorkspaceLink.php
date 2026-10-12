<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GoogleWorkspaceLink extends Model
{
    public const DOCUMENT = 'document';

    public const SPREADSHEET = 'spreadsheet';

    protected $fillable = [
        'dam_asset_id', 'dam_data_table_id', 'resource_type', 'google_file_id',
        'google_file_name', 'google_mime_type', 'web_url', 'remote_version',
        'remote_modified_at', 'local_fingerprint', 'metadata', 'last_pushed_at',
        'last_pulled_at', 'last_synced_at', 'created_by', 'updated_by',
    ];

    protected $hidden = [
        'dam_asset_id', 'dam_data_table_id', 'google_file_id', 'remote_version',
        'local_fingerprint', 'metadata', 'created_by', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'remote_modified_at' => 'datetime',
            'last_pushed_at' => 'datetime',
            'last_pulled_at' => 'datetime',
            'last_synced_at' => 'datetime',
        ];
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(DamAsset::class, 'dam_asset_id');
    }

    public function dataTable(): BelongsTo
    {
        return $this->belongsTo(DamDataTable::class, 'dam_data_table_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Only non-secret provider metadata may leave the server. */
    public function safePayload(): array
    {
        $webUrl = $this->resource_type === self::DOCUMENT
            ? 'https://docs.google.com/document/d/'.rawurlencode($this->google_file_id).'/edit'
            : 'https://docs.google.com/spreadsheets/d/'.rawurlencode($this->google_file_id).'/edit';

        return [
            'id' => $this->id,
            'resource_type' => $this->resource_type,
            'name' => $this->google_file_name,
            'mime_type' => $this->google_mime_type,
            'web_url' => $webUrl,
            'remote_modified_at' => $this->remote_modified_at?->toIso8601String(),
            'last_pushed_at' => $this->last_pushed_at?->toIso8601String(),
            'last_pulled_at' => $this->last_pulled_at?->toIso8601String(),
            'last_synced_at' => $this->last_synced_at?->toIso8601String(),
        ];
    }
}
