<?php

namespace App\Providers;

use App\Bot\Bale\Client\BaleHttp;
use App\Bot\Bale\Notifications\NotificationDelivery;
use App\Models\DomainRecord;
use App\Observers\DomainRecordObserver;
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
        DomainRecord::observe(DomainRecordObserver::class);
    }
}
