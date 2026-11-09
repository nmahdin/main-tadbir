<?php

namespace App\Core\Settings;

use Illuminate\Database\Eloquent\Model;

/**
 * One immutable, append-only revision of a NON-SECRET setting
 * mutation (Stage C7-3). Rows are never updated or deleted by
 * application code; restore creates a NEW revision instead.
 *
 * State encoding: `*_present` distinguishes "no explicit value"
 * (absent) from "explicitly null" (present with null JSON).
 *
 * @property int $id
 * @property string $setting_key
 * @property string $owner_type
 * @property int $owner_id
 * @property string $operation
 * @property int $version
 * @property bool $previous_present
 * @property bool $new_present
 */
final class CoreSettingRevision extends Model
{
    public const OPERATION_CREATE = 'create';

    public const OPERATION_UPDATE = 'update';

    public const OPERATION_REMOVE = 'remove';

    public const OPERATION_RESTORE = 'restore';

    public const OPERATION_POLICY = 'policy';

    protected $table = 'core_setting_revisions';

    public $timestamps = false;

    protected $guarded = [];

    protected $hidden = [];

    protected function casts(): array
    {
        return [
            'owner_id' => 'integer',
            'version' => 'integer',
            'previous_present' => 'boolean',
            'new_present' => 'boolean',
            'created_at' => 'datetime',
        ];
    }

    public function previousValue(): mixed
    {
        return $this->previous_present ? json_decode((string) $this->previous_value_json, true) : null;
    }

    public function newValue(): mixed
    {
        return $this->new_present ? json_decode((string) $this->new_value_json, true) : null;
    }
}
