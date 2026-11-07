<?php

namespace App\Core\Modules;

use App\Core\Organizations\Organization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Organization-level module policy (Stage C4-1 schema; C4-2
 * defines the management workflow). Absence of a row means no
 * organization restriction has been recorded for that module.
 */
class OrganizationModulePolicy extends Model
{
    public const POLICY_ALLOWED = 'allowed';

    public const POLICY_DENIED = 'denied';

    protected $fillable = ['organization_id', 'module_id', 'policy'];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function module(): BelongsTo
    {
        return $this->belongsTo(CoreModule::class, 'module_id');
    }

    public function denies(): bool
    {
        return $this->policy === self::POLICY_DENIED;
    }
}
