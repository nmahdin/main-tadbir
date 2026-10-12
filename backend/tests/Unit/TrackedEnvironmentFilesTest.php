<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Environment files are host-owned secrets. The repository may only ever carry
 * secret-free *.example profiles, and a real .env must never reach the index.
 */
class TrackedEnvironmentFilesTest extends TestCase
{
    private function repositoryRoot(): string
    {
        return dirname(__DIR__, 3);
    }

    /**
     * Tracked paths read straight from .git/index, so the guard needs no git
     * binary and no process spawning (shared hosts and CI sandboxes differ).
     *
     * @return list<string>|null null when the index is absent or uses an
     *                            unsupported layout (version 4 path compression).
     */
    private function trackedFiles(): ?array
    {
        $index = $this->repositoryRoot().'/.git/index';
        if (! is_file($index) || ! is_readable($index)) {
            return null;
        }
        $bytes = file_get_contents($index);
        if (! is_string($bytes) || strlen($bytes) < 12 || substr($bytes, 0, 4) !== 'DIRC') {
            return null;
        }
        $version = unpack('N', substr($bytes, 4, 4))[1];
        $count = unpack('N', substr($bytes, 8, 4))[1];
        if (! in_array($version, [2, 3], true)) {
            return null;
        }

        $paths = [];
        $offset = 12;
        for ($entry = 0; $entry < $count; $entry++) {
            if ($offset + 62 > strlen($bytes)) {
                return null;
            }
            $flags = unpack('n', substr($bytes, $offset + 60, 2))[1];
            $extended = ($flags & 0x4000) !== 0;
            $header = 62 + ($extended && $version >= 3 ? 2 : 0);
            $end = strpos($bytes, "\0", $offset + $header);
            if ($end === false) {
                return null;
            }
            $paths[] = substr($bytes, $offset + $header, $end - ($offset + $header));
            // Entries are NUL-padded so the next one starts on an 8-byte boundary.
            $offset = $end + 1;
            $offset += (8 - ($offset % 8)) % 8;
        }

        return $paths;
    }

    /**
     * Read a `KEY=VALUE` profile without Dotenv's ini-based parser, which is
     * unavailable in some sandboxed PHP builds.
     *
     * @return array<string, string>
     */
    private function profile(string $file): array
    {
        $values = [];
        foreach (explode("\n", (string) file_get_contents($file)) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || ! str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            $values[trim($key)] = trim(trim($value), '"\'');
        }

        return $values;
    }

    public function test_no_real_environment_file_is_tracked_in_git(): void
    {
        $tracked = $this->trackedFiles();
        if ($tracked === null) {
            $this->markTestSkipped('Git index is not readable in this environment.');
        }

        $this->assertNotSame([], $tracked);
        foreach ($tracked as $path) {
            $this->assertFalse(
                preg_match('#(^|/)\.env(\.[^.]*)?$#', $path) === 1 && ! str_ends_with($path, '.example'),
                'A real environment file must never be tracked: '.$path,
            );
        }
    }

    public function test_gitignore_blocks_every_environment_file_and_keeps_only_examples(): void
    {
        $ignore = file_get_contents($this->repositoryRoot().'/.gitignore');
        $this->assertIsString($ignore);
        $this->assertMatchesRegularExpression('#^\*\*/\.env$#m', $ignore);
        $this->assertMatchesRegularExpression('#^\*\*/\.env\.\*$#m', $ignore);
        $this->assertMatchesRegularExpression('#^!\*\*/\.env\.example$#m', $ignore);
        $this->assertMatchesRegularExpression('#^!\*\*/\.env\.\*\.example$#m', $ignore);
    }

    public function test_committed_example_profiles_carry_no_secret_values(): void
    {
        $examples = [
            $this->repositoryRoot().'/backend/.env.example',
            $this->repositoryRoot().'/backend/.env.local.example',
        ];
        foreach ($examples as $file) {
            $this->assertFileExists($file);
            $values = $this->profile($file);
            foreach (['APP_KEY', 'DB_PASSWORD', 'MAIL_PASSWORD', 'BALE_RUNNER_SECRET',
                'SEED_MAHDI_PASSWORD', 'SEED_EMAD_PASSWORD', 'SEED_AMIRALI_PASSWORD'] as $key) {
                $this->assertSame('', $values[$key] ?? '', basename($file).': '.$key);
            }
        }

        $frontend = $this->profile($this->repositoryRoot().'/frontend/.env.production.example');
        $this->assertSame([
            'VITE_API_URL' => 'https://api-tadbir.morvarid-daron.ir/api/v1',
            'VITE_SANCTUM_URL' => 'https://api-tadbir.morvarid-daron.ir',
            'VITE_DEMO_MODE' => 'false',
        ], $frontend);
    }
}
