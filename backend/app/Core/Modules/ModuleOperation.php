<?php

namespace App\Core\Modules;

/**
 * Operation classes for module operational access (Stage C5-3).
 * Safety is classified by the OPERATION, never by HTTP method: a
 * POST that only reads is Read; anything that creates, updates,
 * deletes, changes state, executes work, or causes side effects
 * is Write or Execute. Expired subscriptions (ReadOnly level) may
 * perform Read only.
 */
enum ModuleOperation: string
{
    case Read = 'read';
    case Write = 'write';
    case Execute = 'execute';

    public function isSafeRead(): bool
    {
        return $this === self::Read;
    }
}
