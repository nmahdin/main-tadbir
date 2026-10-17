<?php

namespace App\Core\Settings;

use Illuminate\Database\Eloquent\Model;

/**
 * Organization-level per-key permission for Workspace overrides
 * (Stage C7-1). A missing row means "use the definition's
 * declared default" (default false = deny) — never an accidental
 * broad grant.
 */
final class CoreSettingOverridePolicy extends Model
{
    protected $table = 'core_setting_override_policies';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'organization_id' => 'integer',
            'allow_workspace_override' => 'boolean',
        ];
    }
}
