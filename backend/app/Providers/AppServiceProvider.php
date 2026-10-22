<?php

namespace App\Providers;

use App\Models\DomainRecord;
use App\Modules\Contents\Events\ContentPublished;
use App\Modules\Messaging\Bot\Bale\Client\BaleHttp;
use App\Modules\Messaging\Bot\Bale\Notifications\NotificationDelivery;
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
        // AMB-03=A: SMS OTP delivery is provider-neutral; unconfigured
        // means fail-safe unavailable (never a code-leaking log driver
        // in production). The fake driver is explicit opt-in (local/CI).
        $this->app->bind(\App\Core\Identity\Otp\SmsOtpDelivery::class, function (): \App\Core\Identity\Otp\SmsOtpDelivery {
            return match ((string) config('auth.otp.driver', '')) {
                'fake' => new \App\Core\Identity\Otp\FakeSmsOtpDelivery,
                default => new \App\Core\Identity\Otp\UnavailableSmsOtpDelivery,
            };
        });
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
