<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BaleOutbox extends Model
{
    protected $table = 'bale_outbox';

    protected $fillable = ['deduplication_key', 'bot_id', 'link_id', 'requires_link', 'chat_id', 'payload', 'subject_type', 'subject_id', 'status', 'attempts', 'available_at', 'error_code', 'remote_message_id'];

    protected $hidden = ['payload', 'chat_id'];

    protected $casts = ['payload' => 'encrypted:array', 'requires_link' => 'boolean', 'available_at' => 'datetime'];
}
