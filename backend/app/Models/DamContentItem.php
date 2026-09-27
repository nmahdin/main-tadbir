<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class DamContentItem extends Model {
    protected $fillable = ['content_format','content_body','content_plain_text'];
}
