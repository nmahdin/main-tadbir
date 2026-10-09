<?php

namespace App\Support\Dam;

/** Canonical vocabulary for why one central asset is connected to a context. */
final class DamRelationRole
{
    public const INITIAL_INPUT = 'initial_input';
    public const REFERENCE = 'reference';
    public const ATTACHMENT = 'attachment';
    public const STAGE_INPUT = 'stage_input';
    public const STAGE_OUTPUT = 'stage_output';
    public const FINAL_OUTPUT = 'final_output';
    public const PUBLICATION_ASSET = 'publication_asset';

    public const ALL = [
        self::INITIAL_INPUT,
        self::REFERENCE,
        self::ATTACHMENT,
        self::STAGE_INPUT,
        self::STAGE_OUTPUT,
        self::FINAL_OUTPUT,
        self::PUBLICATION_ASSET,
    ];

    public static function normalize(mixed $value): string
    {
        $role = strtolower(trim((string) $value));

        return in_array($role, self::ALL, true) ? $role : self::ATTACHMENT;
    }

    public static function contextKey(?string $stageId, ?string $outputId, ?int $versionId): string
    {
        if (($stageId === null || $stageId === '') && ($outputId === null || $outputId === '') && $versionId === null) {
            return ''; // Matches migrated legacy relations exactly.
        }

        return hash('sha256', implode('|', [$stageId ?? '', $outputId ?? '', $versionId ?? '']));
    }
}
