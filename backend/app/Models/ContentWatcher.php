<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContentWatcher extends Model
{
    use HasFactory;

    protected $fillable = ['content_id', 'user_id', 'created_by'];

    public function content(): BelongsTo { return $this->belongsTo(Content::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
