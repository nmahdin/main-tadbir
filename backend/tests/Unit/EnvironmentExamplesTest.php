<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class EnvironmentExamplesTest extends TestCase
{
    /**
     * Read a `KEY=VALUE` profile without depending on Dotenv's ini-based
     * parser, which is unavailable in some sandboxed PHP builds.
     *
     * @return array<string, string>
     */
    private function profile(string $name): array
    {
        $path = str_starts_with($name, '/')
            ? dirname(__DIR__, 3).$name
            : dirname(__DIR__, 2).'/'.$name;
        $values = [];
        foreach (explode("\n", (string) file_get_contents($path)) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || ! str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            $values[trim($key)] = trim(trim($value), '"\'');
        }

        return $values;
    }

    public function test_production_profile_matches_the_panel_and_api_without_worker_dependencies(): void
    {
        $values = $this->profile('.env.example');
        foreach ([
            'APP_ENV' => 'production',
            'APP_DEBUG' => 'false',
            'APP_URL' => 'https://api-tadbir.morvarid-daron.ir',
            'FRONTEND_URL' => 'https://tadbir.morvarid-daron.ir',
            'DB_CONNECTION' => 'mysql',
            'SESSION_DOMAIN' => '.morvarid-daron.ir',
            'SESSION_SECURE_COOKIE' => 'true',
            'SESSION_HTTP_ONLY' => 'true',
            'SESSION_SAME_SITE' => 'lax',
            'SANCTUM_STATEFUL_DOMAINS' => 'tadbir.morvarid-daron.ir,api-tadbir.morvarid-daron.ir',
            'SESSION_DRIVER' => 'file',
            'CACHE_STORE' => 'file',
            'QUEUE_CONNECTION' => 'sync',
            'BALE_PANEL_URL' => 'https://tadbir.morvarid-daron.ir/',
            'BALE_PUBLIC_BASE_URL' => 'https://api-tadbir.morvarid-daron.ir',
        ] as $key => $expected) {
            $this->assertSame($expected, $values[$key], $key);
        }
    }

    public function test_local_profile_uses_sqlite_and_does_not_send_email_or_require_https(): void
    {
        $values = $this->profile('.env.local.example');
        $this->assertSame('local', $values['APP_ENV']);
        $this->assertSame('http://localhost:3000', $values['FRONTEND_URL']);
        $this->assertSame('sqlite', $values['DB_CONNECTION']);
        $this->assertArrayNotHasKey('DB_DATABASE', $values);
        $this->assertSame('null', $values['SESSION_DOMAIN']);
        $this->assertSame('false', $values['SESSION_SECURE_COOKIE']);
        $this->assertSame('array', $values['MAIL_MAILER']);
        $this->assertSame('sync', $values['QUEUE_CONNECTION']);
    }

    public function test_backend_examples_contain_no_default_secrets(): void
    {
        foreach (['.env.example', '.env.local.example'] as $file) {
            $values = $this->profile($file);
            foreach (['APP_KEY', 'DB_PASSWORD', 'MAIL_PASSWORD', 'BALE_RUNNER_SECRET', 'SEED_MAHDI_PASSWORD', 'SEED_EMAD_PASSWORD', 'SEED_AMIRALI_PASSWORD'] as $key) {
                $this->assertSame('', $values[$key] ?? '', $file.': '.$key);
            }
            $this->assertSame('array', $values['MAIL_MAILER']);
            $this->assertArrayNotHasKey('MAIL_HOST', $values);
            foreach (['SEED_MAHDI_EMAIL', 'SEED_EMAD_EMAIL', 'SEED_AMIRALI_EMAIL'] as $key) {
                $this->assertArrayNotHasKey($key, $values);
            }
            foreach (['SEED_MAHDI_PASSWORD', 'SEED_EMAD_PASSWORD', 'SEED_AMIRALI_PASSWORD'] as $key) {
                $this->assertArrayHasKey($key, $values);
            }
        }
    }

    public function test_frontend_production_profile_contains_only_public_build_settings(): void
    {
        $values = $this->profile('/frontend/.env.production.example');
        $this->assertSame([
            'VITE_API_URL' => 'https://api-tadbir.morvarid-daron.ir/api/v1',
            'VITE_SANCTUM_URL' => 'https://api-tadbir.morvarid-daron.ir',
            'VITE_DEMO_MODE' => 'false',
        ], $values);
    }
}
