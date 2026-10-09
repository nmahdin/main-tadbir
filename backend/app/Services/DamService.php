<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Content;
use App\Models\DamAsset;
use App\Models\DamCategory;
use App\Models\DamFolder;
use App\Models\DamRelation;
use App\Models\DamTag;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Support\Dam\DamRelationRole;
use App\Support\Dam\DamRichText;
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
                $body = DamRichText::sanitize($version->content_snapshot);
                $locked->contentItem()->update([
                    'content_format' => 'html',
                    'content_body' => $body,
                    'content_plain_text' => DamRichText::plainText($body),
                ]);
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

    public function revise(
        DamAsset $asset,
        User $actor,
        ?UploadedFile $upload,
        ?string $body,
        ?string $note,
        ?callable $beforeWrite = null,
    ): DamAsset
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

            return DB::transaction(function () use ($asset, $actor, $upload, $body, $note, $path, $beforeWrite) {
                $locked = DamAsset::whereKey($asset->id)->lockForUpdate()->firstOrFail();
                if ($beforeWrite !== null) {
                    $beforeWrite($locked);
                }
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
                    $body = DamRichText::sanitize($body);
                    $locked->contentItem()->update([
                        'content_format' => 'html',
                        'content_body' => $body,
                        'content_plain_text' => DamRichText::plainText($body),
                    ]);
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
        if (empty($data['category_id'])) {
            $categoryName = ! empty($data['task_id']) ? 'وظایف'
                : (! empty($data['idea_id']) || ! empty($data['idea_key']) ? 'ایده‌ها'
                    : (! empty($data['content_id']) && (! empty($data['output_id']) || in_array(($data['relation_role'] ?? null), [DamRelationRole::STAGE_OUTPUT, DamRelationRole::FINAL_OUTPUT], true) || in_array(($data['content_bucket'] ?? null), ['outputs', 'final', 'publication'], true))
                        ? 'خروجی محتوا' : (! empty($data['content_id']) ? 'محتوا' : null)));
            if ($categoryName) {
                $data['category_id'] = DamCategory::firstOrCreate(['name' => $categoryName])->id;
            }
        }
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
                    'status' => $data['status'] ?? 'approved',
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
                    $body = DamRichText::sanitize($data['body']);
                    $asset->contentItem()->create([
                        'content_format' => 'html',
                        'content_body' => $body,
                        'content_plain_text' => DamRichText::plainText($body),
                    ]);
                    $version = $asset->versions()->create([
                        'version_number' => 1,
                        'content_snapshot' => $body,
                        'created_by' => $actor->id,
                    ]);
                }

                foreach (['project', 'task', 'department', 'content', 'idea', 'meeting'] as $type) {
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

        $relation = $asset->relations()->firstOrCreate(
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
        if ($type === 'idea') {
            $this->movePrecreatedIdeaAsset($asset, $id, $actor);
        }
        if ($relation->wasRecentlyCreated && $type === 'project') {
            ActivityLog::create([
                'user_id' => $actor->id,
                'project_id' => $id,
                'type' => 'project_asset_added',
                'action' => 'افزودن دارایی به پروژه',
                'details' => 'asset:'.$asset->id,
                'metadata' => ['asset_id' => $asset->id, 'relation_role' => $role],
            ]);
        }

        return $relation;
    }

    public function syncProjectFolderName(Project $project): void
    {
        DamFolder::query()->where('system_key', 'project:'.$project->id)->update(['name' => $project->name]);
    }

    public function syncWorkspaceFolderName(WorkspaceRecord $record): void
    {
        $prefix = match ($record->kind) {
            WorkspaceRecord::KIND_IDEA => 'idea:'.($record->client_request_id ?: $record->id),
            WorkspaceRecord::KIND_MEETING => 'meeting:'.$record->id,
            default => null,
        };
        if ($prefix !== null) {
            DamFolder::query()->where('system_key', $prefix)->update(['name' => $record->title]);
        }
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
        if (! empty($data['idea_id']) || (! empty($data['idea_key']) && ! empty($data['idea_title']))) {
            return $this->assignIdeaFolder($data, $actor);
        }
        if (! empty($data['meeting_id'])) {
            return $this->assignWorkspaceFolder($data, $actor, WorkspaceRecord::KIND_MEETING, 'جلسات', 'meetings-root', 'meeting');
        }
        // A task attachment belongs in the stable task tree even when the task is
        // also linked to a project. An explicit folder_id above remains the only
        // opt-in override, so users can choose another location without changing
        // the task/project relations.
        if (! empty($data['task_id']) && Task::query()->whereKey($data['task_id'])->exists()) {
            $root = $this->managedFolder('وظایف', null, 'tasks-root', $actor);
            $taskId = (int) $data['task_id'];
            $record = $this->managedFolder((string) $taskId, $root->id, 'task:'.$taskId, $actor);
            $data['folder_id'] = $record->id;

            return $data;
        }
        if (! empty($data['project_id'])) {
            $project = Project::query()->find($data['project_id']);
            if ($project) {
                $root = $this->managedFolder('پروژه‌ها', null, 'projects-root', $actor);
                $recordKey = 'project:'.$project->id;
                $record = $this->managedFolder($project->name, $root->id, $recordKey, $actor);
                if ($record->name !== $project->name) {
                    $record->update(['name' => $project->name]);
                }
                $files = $this->managedFolder('فایل', $record->id, $recordKey.':files', $actor);
                $data['folder_id'] = $files->id;
            }
        }

        return $data;
    }

    /** @param array<string, mixed> $data */
    private function assignWorkspaceFolder(array $data, User $actor, string $kind, string $rootName, string $rootKey, string $recordPrefix): array
    {
        $id = $data[$recordPrefix.'_id'] ?? null;
        $workspace = $id ? WorkspaceRecord::query()->where('kind', $kind)->find($id) : null;
        if (! $workspace) {
            return $data;
        }
        $root = $this->managedFolder($rootName, null, $rootKey, $actor);
        $recordKey = $recordPrefix.':'.$workspace->id;
        $record = $this->managedFolder($workspace->title, $root->id, $recordKey, $actor);
        if ($record->name !== $workspace->title) {
            $record->update(['name' => $workspace->title]);
        }
        $files = $this->managedFolder('فایل', $record->id, $recordKey.':files', $actor);
        $data['folder_id'] = $files->id;

        return $data;
    }

    /** @param array<string, mixed> $data */
    private function assignIdeaFolder(array $data, User $actor): array
    {
        $idea = ! empty($data['idea_id'])
            ? WorkspaceRecord::query()->where('kind', WorkspaceRecord::KIND_IDEA)->find($data['idea_id'])
            : null;
        $title = trim((string) ($idea ? $idea->id : ($data['idea_title'] ?? '')));
        $contextKey = trim((string) ($idea?->id ?? ($data['idea_key'] ?? '')));
        if ($title === '' || $contextKey === '') {
            return $data;
        }

        $root = $this->managedFolder('ایده‌ها', null, 'ideas-root', $actor);
        $recordKey = 'idea:'.$contextKey;
        $record = $this->managedFolder($title, $root->id, $recordKey, $actor);
        if ($record->name !== $title) {
            $record->update(['name' => $title]);
        }
        $files = $this->managedFolder('فایل', $record->id, $recordKey.':files', $actor);
        $data['folder_id'] = $files->id;

        return $data;
    }

    /** Move a pre-create upload from its temporary idea-key folder to the stable idea-ID path. */
    private function movePrecreatedIdeaAsset(DamAsset $asset, int $ideaId, User $actor): void
    {
        $idea = WorkspaceRecord::query()->where('kind', WorkspaceRecord::KIND_IDEA)->find($ideaId);
        if (! $idea) {
            return;
        }
        $temporaryKey = trim((string) $idea->client_request_id);
        $currentFolder = $asset->folder()->first();
        if (
            $temporaryKey === ''
            || ! $currentFolder
            || $currentFolder->system_key !== 'idea:'.$temporaryKey.':files'
        ) {
            // Existing library assets can have many simultaneous relations; only an
            // upload in this idea's own pre-create folder may be relocated.
            return;
        }
        $target = $this->assignIdeaFolder(['idea_id' => $ideaId], $actor)['folder_id'] ?? null;
        if (! $target || (int) $target === (int) $asset->folder_id) {
            return;
        }
        app(DamFolderStorage::class)->moveAsset($asset, (int) $target);
        $asset->update(['folder_id' => (int) $target, 'updated_by' => $actor->id]);
    }

    /** @param array<string, mixed> $data */
    private function assignContentFolder(array $data, User $actor): array
    {
        $content = Content::query()->with('series:id,name,code_prefix')->find($data['content_id']);
        if (! $content) {
            return $data;
        }

        // Folder placement is only a visual/storage default. The content DAM
        // relation remains authoritative and explicit folder_id selection is
        // preserved by assignContextFolder before this method is reached.
        $bucketId = (string) ($data['content_bucket'] ?? 'attachments');
        [$bucketKey, $bucketName] = match ($bucketId) {
            'inputs', 'initial_input' => ['inputs', 'ورودی‌ها'],
            'outputs', 'final', 'publication' => ['outputs', 'خروجی‌ها'],
            default => ['other', 'پیوست‌های دیگر'],
        };
        $series = $content->series;
        if ($series) {
            $seriesCode = trim((string) $series->code_prefix);
            $groupName = trim($series->name.($seriesCode !== '' ? ' - '.$seriesCode : ''));
            $groupKey = 'content-series:'.$series->id;
        } else {
            $publicCode = trim((string) $content->code) ?: 'کد عمومی';
            $groupName = 'عمومی - '.$publicCode;
            $groupKey = 'content-general:'.$content->id;
        }

        $root = $this->managedFolder('محتواها', null, 'contents-root', $actor);
        $group = $this->managedFolder($groupName, $root->id, $groupKey, $actor);
        if ($group->name !== $groupName) {
            $group->update(['name' => $groupName]);
        }

        // Series members intentionally share one folder named after the Series
        // and its public code. Their explicit DAM relations distinguish inputs,
        // outputs and attachments without fragmenting each occurrence into a
        // second folder tree. Standalone Content keeps the three visual buckets.
        if ($series) {
            $data['folder_id'] = $group->id;

            return $data;
        }

        $bucket = $this->managedFolder($bucketName, $group->id, $groupKey.':'.$bucketKey, $actor);
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
