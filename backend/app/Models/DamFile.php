<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class DamFile extends Model {
    protected $fillable = ['original_filename','stored_filename','extension','mime_type','file_size','checksum','storage_disk','storage_path','is_latest'];
    protected $hidden = ['storage_disk', 'storage_path', 'stored_filename', 'checksum'];
    protected $casts = ['is_latest'=>'boolean'];
}
