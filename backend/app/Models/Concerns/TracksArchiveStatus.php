<?php

namespace App\Models\Concerns;

trait TracksArchiveStatus
{
    protected static function bootTracksArchiveStatus(): void
    {
        static::saving(function ($model) {
            if (! $model->isDirty('status')) {
                return;
            }
            if ($model->status === 'archived' && $model->getOriginal('status') !== 'archived') {
                $model->previous_status = $model->getOriginal('status');
            } elseif ($model->getOriginal('status') === 'archived') {
                $model->previous_status = null;
            }
        });
    }
}
