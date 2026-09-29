<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BaleConversation extends Model
{
    protected $table = 'bale_conversations';

    protected $fillable = ['link_id', 'step', 'nonce', 'data', 'expires_at'];

    protected $hidden = ['data', 'nonce'];

    protected $casts = ['data' => 'encrypted:array', 'expires_at' => 'datetime'];
}
