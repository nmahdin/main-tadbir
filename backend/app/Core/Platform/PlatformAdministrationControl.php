<?php

namespace App\Core\Platform;

use Illuminate\Database\Eloquent\Model;

/**
 * Singleton platform-administration control row (id = 1, Stage
 * C2-1). Serializes platform administration transactions and holds
 * bootstrap state.
 *
 * No public, legacy, or normal administration API may modify this
 * table. The future bootstrap service may consider bootstrap open
 * only when `bootstrap_completed_at` is NULL AND no assignment to
 * `primary_administrator` has ever existed — both evaluated under a
 * row lock on this record (implemented in the bootstrap stage, not
 * here).
 */
class PlatformAdministrationControl extends Model
{
    protected $table = 'platform_administration_control';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'bootstrap_completed_at' => 'datetime',
        ];
    }

    public static function singleton(): self
    {
        return static::query()->findOrFail(1);
    }
}
