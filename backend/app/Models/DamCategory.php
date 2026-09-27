<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class DamCategory extends Model {
    protected $fillable = ['name','description','parent_id'];
}
