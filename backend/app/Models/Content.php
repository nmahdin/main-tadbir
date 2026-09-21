<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Content extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'type',
        'status',
        'deadline',
        'owner_id',
        'project_id',
        'payload',
    ];

    protected $casts = [
        'deadline' => 'date',
        'payload' => 'array',
    ];
}
