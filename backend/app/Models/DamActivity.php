<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class DamActivity extends Model {
    public $timestamps = false;
    protected $fillable = ['actor_id','action','metadata'];
    protected $casts = ['metadata'=>'array'];
}
