<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DamVersion extends Model
{
    public $timestamps = false;

    protected $fillable = ['version_number', 'file_id', 'content_snapshot', 'change_description', 'created_by'];

    public function file(): BelongsTo
    {
        return $this->belongsTo(DamFile::class, 'file_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
