<?php

namespace App\Bot\Bale\Support;

use App\Models\BaleUserLink;
use App\Services\BalePanelSession;

final class PanelLinks
{
    private const MARKER = '_panel_link';

    private function base(): ?string
    {
        $base = trim((string) config('bale.panel_url'));
        $parts = parse_url($base);
        if (! filter_var($base, FILTER_VALIDATE_URL) || ! is_array($parts) || ($parts['scheme'] ?? '') !== 'https'
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            return null;
        }

        return rtrim($base, '/').'/';
    }

    public function panelButtons(BaleUserLink $link): array
    {
        if (! $this->base()) {
            return [];
        }

        return [
            [$this->placeholder('🚀 ورود مستقیم به پنل', 'mini_app', 'panel')],
            [$this->placeholder('🌐 باز کردن پنل در مرورگر', 'browser', 'panel')],
        ];
    }

    public function assetButtons(BaleUserLink $link, int $taskId = 0, string $kind = 'file'): array
    {
        if (! $this->base() || $taskId < 0 || ! in_array($kind, ['create', 'file', 'text', 'row', 'link'], true)) {
            return [];
        }
        $target = $taskId > 0 ? 'asset:'.$taskId.':'.$kind : ($kind === 'file' ? 'asset-file' : null);
        if (! $target) {
            return [];
        }

        return [
            [$this->placeholder('📎 باز کردن فرم ثبت فایل', 'mini_app', $target)],
            [$this->placeholder('🌐 باز کردن فرم در مرورگر', 'browser', $target)],
        ];
    }

    public function buttons(?BaleUserLink $link, ?string $subject = null, ?int $id = null): array
    {
        if (! $link || ! $this->base() || $subject !== 'task' || ! $id || $id < 1) {
            return [];
        }

        return [
            [$this->placeholder('مشاهدهٔ همین تسک در سامانه', 'mini_app', 'task:'.$id)],
            [$this->placeholder('باز کردن همین تسک در مرورگر', 'browser', 'task:'.$id)],
        ];
    }

    /** Replace internal link intents immediately before the provider request. */
    public function materialize(array $payload, ?BaleUserLink $link): array
    {
        $rows = $payload['reply_markup']['inline_keyboard'] ?? null;
        if (! is_array($rows)) {
            return $payload;
        }
        $token = null;
        $materialized = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $buttons = [];
            foreach ($row as $button) {
                if (! is_array($button)) {
                    continue;
                }
                if (! isset($button[self::MARKER])) {
                    $buttons[] = $button;
                    continue;
                }
                $marker = $button[self::MARKER];
                $query = is_array($marker) ? $this->query((string) ($marker['target'] ?? '')) : null;
                $mode = is_array($marker) ? ($marker['mode'] ?? null) : null;
                if (! $link || $query === false || ! in_array($mode, ['mini_app', 'browser'], true)) {
                    continue;
                }
                $token ??= app(BalePanelSession::class)->issue($link);
                if (! $token || ! ($url = $this->url($token, $query))) {
                    continue;
                }
                unset($button[self::MARKER]);
                if ($mode === 'mini_app') {
                    $button['web_app'] = ['url' => $url];
                } else {
                    $button['url'] = $url;
                }
                $buttons[] = $button;
            }
            if ($buttons !== []) {
                $materialized[] = $buttons;
            }
        }
        if ($materialized === []) {
            unset($payload['reply_markup']);
        } else {
            $payload['reply_markup']['inline_keyboard'] = $materialized;
        }

        return $payload;
    }

    private function placeholder(string $text, string $mode, string $target): array
    {
        return ['text' => $text, self::MARKER => ['mode' => $mode, 'target' => $target]];
    }

    /** A false value means an invalid target; an empty string is the valid panel root. */
    private function query(string $target): string|false
    {
        if ($target === 'panel') {
            return '';
        }
        if ($target === 'asset-file') {
            return '?dam_entry=file';
        }
        if (preg_match('/^task:([1-9][0-9]{0,17})$/D', $target, $match)) {
            return '?task='.$match[1];
        }
        if (preg_match('/^asset:([1-9][0-9]{0,17}):(create|file|text|row|link)$/D', $target, $match)) {
            return '?task='.$match[1].'&asset='.$match[2];
        }

        return false;
    }

    private function url(string $token, string $query): ?string
    {
        $base = $this->base();

        return $base ? $base.$query.'#bale-login='.$token : null;
    }
}
