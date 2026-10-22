<?php

namespace App\Core\Modules;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Persisted mirror of one canonical ModuleDefinition
 * (Stage C4-1). Written only by ModuleRegistrySynchronizer;
 * code remains the source of truth.
 */
class CoreModule extends Model
{
    protected $table = 'core_modules';

    protected $fillable = ['key', 'name', 'availability'];

    protected function casts(): array
    {
        return ['availability' => ModuleAvailability::class];
    }

    public function isAvailable(): bool
    {
        return $this->availability->isAvailable();
    }

    /** Direct prerequisites of this module. */
    public function dependencies(): BelongsToMany
    {
        return $this->belongsToMany(
            self::class,
            'core_module_dependencies',
            'module_id',
            'required_module_id',
        );
    }

    /** Modules that directly require this module. */
    public function dependents(): BelongsToMany
    {
        return $this->belongsToMany(
            self::class,
            'core_module_dependencies',
            'required_module_id',
            'module_id',
        );
    }

    public function workspaceActivations(): HasMany
    {
        return $this->hasMany(WorkspaceModule::class, 'module_id');
    }
}
