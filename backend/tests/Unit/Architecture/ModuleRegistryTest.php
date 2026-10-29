<?php

namespace Tests\Unit\Architecture;

use App\Core\Modules\ModuleManifest;
use App\Core\Modules\ModuleRegistry;
use App\Modules\Reference\ReferenceModule;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class ModuleRegistryTest extends TestCase
{
    public function test_reference_module_registers_and_is_retrievable(): void
    {
        $registry = new ModuleRegistry;
        $registry->register(ReferenceModule::manifest());

        $this->assertTrue($registry->has('reference'));
        $this->assertSame('reference', $registry->get('reference')->id);
        $this->assertSame(['reference'], array_keys($registry->all()));
    }

    public function test_duplicate_module_id_is_rejected(): void
    {
        $registry = new ModuleRegistry;
        $registry->register(new ModuleManifest('projects', ['projects.view']));

        $this->expectException(InvalidArgumentException::class);
        $registry->register(new ModuleManifest('projects'));
    }

    public function test_duplicate_permission_ownership_is_rejected(): void
    {
        $registry = new ModuleRegistry;
        $registry->register(new ModuleManifest('projects', ['projects.view']));

        $this->expectException(InvalidArgumentException::class);
        $registry->register(new ModuleManifest('tasks', ['projects.view']));
    }

    public function test_unknown_module_lookup_is_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        (new ModuleRegistry)->get('missing');
    }

    public function test_invalid_module_id_and_permission_key_are_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        new ModuleManifest('Invalid ID');
    }

    public function test_permission_keys_are_aggregated_sorted(): void
    {
        $registry = new ModuleRegistry;
        $registry->register(new ModuleManifest('tasks', ['tasks.view', 'tasks.create']));
        $registry->register(new ModuleManifest('projects', ['projects.view']));

        $this->assertSame(['projects.view', 'tasks.create', 'tasks.view'], $registry->permissionKeys());
    }
}
