<?php

namespace App\Providers;

use App\Modules\Messaging\Bot\Bale\Client\BaleHttp;
use App\Modules\Messaging\Bot\Bale\Notifications\NotificationDelivery;
use App\Modules\Contents\Events\ContentPublished;
use App\Models\DomainRecord;
use App\Modules\Secretariat\Observers\DomainRecordObserver;
use App\Modules\Tasks\Services\TaskAutomationProcessor;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(BaleHttp::class);
        $this->app->singleton(NotificationDelivery::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Event::listen(ContentPublished::class, [TaskAutomationProcessor::class, 'handle']);
        DomainRecord::observe(DomainRecordObserver::class);
    }
}
