<?php

namespace Tests\Feature;

use Tests\TestCase;

class StatusPageTest extends TestCase
{
    public function test_root_serves_standalone_status_page_without_session_or_cookies(): void
    {
        $response = $this->get('/');

        $response->assertOk()
            ->assertHeader('Content-Type', 'text/html; charset=UTF-8')
            ->assertSee('وضعیت بک‌اند تدبیر')
            ->assertSee('/api/v1/health', false)
            ->assertSee('/api/v1/health/db', false)
            ->assertSee('بررسی مجدد')
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow')
            ->assertHeader('X-Frame-Options', 'DENY');

        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        $this->assertSame([], $response->headers->getCookies(), 'صفحهٔ وضعیت نباید کوکی/نشست بسازد.');
    }

    public function test_status_page_is_independent_from_the_frontend_bundle(): void
    {
        $html = $this->get('/')->assertOk()->getContent();

        $this->assertStringNotContainsString('/assets/', $html);
        $this->assertStringNotContainsString('tadbir.morvarid-daron.ir', $html);
        $this->assertStringNotContainsString('sanctum/csrf-cookie', $html);
        $this->assertStringContainsString("credentials: 'omit'", $html);
    }

    public function test_status_page_has_no_automatic_polling_and_never_uses_innerhtml(): void
    {
        $html = $this->get('/')->assertOk()->getContent();

        // تنها setInterval مجاز، تازه‌سازی متن «چند ثانیه پیش» است و باید درخواست شبکه نفرستد.
        $this->assertSame(1, substr_count($html, 'setInterval('));
        $this->assertStringContainsString('setInterval(updateChecked, 15000)', $html);
        $this->assertStringNotContainsString('innerHTML', $html);
        $this->assertStringNotContainsString('eval(', $html);
    }

    public function test_status_page_csp_uses_a_fresh_nonce_and_matches_inline_blocks(): void
    {
        $first = $this->get('/');
        $second = $this->get('/');

        $csp = (string) $first->headers->get('Content-Security-Policy');
        $this->assertSame(1, preg_match("/script-src 'nonce-([^']+)'/", $csp, $script));
        $this->assertSame(1, preg_match("/style-src 'nonce-([^']+)'/", $csp, $style));
        $this->assertSame($script[1], $style[1]);
        $this->assertStringContainsString('<script nonce="'.$script[1].'">', $first->getContent());
        $this->assertStringContainsString('<style nonce="'.$style[1].'">', $first->getContent());
        $this->assertStringNotContainsString('__NONCE__', $first->getContent());
        $this->assertStringContainsString("connect-src 'self'", $csp);
        $this->assertStringContainsString("default-src 'none'", $csp);

        $this->assertNotSame(
            $script[1],
            $this->nonceFrom($second),
            'nonce باید در هر درخواست تازه باشد.',
        );
    }

    public function test_status_page_does_not_disclose_environment_or_configuration(): void
    {
        config([
            'database.connections.mysql.password' => 'secret-db-password-example',
            'database.connections.mysql.database' => 'private_db_name_example',
        ]);

        $content = $this->get('/')->assertOk()->getContent();

        foreach ([
            'secret-db-password-example', 'private_db_name_example', 'APP_KEY', 'DB_PASSWORD',
            'storage/', 'vendor/', 'PHP_VERSION', 'Laravel',
        ] as $needle) {
            $this->assertStringNotContainsString($needle, $content);
        }
        $this->assertStringNotContainsString(PHP_VERSION, $content);
    }

    public function test_public_health_endpoints_do_not_start_sessions_for_stateful_origins(): void
    {
        foreach (['/api/v1/health', '/api/v1/health/db'] as $path) {
            $response = $this->withHeaders([
                'Origin' => 'https://tadbir.morvarid-daron.ir',
                'Referer' => 'https://tadbir.morvarid-daron.ir/',
                'Accept' => 'application/json',
            ])->get($path);

            $response->assertOk()->assertJsonPath('ok', true);
            $this->assertSame([], $response->headers->getCookies(), "{$path} نباید کوکی نشست بسازد.");
        }
    }

    private function nonceFrom($response): string
    {
        preg_match("/script-src 'nonce-([^']+)'/", (string) $response->headers->get('Content-Security-Policy'), $m);

        return $m[1] ?? '';
    }
}
