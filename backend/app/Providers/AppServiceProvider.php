<?php

namespace App\Providers;

use App\Bot\Bale\Client\BaleHttp;
use App\Bot\Bale\Notifications\NotificationDelivery;
use App\Events\ContentPublished;
use App\Models\DomainRecord;
use App\Observers\DomainRecordObserver;
use App\Services\TaskAutomationProcessor;
use App\Support\Storage\StorageSettings;
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

        // محل ذخیرهٔ فایل‌ها می‌تواند از داخل پنل (بدون SSH) تعیین شده باشد؛ پیش از
        // هر استفاده از دیسک `local` روی پیکربندی نشانده می‌شود.
        StorageSettings::apply();
    }
}
