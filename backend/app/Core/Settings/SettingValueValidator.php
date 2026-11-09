<?php

namespace App\Core\Settings;

use DateTimeZone;

/**
 * Deterministic type validation + normalization for setting
 * values (Stage C7-1). Only the declared types exist; every value
 * is checked strictly (no loose coercion: "1" is not an integer,
 * 1 is not a boolean), normalized (strings trimmed), and encoded
 * deterministically by the store.
 *
 * Setting values must never carry resource identifiers, secrets,
 * permission grants, or executable class names — types are scalar
 * presentation/configuration data only, and secret-sensitivity
 * definitions are refused by the store before validation.
 */
final class SettingValueValidator
{
    /**
     * @return mixed The normalized value.
     *
     * @throws SettingValidationException
     */
    public static function validate(SettingDefinition $definition, mixed $value): mixed
    {
        if ($value === null) {
            if (! $definition->nullable) {
                throw new SettingValidationException('setting_not_nullable', "Setting [{$definition->key}] does not accept a null value.");
            }

            return null;
        }

        return match ($definition->type) {
            SettingDefinition::TYPE_STRING => self::string($definition, $value),
            SettingDefinition::TYPE_BOOLEAN => self::boolean($definition, $value),
            SettingDefinition::TYPE_INTEGER => self::integer($definition, $value),
            SettingDefinition::TYPE_ENUM => self::enum($definition, $value),
            SettingDefinition::TYPE_TIMEZONE => self::timezone($definition, $value),
            SettingDefinition::TYPE_LOCALE => self::locale($definition, $value),
            SettingDefinition::TYPE_JSON => self::json($definition, $value),
            default => throw new SettingValidationException('setting_value_type_mismatch', "Setting [{$definition->key}] has an unsupported type."),
        };
    }

    private static function string(SettingDefinition $definition, mixed $value): string
    {
        if (! is_string($value)) {
            throw new SettingValidationException('setting_value_type_mismatch', "Setting [{$definition->key}] expects a string.");
        }

        $value = trim($value);
        $max = $definition->constraints['max_length'] ?? null;
        if ($max !== null && mb_strlen($value) > (int) $max) {
            throw new SettingValidationException('setting_value_too_long', "Setting [{$definition->key}] exceeds its maximum length.");
        }

        if (($definition->constraints['format'] ?? null) === 'url'
            && filter_var($value, FILTER_VALIDATE_URL) === false) {
            throw new SettingValidationException('setting_value_invalid', "Setting [{$definition->key}] expects a valid URL.");
        }

        return $value;
    }

    private static function boolean(SettingDefinition $definition, mixed $value): bool
    {
        if (! is_bool($value)) {
            throw new SettingValidationException('setting_value_type_mismatch', "Setting [{$definition->key}] expects a boolean.");
        }

        return $value;
    }

    private static function integer(SettingDefinition $definition, mixed $value): int
    {
        if (! is_int($value)) {
            throw new SettingValidationException('setting_value_type_mismatch', "Setting [{$definition->key}] expects an integer.");
        }

        $min = $definition->constraints['min'] ?? null;
        $max = $definition->constraints['max'] ?? null;
        if (($min !== null && $value < (int) $min) || ($max !== null && $value > (int) $max)) {
            throw new SettingValidationException('setting_value_out_of_range', "Setting [{$definition->key}] is outside its allowed range.");
        }

        return $value;
    }

    private static function enum(SettingDefinition $definition, mixed $value): string
    {
        if (! is_string($value) || ! in_array($value, $definition->constraints['values'] ?? [], true)) {
            throw new SettingValidationException('setting_enum_invalid', "Setting [{$definition->key}] must be one of its declared values.");
        }

        return $value;
    }

    private static function timezone(SettingDefinition $definition, mixed $value): string
    {
        if (! is_string($value) || ! in_array($value, DateTimeZone::listIdentifiers(), true)) {
            throw new SettingValidationException('setting_timezone_invalid', "Setting [{$definition->key}] must be a valid IANA timezone.");
        }

        return $value;
    }

    private static function locale(SettingDefinition $definition, mixed $value): string
    {
        if (! is_string($value) || ! preg_match('/^[a-z]{2,3}(-[A-Z]{2})?$/', $value)) {
            throw new SettingValidationException('setting_locale_invalid', "Setting [{$definition->key}] must be a locale like 'fa' or 'en-US'.");
        }

        $allowed = $definition->constraints['values'] ?? null;
        if ($allowed !== null && ! in_array($value, $allowed, true)) {
            throw new SettingValidationException('setting_locale_invalid', "Setting [{$definition->key}] must be one of its declared locales.");
        }

        return $value;
    }

    /**
     * @return array<string, mixed>
     */
    private static function json(SettingDefinition $definition, mixed $value): array
    {
        if (! is_array($value)) {
            throw new SettingValidationException('setting_json_schema_invalid', "Setting [{$definition->key}] expects an object matching its declared schema.");
        }

        /** @var array<string, string> $schema */
        $schema = $definition->constraints['schema'] ?? [];
        foreach ($value as $field => $fieldValue) {
            if (! array_key_exists($field, $schema)) {
                throw new SettingValidationException('setting_json_schema_invalid', "Setting [{$definition->key}] does not declare field [{$field}].");
            }
            $expected = $schema[$field];
            $ok = match ($expected) {
                'string' => is_string($fieldValue),
                'boolean' => is_bool($fieldValue),
                'integer' => is_int($fieldValue),
                'number' => is_int($fieldValue) || is_float($fieldValue),
                default => false,
            };
            if (! $ok) {
                throw new SettingValidationException('setting_json_schema_invalid', "Setting [{$definition->key}] field [{$field}] must be of type {$expected}.");
            }
        }

        // Deterministic key order for stable encoding/comparison.
        ksort($value);

        return $value;
    }
}
