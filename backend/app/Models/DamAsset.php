<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class DamAsset extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'type', 'title', 'description', 'status', 'confidentiality', 'access_grants', 'owner_id',
        'department_id', 'created_by', 'updated_by', 'folder_id', 'category_id',
    ];

    protected function casts(): array
    {
        return ['access_grants' => 'array'];
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(DamTag::class, 'dam_asset_tag', 'asset_id', 'tag_id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(DamFile::class, 'asset_id');
    }

    public function latestFile(): HasOne
    {
        return $this->hasOne(DamFile::class, 'asset_id')->where('is_latest', true);
    }

    public function contentItem(): HasOne
    {
        return $this->hasOne(DamContentItem::class, 'asset_id');
    }

    public function versions(): HasMany
    {
        return $this->hasMany(DamVersion::class, 'asset_id');
    }

    public function latestVersion(): HasOne
    {
        return $this->hasOne(DamVersion::class, 'asset_id')->ofMany('version_number', 'max');
    }

    public function relations(): HasMany
    {
        return $this->hasMany(DamRelation::class, 'asset_id');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(DamActivity::class, 'asset_id');
    }

    public function googleWorkspaceLink(): HasOne
    {
        return $this->hasOne(GoogleWorkspaceLink::class, 'dam_asset_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(DamCategory::class, 'category_id');
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(DamFolder::class, 'folder_id');
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
