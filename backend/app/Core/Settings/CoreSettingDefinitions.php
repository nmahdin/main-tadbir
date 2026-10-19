<?php

namespace App\Core\Settings;

/**
 * The Core-owned setting definitions seeded in Stage C7-1.
 *
 * Only settings backed by existing product contracts live here —
 * no speculative commercial catalog:
 *
 *  - organization.public.description / organization.public.logo_url:
 *    the public Organization display metadata the C6 invitation
 *    presenter already serves. COMPATIBILITY: the writable source
 *    in C7-1 remains the legacy `organizations.settings` JSON
 *    (`settings.public.*`, recorded under `legacy_source`); these
 *    definitions reserve the canonical keys and semantics so C7-2
 *    can migrate writes without a second writable source ever
 *    existing in this stage (nothing writes these keys to
 *    core_setting_values yet).
 *  - user.experience.locale / user.experience.timezone: user
 *    presentation preferences (approved decision: user preferences
 *    are presentation/experience only, always subordinate to
 *    mandatory higher-level policy — `mandatory` stays false and
 *    layering is enforced by the C7-2 resolver contract).
 *  - display.locale / display.timezone (Stage C7-4): inheritable
 *    Organization → Workspace display defaults. These carry the
 *    scope-level defaults the C7-4 settings screens edit; a user's
 *    own preference stays `user.experience.*` and still outranks
 *    them at resolution time. Workspace overrides stay
 *    default-deny until the Organization allows them per key.
 *    No secret definitions are registered by Core: secrets exist
 *    only when a real consumer module registers its key.
 */
final class CoreSettingDefinitions
{
    /**
     * @return list<SettingDefinition>
     */
    public static function all(): array
    {
        return [
            new SettingDefinition(
                key: 'organization.public.description',
                title: 'Public organization description',
                type: SettingDefinition::TYPE_STRING,
                default: null,
                allowedScopes: [SettingDefinition::SCOPE_ORGANIZATION],
                description: 'Approved public description shown to invitees. Legacy source: organizations.settings.public.description (read by the C6 invitation presenter); canonical writes migrate in C7-2.',
                constraints: ['max_length' => 500, 'legacy_source' => 'organizations.settings.public.description'],
                nullable: true,
                sensitivity: SettingDefinition::SENSITIVITY_PUBLIC,
            ),
            new SettingDefinition(
                key: 'organization.public.logo_url',
                title: 'Public organization logo URL',
                type: SettingDefinition::TYPE_STRING,
                default: null,
                allowedScopes: [SettingDefinition::SCOPE_ORGANIZATION],
                description: 'Approved public logo URL shown to invitees. Legacy source: organizations.settings.public.logo_url (read by the C6 invitation presenter); canonical writes migrate in C7-2.',
                constraints: ['max_length' => 1024, 'format' => 'url', 'legacy_source' => 'organizations.settings.public.logo_url'],
                nullable: true,
                sensitivity: SettingDefinition::SENSITIVITY_PUBLIC,
            ),
            new SettingDefinition(
                key: 'display.locale',
                title: 'Default interface locale',
                type: SettingDefinition::TYPE_LOCALE,
                default: 'fa',
                allowedScopes: [SettingDefinition::SCOPE_ORGANIZATION, SettingDefinition::SCOPE_WORKSPACE],
                description: 'Default display locale inherited by Workspaces unless a Workspace override is allowed and set. Presentation only.',
                constraints: ['values' => ['fa', 'en']],
                inheritance: SettingDefinition::INHERITANCE_ORGANIZATION_TO_WORKSPACE,
                workspaceOverride: true,
            ),
            new SettingDefinition(
                key: 'display.timezone',
                title: 'Default display timezone',
                type: SettingDefinition::TYPE_TIMEZONE,
                default: 'Asia/Tehran',
                allowedScopes: [SettingDefinition::SCOPE_ORGANIZATION, SettingDefinition::SCOPE_WORKSPACE],
                description: 'Default display timezone inherited by Workspaces unless a Workspace override is allowed and set. Stored data remains UTC.',
                inheritance: SettingDefinition::INHERITANCE_ORGANIZATION_TO_WORKSPACE,
                workspaceOverride: true,
            ),
            new SettingDefinition(
                key: 'user.experience.locale',
                title: 'Interface locale',
                type: SettingDefinition::TYPE_LOCALE,
                default: 'fa',
                allowedScopes: [SettingDefinition::SCOPE_USER],
                description: 'Presentation-only interface locale preference. Never overrides mandatory higher-level policy.',
                constraints: ['values' => ['fa', 'en']],
                userOverride: true,
            ),
            new SettingDefinition(
                key: 'user.experience.timezone',
                title: 'Display timezone',
                type: SettingDefinition::TYPE_TIMEZONE,
                default: 'Asia/Tehran',
                allowedScopes: [SettingDefinition::SCOPE_USER],
                description: 'Presentation-only display timezone preference. Stored data remains UTC.',
                userOverride: true,
            ),
            // UX-02-3: per-user, per-list visible-column preferences
            // (JSON-encoded string; presentation only — visibility
            // never grants data access and the backend revalidates
            // every request regardless of what a client shows).
            // UX-02-4: muted in-app notification categories (JSON list;
            // ordinary categories only — system/security can never be
            // muted, enforced again at read time) and table density.
            // In-app preferences only: Bale delivery follows its own
            // OPS policy and is never altered by these keys.
            new SettingDefinition(
                key: 'user.experience.notification_mutes',
                title: 'Muted notification categories',
                type: SettingDefinition::TYPE_STRING,
                default: null,
                allowedScopes: [SettingDefinition::SCOPE_USER],
                description: 'Presentation/delivery preference for ordinary in-app notification categories (JSON string list). Never suppresses mandatory or security notifications; never changes Bale delivery.',
                constraints: ['max_length' => 500],
                nullable: true,
                userOverride: true,
            ),
            new SettingDefinition(
                key: 'user.experience.table_density',
                title: 'Table density',
                type: SettingDefinition::TYPE_STRING,
                default: null,
                allowedScopes: [SettingDefinition::SCOPE_USER],
                description: 'Presentation-only table density preference: normal or compact.',
                constraints: ['max_length' => 20],
                nullable: true,
                userOverride: true,
            ),
            new SettingDefinition(
                key: 'user.experience.list_columns',
                title: 'List column visibility',
                type: SettingDefinition::TYPE_STRING,
                default: null,
                allowedScopes: [SettingDefinition::SCOPE_USER],
                description: 'Presentation-only visible columns per workspace list (JSON string). Never affects authorization or returned data.',
                constraints: ['max_length' => 2000],
                nullable: true,
                userOverride: true,
            ),
        ];
    }
}
