<?php

namespace App\Bot\Bale\Support;

final class MessageText
{
    public static function plain(string $text, int $max = 3000): string
    {
        return mb_substr(str_replace(['[', ']', '(', ')', '*', '_', '`'], ['［', '］', '（', '）', '＊', '＿', 'ˋ'], $text), 0, $max);
    }
}
