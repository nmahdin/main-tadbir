<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class DamVersion extends Model {
    public $timestamps = false;
    protected $fillable = ['version_number','file_id','content_snapshot','change_description','created_by'];
}
