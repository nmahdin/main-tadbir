<?php

namespace App\Observers;

use App\Bot\Bale\Notifications\NotificationDelivery;
use App\Models\DomainRecord;

final class DomainRecordObserver
{
    public function created(DomainRecord $record): void
    {
        app(NotificationDelivery::class)->created($record);
    }
}
