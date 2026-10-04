<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class DamRelation extends Model {
    public $timestamps = false;
    protected $fillable = ['asset_id','related_type','related_id','relation_type','created_by'];
}
