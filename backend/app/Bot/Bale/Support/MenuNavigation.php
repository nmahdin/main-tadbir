<?php

namespace App\Bot\Bale\Support;

use App\Models\BaleConversation;
use App\Models\BaleUserLink;

final class MenuNavigation
{
    public static function drafting(?BaleConversation $session): bool
    {
        return $session && in_array($session->step, ['unlink', 'report_text', 'report_confirm', 'status_select', 'status_confirm', 'edit_value', 'edit_confirm', 'asset_field', 'asset_confirm', 'text_asset_title', 'text_asset_body', 'text_asset_confirm'], true);
    }

    public static function rows(?BaleUserLink $link, bool $home = false): array
    {
        if (! $link || $home) {
            return [];
        }
        $buttons = [['text' => 'بازگشت به منو', 'callback_data' => 'home']];
        if (self::drafting(BaleConversation::where('link_id', $link->id)->first())) {
            $buttons[] = ['text' => 'لغو', 'callback_data' => 'cancel'];
        }

        return [$buttons];
    }
}
