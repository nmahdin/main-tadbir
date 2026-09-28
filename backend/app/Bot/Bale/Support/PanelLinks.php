<?php

namespace App\Bot\Bale\Support;

final class PanelLinks
{
    public function assetUrl(int $taskId, string $kind = 'create'): ?string
    {
        $buttons = $this->buttons('task', $taskId);
        if (! $buttons || ! isset($buttons[0][0]['url']) || $taskId < 1 || ! in_array($kind, ['create', 'file', 'text', 'row', 'link'], true)) {
            return null;
        }

        return $buttons[0][0]['url'].'&asset='.$kind;
    }

    public function buttons(?string $subject = null, ?int $id = null): array
    {
        $base = trim((string) config('bale.panel_url'));
        $parts = parse_url($base);
        if (! filter_var($base, FILTER_VALIDATE_URL) || ! is_array($parts) || ($parts['scheme'] ?? '') !== 'https'
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            return [];
        }
        $base = rtrim($base, '/').'/';
        $rows = [];
        if ($subject === 'task' && $id !== null && $id > 0) {
            $rows[] = [['text' => 'مشاهدهٔ همین تسک در سامانه', 'url' => $base.'?task='.$id]];
        }
        $rows[] = [['text' => 'ورود به پنل تدبیر', 'url' => $base]];

        return $rows;
    }
}
