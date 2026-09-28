<?php

namespace App\Bot\Bale\Support;

final class PanelLinks
{
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

    public function assetUrl(int $taskId = 0, string $kind = 'file'): ?string
    {
        $base = $this->base();
        if (! $base || $taskId < 0 || ! in_array($kind, ['create', 'file', 'text', 'row', 'link'], true)) {
            return null;
        }

        return $taskId > 0 ? $base.'?task='.$taskId.'&asset='.$kind : ($kind === 'file' ? $base.'?dam_entry=file' : null);
    }

    public function buttons(?string $subject = null, ?int $id = null): array
    {
        $base = $this->base();

        // Keep task deep links, but never append a generic panel/login button.
        return $base && $subject === 'task' && $id > 0
            ? [[['text' => 'مشاهدهٔ همین تسک در سامانه', 'url' => $base.'?task='.$id]]]
            : [];
    }
}
