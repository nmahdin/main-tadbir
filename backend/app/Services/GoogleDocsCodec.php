<?php

namespace App\Services;

use App\Support\Dam\DamRichText;
use DOMDocument;
use DOMElement;
use DOMNode;

/** Converts the supported DAM rich-text subset to and from Google Docs. */
final class GoogleDocsCodec
{
    /** @return array{text:string,formatRequests:list<array<string, mixed>>} */
    public function encode(string $html): array
    {
        $html = DamRichText::sanitize($html);
        if (! class_exists(DOMDocument::class)) {
            return ['text' => DamRichText::plainText($html), 'formatRequests' => []];
        }

        $document = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $loaded = $document->loadHTML(
            '<?xml encoding="utf-8" ?><div id="tadbir-root">'.$html.'</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD,
        );
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        if (! $loaded) {
            return ['text' => DamRichText::plainText($html), 'formatRequests' => []];
        }

        $root = $document->getElementById('tadbir-root') ?: $document->getElementsByTagName('div')->item(0);
        if (! $root instanceof DOMElement) {
            return ['text' => DamRichText::plainText($html), 'formatRequests' => []];
        }

        $state = ['text' => '', 'styles' => [], 'paragraphs' => []];
        foreach (iterator_to_array($root->childNodes) as $child) {
            $this->walk($child, [], $state);
        }
        $text = rtrim((string) $state['text']);
        if ($text === '') {
            return ['text' => '', 'formatRequests' => []];
        }

        $requests = [];
        $textLength = $this->utf16Length($text);
        foreach ($state['styles'] as $span) {
            $end = min($textLength, $span['end']);
            if ($end <= $span['start']) {
                continue;
            }
            $requests[] = [
                'updateTextStyle' => [
                    'range' => ['startIndex' => 1 + $span['start'], 'endIndex' => 1 + $end],
                    'textStyle' => $span['style'],
                    'fields' => implode(',', array_keys($span['style'])),
                ],
            ];
        }
        foreach ($state['paragraphs'] as $paragraph) {
            $end = min($this->utf16Length($text) + 1, 1 + $paragraph['end']);
            if ($end <= 1 + $paragraph['start']) {
                continue;
            }
            if ($paragraph['namedStyle'] !== null) {
                $requests[] = [
                    'updateParagraphStyle' => [
                        'range' => ['startIndex' => 1 + $paragraph['start'], 'endIndex' => $end],
                        'paragraphStyle' => ['namedStyleType' => $paragraph['namedStyle']],
                        'fields' => 'namedStyleType',
                    ],
                ];
            }
            if ($paragraph['bullet']) {
                $requests[] = [
                    'createParagraphBullets' => [
                        'range' => ['startIndex' => 1 + $paragraph['start'], 'endIndex' => $end],
                        'bulletPreset' => $paragraph['ordered'] ? 'NUMBERED_DECIMAL_NESTED' : 'BULLET_DISC_CIRCLE_SQUARE',
                    ],
                ];
            }
        }

        return ['text' => $text, 'formatRequests' => $requests];
    }

    /** @param array<string, mixed> $document */
    public function decode(array $document): string
    {
        $html = $this->structuralElementsToHtml($document['body']['content'] ?? []);
        $html = DamRichText::sanitize($html);

        return DamRichText::plainText($html) === '' ? '' : $html;
    }

    /** @param array<string, mixed> $style @param array<string, mixed> $state */
    private function walk(DOMNode $node, array $style, array &$state): void
    {
        if ($node->nodeType === XML_TEXT_NODE) {
            $text = (string) $node->nodeValue;
            if ($text === '') {
                return;
            }
            $start = $this->utf16Length($state['text']);
            $state['text'] .= $text;
            $end = $this->utf16Length($state['text']);
            if ($style !== []) {
                $state['styles'][] = ['start' => $start, 'end' => $end, 'style' => $style];
            }

            return;
        }
        if (! $node instanceof DOMElement) {
            return;
        }

        $tag = strtolower($node->tagName);
        if ($tag === 'br') {
            $state['text'] .= "\n";

            return;
        }
        $nextStyle = $style;
        if (in_array($tag, ['strong', 'b'], true)) {
            $nextStyle['bold'] = true;
        }
        if (in_array($tag, ['em', 'i'], true)) {
            $nextStyle['italic'] = true;
        }
        if ($tag === 'u') {
            $nextStyle['underline'] = true;
        }
        if ($tag === 's') {
            $nextStyle['strikethrough'] = true;
        }
        if ($tag === 'a' && trim($node->getAttribute('href')) !== '') {
            $nextStyle['link'] = ['url' => trim($node->getAttribute('href'))];
        }

        $isBlock = in_array($tag, ['p', 'div', 'h1', 'h2', 'h3', 'blockquote', 'li'], true);
        $start = $this->utf16Length($state['text']);
        foreach (iterator_to_array($node->childNodes) as $child) {
            $this->walk($child, $nextStyle, $state);
        }
        if ($isBlock) {
            if (! str_ends_with($state['text'], "\n")) {
                $state['text'] .= "\n";
            }
            $state['paragraphs'][] = [
                'start' => $start,
                'end' => $this->utf16Length($state['text']),
                'namedStyle' => match ($tag) {
                    'h1' => 'HEADING_1',
                    'h2' => 'HEADING_2',
                    'h3' => 'HEADING_3',
                    default => null,
                },
                'bullet' => $tag === 'li',
                'ordered' => $tag === 'li' && strtolower((string) $node->parentNode?->nodeName) === 'ol',
            ];
        }
    }

    /** @param list<array<string, mixed>> $elements */
    private function structuralElementsToHtml(array $elements): string
    {
        $html = '';
        foreach ($elements as $element) {
            if (isset($element['paragraph']) && is_array($element['paragraph'])) {
                $html .= $this->paragraphToHtml($element['paragraph']);
                continue;
            }
            if (isset($element['table']['tableRows']) && is_array($element['table']['tableRows'])) {
                foreach ($element['table']['tableRows'] as $row) {
                    foreach ($row['tableCells'] ?? [] as $cell) {
                        $html .= $this->structuralElementsToHtml($cell['content'] ?? []);
                    }
                }
                continue;
            }
            if (isset($element['tableOfContents']['content'])) {
                $html .= $this->structuralElementsToHtml($element['tableOfContents']['content']);
            }
        }

        return $html;
    }

    /** @param array<string, mixed> $paragraph */
    private function paragraphToHtml(array $paragraph): string
    {
        $content = '';
        foreach ($paragraph['elements'] ?? [] as $element) {
            $run = $element['textRun'] ?? null;
            if (! is_array($run)) {
                continue;
            }
            $text = rtrim((string) ($run['content'] ?? ''), "\n");
            if ($text === '') {
                continue;
            }
            $value = nl2br(htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8'), false);
            $style = is_array($run['textStyle'] ?? null) ? $run['textStyle'] : [];
            if (! empty($style['bold'])) {
                $value = '<strong>'.$value.'</strong>';
            }
            if (! empty($style['italic'])) {
                $value = '<em>'.$value.'</em>';
            }
            if (! empty($style['underline'])) {
                $value = '<u>'.$value.'</u>';
            }
            if (! empty($style['strikethrough'])) {
                $value = '<s>'.$value.'</s>';
            }
            $url = trim((string) ($style['link']['url'] ?? ''));
            if ($url !== '') {
                $value = '<a href="'.htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8').'">'.$value.'</a>';
            }
            $content .= $value;
        }
        $content = $content !== '' ? $content : '<br>';
        if (isset($paragraph['bullet'])) {
            return '<ul><li>'.$content.'</li></ul>';
        }

        $tag = match ($paragraph['paragraphStyle']['namedStyleType'] ?? null) {
            'TITLE', 'HEADING_1' => 'h1',
            'SUBTITLE', 'HEADING_2' => 'h2',
            'HEADING_3', 'HEADING_4', 'HEADING_5', 'HEADING_6' => 'h3',
            default => 'p',
        };

        return "<{$tag}>{$content}</{$tag}>";
    }

    private function utf16Length(string $value): int
    {
        if ($value === '') {
            return 0;
        }

        return (int) (strlen(mb_convert_encoding($value, 'UTF-16LE', 'UTF-8')) / 2);
    }
}
