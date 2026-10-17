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
        ];
    }
}
