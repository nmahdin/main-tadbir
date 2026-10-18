<?php

namespace App\Modules\Secretariat\Observers;
use App\Modules\Messaging\Bot\Bale\Notifications\NotificationDelivery;

use App\Models\DomainRecord;

final class DomainRecordObserver
{
    public function created(DomainRecord $record): void
    {
        app(NotificationDelivery::class)->created($record);
    }
}
