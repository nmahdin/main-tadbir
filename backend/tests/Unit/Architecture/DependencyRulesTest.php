<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;

/**
 * Architecture boundary checks (Stage 02, ADR-0001 / CODING_STANDARDS §6).
 *
 * These are intentionally simple source scans over the NEW zones only
 * (app/Core, app/Modules, app/Integrations). Legacy zones (app/Services,
 * app/Bot, app/Http, ...) are not scanned: they migrate per module in
 * Stage 05, and scanning them now would only produce unactionable noise.
 */
class DependencyRulesTest extends TestCase
{
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

    public function test_cross_module_imports_go_through_contracts_only(): void
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
                $this->assertStringStartsWith(
                    'Contracts\\',
                    $rest,
                    "Cross-module import must use the target module's Contracts namespace: {$file} imports App\\Modules\\{$otherModule}\\{$rest}"
                );
            }
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
