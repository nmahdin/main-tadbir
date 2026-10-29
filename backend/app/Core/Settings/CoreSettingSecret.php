<?php

namespace App\Core\Settings;

use Illuminate\Database\Eloquent\Model;

/**
 * One stored secret payload (Stage C7-3).
 *
 * The ciphertext is hidden from every serialization path; the
 * only sanctioned decryption route is the internal consumption
 * contract on ScopedSecretService. Revisions, audits and DTOs
 * must never carry this attribute.
 *
 * @property int $id
 * @property string $setting_key
 * @property string $owner_type
 * @property int $owner_id
 * @property string $key_version
 * @property int $version
 */
final class CoreSettingSecret extends Model
{
    protected $table = 'core_setting_secrets';

    protected $guarded = [];

    protected $hidden = ['ciphertext'];

    protected function casts(): array
    {
        return [
            'owner_id' => 'integer',
            'version' => 'integer',
        ];
    }
}
