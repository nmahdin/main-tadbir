<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;

/**
 * Architecture boundary checks (Stage 02, ADR-0001 / CODING_STANDARDS §6,
 * extended by ARCH-02, docs/architecture/arch-02-module-organization.md).
 *
 * These are intentionally simple source scans over app/Core and
 * app/Modules. After ARCH-02 the legacy global zones (app/Services,
 * app/Bot, app/Support, ...) no longer exist, so every legacy-plane file
 * lives inside a module and is scanned here. Cross-module collaboration
 * in the migrated legacy service graph is frozen by the E2 ratchet
 * below: the pair set and per-pair import counts may only shrink.
 */
class DependencyRulesTest extends TestCase
{
    /**
     * ARCH-02 exception E2 — the registered legacy cross-module import
     * graph (unordered collaboration edges between migrated legacy
     * services). New cross-module imports must go through the target
     * module's Contracts namespace, never be added to this map.
     *
     * @var array<string, int>
     */
    private const LEGACY_CROSS_MODULE_EDGES = [
        'Administration>Contents' => 6,
        'Administration>Integrations' => 1,
        'Administration>Projects' => 1,
        'Administration>Tasks' => 3,
        'Collaboration>Contents' => 1,
        'Collaboration>Tasks' => 1,
        'Contents>Dam' => 7,
        'Contents>Projects' => 8,
        'Contents>Tasks' => 5,
        'Dam>Contents' => 4,
        'Dam>Messaging' => 1,
        'Dam>Projects' => 2,
        'Dam>Tasks' => 3,
        'Identity>Messaging' => 2,
        'Integrations>Dam' => 4,
        'Meetings>Messaging' => 3,
        'Meetings>Projects' => 1,
        'Meetings>Tasks' => 2,
        'Messaging>Contents' => 1,
        'Messaging>Dam' => 6,
        'Messaging>Departments' => 3,
        'Messaging>Identity' => 11,
        'Messaging>Tasks' => 4,
        'Notifications>Contents' => 1,
        'Projects>Contents' => 1,
        'Projects>Dam' => 3,
        'Projects>Tasks' => 2,
        'Secretariat>Dam' => 1,
        'Secretariat>Integrations' => 1,
        'Secretariat>Meetings' => 2,
        'Secretariat>Messaging' => 3,
        'Secretariat>Notifications' => 1,
        'Secretariat>Projects' => 2,
        'Tasks>Collaboration' => 1,
        'Tasks>Contents' => 10,
        'Tasks>Projects' => 2,
    ];

    private string $appPath;

    protected function setUp(): void
    {
        parent::setUp();
        $this->appPath = dirname(__DIR__, 3).'/app';
    }

    public function test_core_does_not_depend_on_modules_or_integrations(): void
    {
        foreach ($this->phpFiles($this->appPath.'/Core') as $file) {
            $source = (string) file_get_contents($file);
            $this->assertStringNotContainsString('App\\Modules\\', $source, "Core must not depend on business modules: {$file}");
            $this->assertStringNotContainsString('App\\Integrations\\', $source, "Core must not depend on integrations: {$file}");
        }
    }

    public function test_modules_do_not_depend_on_integrations(): void
    {
        foreach ($this->phpFiles($this->appPath.'/Modules') as $file) {
            $source = (string) file_get_contents($file);
            $this->assertStringNotContainsString('App\\Integrations\\', $source, "Modules must not depend on integrations: {$file}");
        }
    }

    public function test_cross_module_imports_never_target_http_controllers(): void
    {
        foreach ($this->phpFiles($this->appPath.'/Modules') as $file) {
            $relative = str_replace($this->appPath.'/Modules/', '', $file);
            $ownModule = explode('/', $relative)[0];
            $source = (string) file_get_contents($file);

            preg_match_all('/use App\\\\Modules\\\\([A-Za-z]+)\\\\([^;]+);/', $source, $matches, PREG_SET_ORDER);
            foreach ($matches as $match) {
                [, $otherModule, $rest] = $match;
                if ($otherModule === $ownModule) {
                    continue;
                }
                $this->assertStringNotStartsWith(
                    'Http\\Controllers\\',
                    $rest,
                    "Cross-module import must never target another module's HTTP layer: {$file} imports App\\Modules\\{$otherModule}\\{$rest}"
                );
            }
        }
    }

    public function test_cross_module_service_imports_stay_within_the_registered_legacy_graph(): void
    {
        $actual = [];

        foreach ($this->phpFiles($this->appPath.'/Modules') as $file) {
            $relative = str_replace($this->appPath.'/Modules/', '', $file);
            $ownModule = explode('/', $relative)[0];
            $source = (string) file_get_contents($file);

            preg_match_all('/use App\\\\Modules\\\\([A-Za-z]+)\\\\([^;]+);/', $source, $matches, PREG_SET_ORDER);
            foreach ($matches as $match) {
                [, $otherModule, $rest] = $match;
                if ($otherModule === $ownModule || str_starts_with($rest, 'Contracts\\')) {
                    continue;
                }
                $pair = $ownModule.'>'.$otherModule;
                $actual[$pair] = ($actual[$pair] ?? 0) + 1;
                $this->assertArrayHasKey(
                    $pair,
                    self::LEGACY_CROSS_MODULE_EDGES,
                    "New cross-module imports must go through the target module's Contracts namespace, not join the frozen legacy graph (E2): {$file} imports App\\Modules\\{$otherModule}\\{$rest}"
                );
            }
        }

        foreach ($actual as $pair => $count) {
            $this->assertLessThanOrEqual(
                self::LEGACY_CROSS_MODULE_EDGES[$pair],
                $count,
                "The legacy cross-module edge [{$pair}] may only shrink (E2 ratchet); route new collaboration through Contracts instead."
            );
        }
    }

    public function test_each_module_has_a_manifest_provider(): void
    {
        $modulesPath = $this->appPath.'/Modules';
        $directories = array_filter(glob($modulesPath.'/*') ?: [], 'is_dir');
        $this->assertNotEmpty($directories, 'Expected at least the reference module under app/Modules.');

        foreach ($directories as $directory) {
            $module = basename($directory);
            $candidates = glob($directory.'/*Module.php') ?: [];
            $this->assertNotEmpty($candidates, "Module [{$module}] must provide a *Module manifest provider (see ReferenceModule).");
        }
    }

    /** @return array<int, string> */
    private function phpFiles(string $directory): array
    {
        if (! is_dir($directory)) {
            return [];
        }

        $files = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($directory));
        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                $files[] = $file->getPathname();
            }
        }
        sort($files);

        return $files;
    }
}
