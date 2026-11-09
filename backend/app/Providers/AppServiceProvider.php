<?php

namespace App\Providers;

use App\Core\Billing\Gateways\SandboxPaymentGateway;
use App\Core\Billing\Gateways\UnavailablePaymentGateway;
use App\Core\Billing\PaymentGateway;
use App\Core\Identity\Otp\FakeSmsOtpDelivery;
use App\Core\Identity\Otp\SmsOtpDelivery;
use App\Core\Identity\Otp\UnavailableSmsOtpDelivery;
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
        $this->app->bind(SmsOtpDelivery::class, function (): SmsOtpDelivery {
            return match ((string) config('auth.otp.driver', '')) {
                'fake' => new FakeSmsOtpDelivery,
                default => new UnavailableSmsOtpDelivery,
            };
        });
        // C5-M3: provider-neutral payment gateway. Default
        // 'unavailable' for production; 'sandbox' in testing only
        // (bound by PaymentGatewayServiceProvider below so that
        // environments can swap real PSP adapters via config).
        $this->app->bind(PaymentGateway::class, function () {
            return match ((string) config('billing.gateway', 'unavailable')) {
                'sandbox' => new SandboxPaymentGateway,
                default => new UnavailablePaymentGateway,
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
