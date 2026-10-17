<?php

namespace App\Core\Settings;

use Illuminate\Database\Eloquent\Model;

/**
 * One explicit non-secret setting override (Stage C7-1).
 *
 * The row's existence IS the override; value_json holds the
 * JSON-encoded typed value ('null' = explicitly-null override,
 * distinct from an absent row). owner_id is polymorphic
 * (organization/workspace/user) and intentionally has no database
 * FK — owner validity is enforced by SettingValueStore.
 */
final class CoreSettingValue extends Model
{
    protected $table = 'core_setting_values';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'owner_id' => 'integer',
            'version' => 'integer',
        ];
    }

    public function decodedValue(): mixed
    {
        return json_decode($this->value_json, true);
    }
}
