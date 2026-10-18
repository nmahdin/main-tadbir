<?php

namespace App\Modules\Secretariat\Observers;
use App\Models\DomainRecord;
use App\Modules\Messaging\Bot\Bale\Notifications\NotificationDelivery;
final class DomainRecordObserver
{
    public function created(DomainRecord $record): void
    {
        app(NotificationDelivery::class)->created($record);
    }
}
