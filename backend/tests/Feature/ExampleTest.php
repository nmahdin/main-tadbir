<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * ریشهٔ دامنهٔ API صفحهٔ مستقل وضعیت بک‌اند را برمی‌گرداند (جزئیات در StatusPageTest).
     */
    public function test_the_application_returns_a_successful_response(): void
    {
        $this->get('/')->assertOk()->assertSee('<html', false);
    }
}
