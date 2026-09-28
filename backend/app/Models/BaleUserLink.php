<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BaleUserLink extends Model
{
    protected $table = 'bale_user_links';

    protected $fillable = ['user_id', 'bale_user_id', 'chat_id', 'notifications_enabled'];

    protected $casts = ['notifications_enabled' => 'boolean'];
}
