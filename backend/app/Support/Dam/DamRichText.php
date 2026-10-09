<?php

namespace App\Support\Dam;

/**
 * Small allow-list sanitizer for DAM text assets.
 *
 * Rich notes intentionally support a limited Word-like subset while scripts,
 * event handlers, embedded content and arbitrary CSS never reach storage.
 */
final class DamRichText
{
    private const ALLOWED_TAGS = '<p><div><br><h1><h2><h3><blockquote><strong><b><em><i><u><s><ul><ol><li><a><span>';

    public static function sanitize(?string $html): string
    {
        $html = (string) ($html ?? '');
        if ($html === '') {
            return '';
        }

        $html = preg_replace('/<!--.*?-->/s', '', $html) ?? '';
        $html = preg_replace('/<(script|style|iframe|object|embed|svg|math|form)\b[^>]*>.*?<\/\1\s*>/is', '', $html) ?? '';
        $html = preg_replace('/<(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select)\b[^>]*\/?>/is', '', $html) ?? '';
        $html = strip_tags($html, self::ALLOWED_TAGS);

        return trim((string) preg_replace_callback('/<\/?([a-z0-9]+)([^>]*)>/i', function (array $match): string {
            $closing = str_starts_with($match[0], '</');
            $tag = strtolower($match[1]);
            if ($closing) {
                return "</{$tag}>";
            }
            if ($tag === 'br') {
                return '<br>';
            }

            $attributes = $match[2] ?? '';
            $safeAttributes = [];
            if ($tag === 'a' && preg_match('/\bhref\s*=\s*(["\x27])(.*?)\1/is', $attributes, $href)) {
                $url = self::safeUrl(html_entity_decode($href[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                if ($url !== null) {
                    $safeAttributes[] = 'href="'.htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8').'"';
                    $safeAttributes[] = 'target="_blank"';
                    $safeAttributes[] = 'rel="noopener noreferrer"';
                }
            }
            if (preg_match('/\bstyle\s*=\s*(["\x27])(.*?)\1/is', $attributes, $style)) {
                $safeStyle = self::safeStyle(html_entity_decode($style[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                if ($safeStyle !== '') {
                    $safeAttributes[] = 'style="'.htmlspecialchars($safeStyle, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8').'"';
                }
            }

            return '<'.$tag.($safeAttributes ? ' '.implode(' ', $safeAttributes) : '').'>';
        }, $html));
    }

    public static function plainText(?string $html): string
    {
        $html = self::sanitize($html);
        $html = preg_replace('/<br\s*\/?>/i', "\n", $html) ?? $html;
        $html = preg_replace('/<\/(p|div|h1|h2|h3|blockquote|li)>/i', "\n", $html) ?? $html;
        $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace("/[\t ]+\n/u", "\n", $text) ?? $text;
        $text = preg_replace("/\n{3,}/u", "\n\n", $text) ?? $text;

        return trim($text);
    }

    private static function safeUrl(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        if (preg_match('/^(https?:|mailto:|tel:)/i', $value) === 1) {
            return $value;
        }
        if (preg_match('/^[\w.-]+\.[a-z]{2,}(?:[\/?#].*)?$/i', $value) === 1) {
            return 'https://'.$value;
        }

        return null;
    }

    private static function safeStyle(string $style): string
    {
        $safe = [];
        foreach (explode(';', $style) as $declaration) {
            if (! str_contains($declaration, ':')) {
                continue;
            }
            [$property, $value] = array_map('trim', explode(':', $declaration, 2));
            $property = strtolower($property);
            if (in_array($property, ['color', 'background-color'], true)
                && preg_match('/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i', $value) === 1) {
                $safe[] = $property.': '.$value;
            } elseif ($property === 'text-align' && preg_match('/^(right|left|center|justify)$/i', $value) === 1) {
                $safe[] = $property.': '.strtolower($value);
            } elseif ($property === 'font-size'
                && preg_match('/^(?:[8-9]|[1-6]\d|7[0-2])(?:px|pt)$|^(?:0\.\d+|[1-3](?:\.\d+)?)rem$|^(?:small|medium|large|x-large|xx-large)$/i', $value) === 1) {
                $safe[] = $property.': '.strtolower($value);
            } elseif ($property === 'font-family') {
                $family = trim(explode(',', str_replace(['"', "'"], '', $value))[0]);
                if (in_array($family, ['Vazirmatn', 'Tahoma', 'Arial'], true)) {
                    $safe[] = $property.': '.$family;
                }
            }
        }

        return implode('; ', $safe);
    }
}
