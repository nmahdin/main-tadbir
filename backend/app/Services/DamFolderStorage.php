<?php

namespace App\Services;

use App\Models\DamAsset;
use App\Models\DamFile;
use App\Models\DamFolder;
use Illuminate\Support\Facades\Storage;

/** Keeps the private disk tree identical to the folder tree shown in DAM. */
final class DamFolderStorage
{
    public function path(DamFolder|int|null $folder): string
    {
        $folder = is_int($folder) ? DamFolder::query()->find($folder) : $folder;
        if (! $folder) {
            return 'dam/ریشه';
        }
        $segments = [];
        $cursor = $folder;
        $guard = 0;
        while ($cursor && $guard++ < 50) {
            array_unshift($segments, $this->segment($cursor->name));
            $cursor = $cursor->parent_id ? DamFolder::query()->find($cursor->parent_id) : null;
        }

        return 'dam/'.implode('/', $segments);
    }

    public function ensure(DamFolder|int|null $folder): string
    {
        $path = $this->path($folder);
        Storage::disk('local')->makeDirectory($path);

        return $path;
    }

    public function move(string $oldPath, DamFolder $folder): void
    {
        $newPath = $this->path($folder);
        if ($oldPath === $newPath) {
            $this->ensure($folder);
            return;
        }
        if (Storage::disk('local')->exists($oldPath)) {
            Storage::disk('local')->move($oldPath, $newPath);
        } else {
            Storage::disk('local')->makeDirectory($newPath);
        }
        DamFile::query()->where('storage_path', 'like', $oldPath.'/%')->get()
            ->each(function (DamFile $file) use ($oldPath, $newPath): void {
                $file->update(['storage_path' => $newPath.substr($file->storage_path, strlen($oldPath))]);
            });
    }

    public function moveAsset(DamAsset $asset, ?int $folderId): void
    {
        $directory = $this->ensure($folderId);
        $asset->files()->get()->each(function (DamFile $file) use ($directory): void {
            $target = $directory.'/'.$file->stored_filename;
            if ($file->storage_path === $target) {
                return;
            }
            if (Storage::disk($file->storage_disk)->exists($file->storage_path)) {
                Storage::disk($file->storage_disk)->move($file->storage_path, $target);
            }
            $file->update(['storage_path' => $target]);
        });
    }

    private function segment(string $name): string
    {
        $clean = trim(str_replace(["/", "\\", "\0"], '-', $name));

        return $clean !== '' && ! in_array($clean, ['.', '..'], true) ? $clean : 'بدون نام';
    }
}
