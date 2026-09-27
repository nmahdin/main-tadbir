<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class DamFolder extends Model {
    protected $fillable = ['name','parent_id','department_id','created_by'];
}
