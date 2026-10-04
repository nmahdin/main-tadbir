<?php

namespace App\Services;

use App\Models\Content;
use App\Models\DamAsset;
use App\Models\DamFolder;
use App\Models\DamRelation;
use App\Models\DamTag;
use App\Models\Project;
use App\Models\SystemSetting;
use App\Models\User;
use App\Support\Dam\DamRelationRole;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/** Central write path for the existing DAM; files are always private assets. */
class DamService
{
    /** Restore is append-only: old versions and files remain intact. */
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
                $locked->files()->where('is_latest', true)->update(['is_latest' => false]);
                $file->update(['is_latest' => true]);
                $locked->versions()->create([
                    'version_number' => $next,
                    'file_id' => $file->id,
                    'created_by' => $actor->id,
                    'change_description' => 'بازیابی نسخه '.$versionNumber,
                ]);
            } else {
                $body = $version->content_snapshot;
                $locked->contentItem()->update(['content_body' => $body, 'content_plain_text' => $body]);
                $locked->versions()->create([
                    'version_number' => $next,
                    'content_snapshot' => $body,
                    'created_by' => $actor->id,
                    'change_description' => 'بازیابی نسخه '.$versionNumber,
                ]);
            }
            $locked->update(['updated_by' => $actor->id]);
            $locked->activities()->create([
                'actor_id' => $actor->id,
                'action' => 'version_restored',
                'metadata' => ['version' => $versionNumber, 'new_version' => $next],
            ]);

            return $locked->load(['latestFile', 'contentItem', 'versions.file', 'versions.creator:id,name']);
        });
    }

    public function revise(DamAsset $asset, User $actor, ?UploadedFile $upload, ?string $body, ?string $note): DamAsset
    {
        $path = null;
        try {
            if ($upload) {
                $directory = app(DamFolderStorage::class)->ensure($asset->folder_id);
                $path = $directory.'/'.Str::uuid().'.'.$upload->extension();
                if (! Storage::disk('local')->putFileAs($directory, $upload, basename($path))) {
                    throw new RuntimeException('ذخیره فایل ناموفق بود.');
                }
            }

            return DB::transaction(function () use ($asset, $actor, $upload, $body, $note, $path) {
                $locked = DamAsset::whereKey($asset->id)->lockForUpdate()->firstOrFail();
                $next = (int) $locked->versions()->max('version_number') + 1;
                if ($locked->type === 'file') {
                    $locked->files()->where('is_latest', true)->update(['is_latest' => false]);
                    $file = $locked->files()->create([
                        'original_filename' => $upload->getClientOriginalName(),
                        'stored_filename' => basename($path),
                        'extension' => $upload->extension(),
                        'mime_type' => $upload->getMimeType() ?: 'application/octet-stream',
                        'file_size' => $upload->getSize(),
                        'checksum' => hash_file('sha256', $upload->getRealPath()),
                        'storage_disk' => 'local',
                        'storage_path' => $path,
                        'is_latest' => true,
                    ]);
                    $attributes = ['file_id' => $file->id];
                } else {
                    $locked->contentItem()->update(['content_body' => $body, 'content_plain_text' => $body]);
                    $attributes = ['content_snapshot' => $body];
                }
                $locked->versions()->create([
                    ...$attributes,
                    'version_number' => $next,
                    'created_by' => $actor->id,
                    'change_description' => $note,
                ]);
                $locked->update(['updated_by' => $actor->id]);
                $locked->activities()->create([
                    'actor_id' => $actor->id,
                    'action' => 'version_created',
                    'metadata' => ['version' => $next],
                ]);

                return $locked->load(['latestFile', 'contentItem', 'versions.file', 'versions.creator:id,name']);
            });
        } catch (\Throwable $e) {
            if ($path) {
                Storage::disk('local')->delete($path);
            }
            throw $e;
        }
    }

    public function create(array $data, User $actor, ?UploadedFile $upload = null): DamAsset
    {
        $data = $this->assignContextFolder($data, $actor);
        $path = null;
        try {
            if ($upload) {
                $directory = app(DamFolderStorage::class)->ensure(isset($data['folder_id']) ? (int) $data['folder_id'] : null);
                $path = $directory.'/'.Str::uuid().'.'.$upload->extension();
                if (! Storage::disk('local')->putFileAs($directory, $upload, basename($path))) {
                    throw new RuntimeException('ذخیره فایل ناموفق بود.');
                }
            }

            return DB::transaction(function () use ($data, $actor, $upload, $path) {
                $asset = DamAsset::create([
                    'type' => $upload ? 'file' : 'content',
                    'title' => $data['title'],
                    'description' => $data['description'] ?? null,
                    'status' => $data['status'] ?? 'draft',
                    'confidentiality' => $data['confidentiality'] ?? 'internal',
                    'access_grants' => $data['access_grants'] ?? null,
                    'owner_id' => $actor->id,
                    'department_id' => $data['department_id'] ?? null,
                    'created_by' => $actor->id,
                    'folder_id' => $data['folder_id'] ?? null,
                    'category_id' => $data['category_id'] ?? null,
                ]);
                if ($upload) {
                    $file = $asset->files()->create([
                        'original_filename' => $upload->getClientOriginalName(),
                        'stored_filename' => basename($path),
                        'extension' => $upload->extension(),
                        'mime_type' => $upload->getMimeType() ?: 'application/octet-stream',
                        'file_size' => $upload->getSize(),
                        'checksum' => hash_file('sha256', $upload->getRealPath()),
                        'storage_disk' => 'local',
                        'storage_path' => $path,
                        'is_latest' => true,
                    ]);
                    $version = $asset->versions()->create([
                        'version_number' => 1,
                        'file_id' => $file->id,
                        'created_by' => $actor->id,
                    ]);
                } else {
                    $body = $data['body'];
                    $asset->contentItem()->create([
                        'content_format' => 'plain',
                        'content_body' => $body,
                        'content_plain_text' => $body,
                    ]);
                    $version = $asset->versions()->create([
                        'version_number' => 1,
                        'content_snapshot' => $body,
                        'created_by' => $actor->id,
                    ]);
                }

                foreach (['project', 'task', 'department', 'content'] as $type) {
                    if (! empty($data[$type.'_id'])) {
                        $this->relate($asset, $type, (int) $data[$type.'_id'], $actor, [
                            'relation_role' => $data['relation_role'] ?? DamRelationRole::ATTACHMENT,
                            'stage_id' => $data['stage_id'] ?? null,
                            'output_id' => $data['output_id'] ?? null,
                            'asset_version_id' => $data['asset_version_id'] ?? $version->id,
                            'metadata' => $data['relation_metadata'] ?? null,
                        ]);
                    }
                }
                foreach ($data['tags'] ?? [] as $tag) {
                    $asset->tags()->syncWithoutDetaching(DamTag::firstOrCreate(['name' => trim($tag)])->id);
                }
                $asset->activities()->create(['actor_id' => $actor->id, 'action' => 'created']);

                return $asset->load(['latestFile', 'contentItem', 'relations', 'versions']);
            });
        } catch (\Throwable $e) {
            if ($path) {
                Storage::disk('local')->delete($path);
            }
            throw $e;
        }
    }

    /** Idempotently connect the one asset to a real domain context. */
    public function relate(DamAsset $asset, string $type, int $id, User $actor, array $context = []): DamRelation
    {
        $role = DamRelationRole::normalize($context['relation_role'] ?? $context['relation_type'] ?? null);
        $stageId = $this->nullableString($context['stage_id'] ?? null);
        $outputId = $this->nullableString($context['output_id'] ?? null);
        $versionId = isset($context['asset_version_id']) ? (int) $context['asset_version_id'] : null;
        // Version is data on the relation, but stage/output define its identity;
        // retrying after a later asset revision must not silently add a duplicate.
        $key = DamRelationRole::contextKey($stageId, $outputId, null);

        return $asset->relations()->firstOrCreate(
            [
                'related_type' => $type,
                'related_id' => $id,
                'relation_type' => $role,
                'context_key' => $key,
            ],
            [
                'stage_id' => $stageId,
                'output_id' => $outputId,
                'asset_version_id' => $versionId,
                'metadata' => $context['metadata'] ?? null,
                'created_by' => $actor->id,
            ],
        );
    }

    /** @param array<string, mixed> $data */
    private function assignContextFolder(array $data, User $actor): array
    {
        if (! empty($data['folder_id'])) {
            return $data;
        }
        if (! empty($data['content_id'])) {
            return $this->assignContentFolder($data, $actor);
        }
        if (! empty($data['project_id'])) {
            $project = Project::query()->find($data['project_id']);
            if ($project) {
                $root = $this->managedFolder('پروژه‌ها', null, 'projects-root', $actor);
                $folder = $this->managedFolder($project->name, $root->id, 'project:'.$project->id, $actor);
                $data['folder_id'] = $folder->id;
            }
        }

        return $data;
    }

    /** @param array<string, mixed> $data */
    private function assignContentFolder(array $data, User $actor): array
    {
        $content = Content::query()->find($data['content_id']);
        if (! $content) {
            return $data;
        }
        $configuredTypes = SystemSetting::query()->where('key', 'content_types')->value('value');
        if (is_string($configuredTypes)) {
            $configuredTypes = json_decode($configuredTypes, true);
        }
        $typeConfig = collect(is_array($configuredTypes) ? $configuredTypes : [])->firstWhere('id', $content->type);
        $typeName = is_array($typeConfig) ? ($typeConfig['name'] ?? $content->type) : $content->type;
        $bucketId = (string) ($data['content_bucket'] ?? 'attachments');
        $bucketName = match ($bucketId) {
            'inputs', 'initial_input' => 'ورودی‌ها',
            'working' => 'فایل‌های کاری',
            'outputs' => 'خروجی‌ها',
            'final', 'publication' => 'نهایی',
            default => 'پیوست‌ها', // exact legacy location remains supported.
        };
        $contentLabel = trim(implode(' - ', array_filter([(string) $content->code, $content->title])));
        $root = $this->managedFolder('محتواها', null, 'contents-root', $actor);
        $type = $this->managedFolder((string) $typeName, $root->id, 'content-type:'.$content->type, $actor);
        $record = $this->managedFolder($contentLabel, $type->id, 'content:'.$content->id, $actor);
        $bucket = $this->managedFolder($bucketName, $record->id, 'content:'.$content->id.':'.$bucketId, $actor);
        $data['folder_id'] = $bucket->id;

        return $data;
    }

    private function managedFolder(string $name, ?int $parentId, string $key, User $actor): DamFolder
    {
        $folder = DamFolder::query()->where('system_key', $key)->first();
        if (! $folder) {
            $folder = DamFolder::query()->whereNull('system_key')->where('name', $name)->where('parent_id', $parentId)->first();
        }
        if (! $folder) {
            $folder = DamFolder::query()->create([
                'name' => $name,
                'parent_id' => $parentId,
                'management_type' => DamFolder::SYSTEM,
                'system_key' => $key,
                'created_by' => $actor->id,
            ]);
        } elseif ($folder->management_type !== DamFolder::SYSTEM || $folder->system_key === null) {
            // Adopt auto-created rows from an older release instead of creating
            // a second visual tree for the same content.
            $folder->update(['management_type' => DamFolder::SYSTEM, 'system_key' => $key]);
        }
        app(DamFolderStorage::class)->ensure($folder);

        return $folder;
    }

    private function nullableString(mixed $value): ?string
    {
        $value = trim((string) ($value ?? ''));

        return $value === '' ? null : $value;
    }
}
