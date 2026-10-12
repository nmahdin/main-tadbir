<?php

namespace App\Support\Content;

use App\Models\Content;
use App\Models\SystemSetting;

/**
 * Stable content codes such as KM141 / RV130 / SA03.
 *
 * The prefix/sequence policy is configuration, never a hardcoded list of
 * organisation-specific prefixes. Resolution order:
 *
 *   1. an explicit `seriesCode` on the content (a shared series/collection),
 *   2. a configured policy row matching the content type or the series id,
 *   3. a prefix derived from the content type id.
 *
 * The sequence is "highest existing numeric suffix for that prefix + 1", which
 * keeps codes stable and readable without a separate counter table.
 */
final class ContentCodePolicy
{
    public const MAX_LENGTH = 40;

    public const SETTING_KEY = 'content_code_policies';

    /** Normalize a requested code; returns null when the shape is not acceptable. */
    public static function normalize(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        // Internal whitespace is a typing artefact, not a different code.
        $code = strtoupper(trim((string) preg_replace('/\s+/', '', (string) $value)));
        if ($code === '' || mb_strlen($code) > self::MAX_LENGTH) {
            return null;
        }
        if (preg_match('/^[A-Z0-9][A-Z0-9._-]*$/', $code) !== 1) {
            return null;
        }

        return $code;
    }

    public static function isValid(mixed $value): bool
    {
        return self::normalize($value) !== null;
    }

    /**
     * Prefix for a content, before the sequence number is appended.
     *
     * @param  array<string, mixed>  $payload  payload that will be persisted, when
     *                                         the code is resolved before the save
     */
    public static function prefixFor(Content $content, array $payload = []): string
    {
        $payload = $payload !== [] ? $payload : ($content->payload ?? []);

        $series = self::normalize($payload['seriesCode'] ?? null);
        if ($series !== null) {
            // A Series prefix is an explicit operator choice, not a phrase that
            // should be abbreviated again. It therefore appears verbatim in the
            // generated Content code (for example EDITORIAL001).
            return $series;
        }

        foreach (self::policies() as $policy) {
            $scope = (string) ($policy['scope'] ?? '');
            $match = (string) ($policy['matchId'] ?? $policy['id'] ?? '');
            if ($match === '' || $match === '0') {
                continue;
            }
            $candidate = match ($scope) {
                'content_type' => (string) $content->type,
                'series' => (string) ($payload['seriesId'] ?? ''),
                default => '',
            };
            if ($candidate !== '' && $candidate === $match) {
                return self::prefix((string) ($policy['prefix'] ?? ''));
            }
        }

        return self::prefix((string) $content->type);
    }

    /** @return list<array<string, mixed>> */
    public static function policies(): array
    {
        $setting = SystemSetting::query()->where('key', self::SETTING_KEY)->first();
        $rows = $setting?->value;

        return is_array($rows) ? array_values(array_filter($rows, 'is_array')) : [];
    }

    /** Prefix used only when backfilling legacy Contents that never received a code. */
    public static function generalPrefix(): string
    {
        foreach (self::policies() as $policy) {
            if (($policy['scope'] ?? null) !== 'general') {
                continue;
            }
            $configured = self::normalize($policy['prefix'] ?? null);
            if ($configured !== null) {
                return $configured;
            }
        }

        return self::prefix('content');
    }

    public static function paddingFor(string $prefix): int
    {
        foreach (self::policies() as $policy) {
            $configured = self::normalize($policy['prefix'] ?? null);
            if (($configured !== null && $configured === $prefix)
                || self::prefix((string) ($policy['prefix'] ?? '')) === $prefix) {
                return max(2, min(8, (int) ($policy['padding'] ?? 3)));
            }
        }

        return 3;
    }

    /**
     * Turn any configured/derived value into a code-safe prefix.
     *
     * The rule is generic and contains no organisation-specific vocabulary:
     * the initial letter of each word ("knowledge management" -> "KM",
     * "conference report" -> "CR"), padded from the first word when a single
     * word yields only one letter ("article" -> "AR"). Anything an
     * administrator wants instead is configured through the policy setting.
     */
    public static function prefix(mixed $value): string
    {
        $raw = is_string($value) ? strtoupper(trim($value)) : '';
        $words = preg_split('/[^A-Z0-9]+/', $raw, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $first = $words[0] ?? '';
        $letters = $first[0] ?? '';
        foreach (array_slice($words, 1, 2) as $word) {
            $letters .= $word[0];
        }
        while (mb_strlen($letters) < 2 && mb_strlen($letters) < mb_strlen($first)) {
            $letters .= $first[mb_strlen($letters)];
        }
        if ($letters === '') {
            // Deterministic fallback so a content always gets a code.
            $letters = 'C'.substr(strtoupper(base_convert(substr(md5($raw.'x'), 0, 8), 16, 36)), 0, 2);
        }

        return mb_substr($letters, 0, 6);
    }

    /** Highest numeric suffix already used for this prefix, or null. */
    public static function lastSequence(string $prefix): ?int
    {
        $highest = null;
        $like = $prefix.'%';
        $rows = Content::query()->whereNotNull('code')->where('code', 'like', $like)
            ->pluck('code');
        foreach ($rows as $code) {
            if (! is_string($code)) {
                continue;
            }
            $suffix = substr($code, strlen($prefix));
            if ($suffix !== '' && ctype_digit($suffix)) {
                $highest = max($highest ?? 0, (int) $suffix);
            }
        }

        return $highest;
    }
}
