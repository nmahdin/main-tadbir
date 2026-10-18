<?php

namespace App\Core\Architecture;

/**
 * Deterministic domain/module path registries (ARCH-01).
 *
 * Every list here is EXPLICIT and ORDERED — no recursive directory
 * scanning anywhere. Order is dependency order (identity/RBAC
 * foundations first, settings/subscriptions later, business
 * modules last) so registration is stable across machines.
 *
 * Historical migrations stay in `database/migrations` (their
 * recorded identity/order is production history — see
 * docs/architecture/repository-organization.md). The domain-owned
 * paths below are additional registered locations and the ONLY
 * allowed home for NEW migrations.
 */
final class DomainPaths
{
    /** @var list<string> Core domains in dependency order. */
    public const CORE_DOMAINS = [
        'Identity',
        'Audit',
        'Rbac',
        'Organizations',
        'Workspaces',
        'Memberships',
        'Authorization',
        'Platform',
        'Modules',
        'Plans',
        'Subscriptions',
        'Settings',
        'Invitations',
    ];

    /** @var list<string> Business modules (app/Modules). */
    public const BUSINESS_MODULES = [
        'Projects',
        'Tasks',
        'Contents',
        'Dam',
        'Secretariat',
        'Messaging',
        'Collaboration',
        'Notifications',
        'Meetings',
        'Departments',
        'Identity',
        'Administration',
        'Integrations',
        'Reference',
    ];

    /**
     * All registered migration paths that currently exist, in
     * registration order: historical location first, then Core
     * domains, then business modules.
     *
     * @return list<string>
     */
    public static function migrationPaths(): array
    {
        $paths = [database_path('migrations')];

        foreach (self::CORE_DOMAINS as $domain) {
            $paths[] = app_path("Core/{$domain}/Database/Migrations");
        }

        foreach (self::BUSINESS_MODULES as $module) {
            $paths[] = app_path("Modules/{$module}/Database/Migrations");
        }

        return array_values(array_filter($paths, static fn (string $path): bool => is_dir($path)));
    }

    /**
     * Core route files loaded by the thin registrar in
     * routes/api.php, keyed by the group they belong to. The order
     * matches the pre-ARCH-01 inline order exactly (route
     * registration order is preserved; paths/names/middleware are
     * unchanged because the statements themselves are verbatim).
     *
     * @return array{public: list<string>, authenticated: list<string>}
     */
    public static function routeFiles(): array
    {
        return [
            'public' => [
                app_path('Core/Invitations/Routes/public.php'),
            ],
            // The pre-ARCH-01 inline order inside the authenticated
            // group: foundation + invitations + identity first...
            'authenticated' => [
                app_path('Core/Organizations/Routes/api.php'),
                app_path('Core/Rbac/Routes/api.php'),
                app_path('Core/Modules/Routes/api.php'),
                app_path('Core/Invitations/Routes/api.php'),
                app_path('Core/Identity/Routes/api.php'),
                app_path('Core/Settings/Routes/api.php'),
            ],
            // ...and the Platform group at its original position
            // after the legacy user routes.
            'authenticated_platform' => [
                app_path('Core/Platform/Routes/api.php'),
            ],
        ];
    }
}
