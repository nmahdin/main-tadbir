<?php

namespace App\Providers;

use App\Bot\Bale\Client\BaleHttp;
use App\Bot\Bale\Notifications\NotificationDelivery;
use App\Events\ContentPublished;
use App\Models\DomainRecord;
use App\Observers\DomainRecordObserver;
use App\Services\TaskAutomationProcessor;
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
