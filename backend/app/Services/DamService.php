<?php
namespace App\Services;

use App\Models\DamAsset;
use App\Models\DamTag;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/** Central write path; private disk adapter is Laravel Filesystem. */
class DamService
{
    /** Restore is append-only: old versions remain intact. */
    public function restore(DamAsset $asset, int $versionNumber, User $actor): DamAsset
    {
        return DB::transaction(function () use ($asset, $versionNumber, $actor) {
            $locked = DamAsset::whereKey($asset->id)->lockForUpdate()->firstOrFail();
            $version = $locked->versions()->where('version_number', $versionNumber)->firstOrFail();
            $next = (int) $locked->versions()->max('version_number') + 1;
            if ($locked->type === 'file') {
                $file = $locked->files()->findOrFail($version->file_id);
                if (! Storage::disk($file->storage_disk)->exists($file->storage_path)) {
                    throw new RuntimeException('فایل نسخه انتخابی یافت نشد.');
                }
                $locked->files()->where('is_latest', true)->update(['is_latest'=>false]);
                $file->update(['is_latest'=>true]);
                $locked->versions()->create(['version_number'=>$next, 'file_id'=>$file->id, 'created_by'=>$actor->id, 'change_description'=>'بازیابی نسخه '.$versionNumber]);
            } else {
                $body = $version->content_snapshot;
                $locked->contentItem()->update(['content_body'=>$body, 'content_plain_text'=>$body]);
                $locked->versions()->create(['version_number'=>$next, 'content_snapshot'=>$body, 'created_by'=>$actor->id, 'change_description'=>'بازیابی نسخه '.$versionNumber]);
            }
            $locked->update(['updated_by'=>$actor->id]);
            $locked->activities()->create(['actor_id'=>$actor->id,'action'=>'version_restored','metadata'=>['version'=>$versionNumber]]);
            return $locked->load(['latestFile','contentItem','versions']);
        });
    }

    public function revise(DamAsset $asset, User $actor, ?UploadedFile $upload, ?string $body, ?string $note): DamAsset
    {
        $path = null;
        try {
            if ($upload) {
                $path = 'dam/'.Str::uuid().'/'.Str::uuid().'.'.$upload->extension();
                if (! Storage::disk('local')->putFileAs(dirname($path), $upload, basename($path))) {
                    throw new RuntimeException('ذخیره فایل ناموفق بود.');
                }
            }
            return DB::transaction(function () use ($asset, $actor, $upload, $body, $note, $path) {
                $locked = DamAsset::whereKey($asset->id)->lockForUpdate()->firstOrFail();
                $next = (int) $locked->versions()->max('version_number') + 1;
                if ($locked->type === 'file') {
                    $locked->files()->where('is_latest', true)->update(['is_latest'=>false]);
                    $file = $locked->files()->create([
                        'original_filename'=>$upload->getClientOriginalName(), 'stored_filename'=>basename($path),
                        'extension'=>$upload->extension(), 'mime_type'=>$upload->getMimeType() ?: 'application/octet-stream',
                        'file_size'=>$upload->getSize(), 'checksum'=>hash_file('sha256', $upload->getRealPath()),
                        'storage_disk'=>'local', 'storage_path'=>$path, 'is_latest'=>true,
                    ]);
                    $attributes = ['file_id'=>$file->id];
                } else {
                    $locked->contentItem()->update(['content_body'=>$body, 'content_plain_text'=>$body]);
                    $attributes = ['content_snapshot'=>$body];
                }
                $locked->versions()->create([...$attributes, 'version_number'=>$next, 'created_by'=>$actor->id, 'change_description'=>$note]);
                $locked->update(['updated_by'=>$actor->id]);
                $locked->activities()->create(['actor_id'=>$actor->id,'action'=>'version_created','metadata'=>['version'=>$next]]);
                return $locked->load(['latestFile','contentItem','versions']);
            });
        } catch (\Throwable $e) {
            if ($path) Storage::disk('local')->delete($path);
            throw $e;
        }
    }

    public function create(array $data, User $actor, ?UploadedFile $upload = null): DamAsset
    {
        $path = null;
        try {
            if ($upload) {
                $path = 'dam/'.Str::uuid().'/'.Str::uuid().'.'.$upload->extension();
                if (! Storage::disk('local')->putFileAs(dirname($path), $upload, basename($path))) {
                    throw new RuntimeException('ذخیره فایل ناموفق بود.');
                }
            }
            return DB::transaction(function () use ($data, $actor, $upload, $path) {
                $asset = DamAsset::create([
                    'type' => $upload ? 'file' : 'content', 'title' => $data['title'],
                    'description' => $data['description'] ?? null, 'status' => 'draft',
                    'confidentiality' => $data['confidentiality'] ?? 'internal',
                    'owner_id' => $actor->id, 'department_id' => $data['department_id'] ?? null,
                    'created_by' => $actor->id, 'folder_id' => $data['folder_id'] ?? null,
                    'category_id' => $data['category_id'] ?? null,
                ]);
                if ($upload) {
                    $file = $asset->files()->create([
                        'original_filename' => $upload->getClientOriginalName(),
                        'stored_filename' => basename($path), 'extension' => $upload->extension(),
                        'mime_type' => $upload->getMimeType() ?: 'application/octet-stream',
                        'file_size' => $upload->getSize(), 'checksum' => hash_file('sha256', $upload->getRealPath()),
                        'storage_disk' => 'local', 'storage_path' => $path, 'is_latest' => true,
                    ]);
                    $asset->versions()->create(['version_number'=>1, 'file_id'=>$file->id, 'created_by'=>$actor->id]);
                } else {
                    $body = $data['body'];
                    $asset->contentItem()->create(['content_format'=>'plain', 'content_body'=>$body, 'content_plain_text'=>$body]);
                    $asset->versions()->create(['version_number'=>1, 'content_snapshot'=>$body, 'created_by'=>$actor->id]);
                }
                foreach (['project', 'task', 'department'] as $type) {
                    if (! empty($data[$type.'_id'])) {
                        $asset->relations()->create(['related_type'=>$type, 'related_id'=>$data[$type.'_id'], 'created_by'=>$actor->id]);
                    }
                }
                foreach ($data['tags'] ?? [] as $tag) {
                    $asset->tags()->syncWithoutDetaching(DamTag::firstOrCreate(['name'=>$tag])->id);
                }
                $asset->activities()->create(['actor_id'=>$actor->id, 'action'=>'created']);
                return $asset->load(['latestFile','contentItem','relations']);
            });
        } catch (\Throwable $e) {
            if ($path) Storage::disk('local')->delete($path);
            throw $e;
        }
    }
}
