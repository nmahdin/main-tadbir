<?php

namespace Tests\Feature;

use App\Services\SystemMetrics;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class SystemStatusDashboardTest extends TestCase
{
    public function test_root_renders_a_local_self_contained_operational_dashboard(): void
    {
        config(['system-status.metrics_store' => 'array']);
        app(SystemMetrics::class)->record(200, 12_000);

        $response = $this->get('/');

        $response->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertSee('وضعیت عملیاتی سامانه')
            ->assertSee('پایگاه داده')
            ->assertSee('درخواست‌های امروز')
            ->assertSee('vazirmatn-arabic-variable.woff2')
            ->assertDontSee('fonts.googleapis.com')
            ->assertDontSee((string) config('database.connections.'.config('database.default').'.database'));
    }

    public function test_request_metrics_are_aggregated_without_paths_or_user_data(): void
    {
        config(['system-status.metrics_store' => 'array']);
        Carbon::setTestNow('2026-09-30 12:00:00');
        $metrics = app(SystemMetrics::class);

        $metrics->record(200, 10_000);
        $metrics->record(503, 30_000);
        $snapshot = $metrics->snapshot();

        $this->assertSame(2, $snapshot['requests_today']);
        $this->assertSame(2, $snapshot['requests_five_minutes']);
        $this->assertSame(1, $snapshot['errors_today']);
        $this->assertSame(50.0, $snapshot['error_rate']);
        $this->assertSame(20.0, $snapshot['average_ms']);
        $this->assertArrayNotHasKey('path', $snapshot);
        $this->assertArrayNotHasKey('user', $snapshot);
    }
}
