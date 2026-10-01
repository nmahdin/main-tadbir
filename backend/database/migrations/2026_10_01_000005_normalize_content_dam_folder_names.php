<?php

use App\Models\DamAsset;
use App\Models\DamFolder;
use App\Services\DamFolderStorage;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Storage;

return new class extends Migration
{
    public function up(): void
    {
        $storage = app(DamFolderStorage::class);
        foreach ([
            'محتوا ها' => 'محتواها',
            'پیوست ها' => 'پیوست‌ها',
            'خروجی ها' => 'خروجی‌ها',
        ] as $legacy => $canonical) {
            DamFolder::query()->where('name', $legacy)->orderBy('id')->get()
                ->each(fn (DamFolder $folder) => $this->normalize($folder, $canonical, $storage));
        }
    }

    private function normalize(DamFolder $source, string $canonical, DamFolderStorage $storage): void
    {
        $target = DamFolder::query()
            ->whereKeyNot($source->id)
            ->where('parent_id', $source->parent_id)
            ->where('name', $canonical)
            ->first();

        if ($target) {
            $this->merge($source, $target, $storage);
            return;
        }

        $oldPath = $storage->path($source);
        $source->update(['name' => $canonical]);
        $storage->move($oldPath, $source->refresh());
    }

    private function merge(DamFolder $source, DamFolder $target, DamFolderStorage $storage): void
    {
        $sourcePath = $storage->path($source);
        DamAsset::query()->where('folder_id', $source->id)->get()->each(function (DamAsset $asset) use ($target, $storage): void {
            $storage->moveAsset($asset, $target->id);
            $asset->update(['folder_id' => $target->id]);
        });

        DamFolder::query()->where('parent_id', $source->id)->get()->each(function (DamFolder $child) use ($target, $storage): void {
            $matching = DamFolder::query()->where('parent_id', $target->id)->where('name', $child->name)->first();
            if ($matching) {
                $this->merge($child, $matching, $storage);
                return;
            }

            $oldPath = $storage->path($child);
            $child->update(['parent_id' => $target->id]);
            $storage->move($oldPath, $child->refresh());
        });

        $source->delete();
        if (Storage::disk('local')->exists($sourcePath)) {
            Storage::disk('local')->deleteDirectory($sourcePath);
        }
    }

    public function down(): void
    {
        // Canonical Persian folder names are intentionally preserved on rollback.
    }
};
