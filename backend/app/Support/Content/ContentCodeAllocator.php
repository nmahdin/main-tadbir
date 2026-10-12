<?php

namespace App\Support\Content;

use App\Models\Content;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Allocates a stable, unique, immutable-ish content code.
 *
 * The allocation is a domain service, not a client decision: the caller must
 * already hold the content row lock inside a transaction. Collisions with a code
 * created by a concurrent request are retried with the next free sequence, and a
 * UNIQUE violation still surfaces as a 409 instead of silently overwriting.
 */
final class ContentCodeAllocator
{
    private const ATTEMPTS = 25;

    /**
     * @param  array<string, mixed>  $payload  the payload that will be persisted
     */
    public function allocateFor(Content $content, array $payload = []): string
    {
        return $this->allocateWithPrefix(ContentCodePolicy::prefixFor($content, $payload));
    }

    /** Deterministic read-only candidate used by multi-occurrence previews. */
    public function previewFor(Content $content, array $payload = [], int $offset = 0): string
    {
        $prefix = ContentCodePolicy::prefixFor($content, $payload);
        $padding = ContentCodePolicy::paddingFor($prefix);
        $sequence = (ContentCodePolicy::lastSequence($prefix) ?? 0) + 1 + max(0, $offset);

        return mb_substr($prefix.str_pad((string) $sequence, $padding, '0', STR_PAD_LEFT), 0, ContentCodePolicy::MAX_LENGTH);
    }

    /** Allocate from the organization-wide legacy fallback sequence. */
    public function allocateGeneral(): string
    {
        return $this->allocateWithPrefix(ContentCodePolicy::generalPrefix());
    }

    private function allocateWithPrefix(string $prefix): string
    {
        $padding = ContentCodePolicy::paddingFor($prefix);
        $last = ContentCodePolicy::lastSequence($prefix) ?? 0;

        for ($attempt = 0; $attempt < self::ATTEMPTS; $attempt++) {
            $candidate = $prefix.str_pad((string) ($last + 1 + $attempt), $padding, '0', STR_PAD_LEFT);
            if (mb_strlen($candidate) > ContentCodePolicy::MAX_LENGTH) {
                $candidate = mb_substr($candidate, 0, ContentCodePolicy::MAX_LENGTH);
            }
            if (! Content::query()->where('code', $candidate)->exists()) {
                return $candidate;
            }
        }

        // Practically unreachable; keeps the caller from ever inventing a code.
        return $prefix.Str::upper(Str::random(6));
    }

    /**
     * Resolve the code for a content that is being created or updated.
     * An explicit request is honoured when it is still free; otherwise the
     * server allocates the next code in the series.
     */
    public function resolve(Content $content, mixed $requested, array $payload = []): string
    {
        $normalized = ContentCodePolicy::normalize($requested);
        if ($normalized !== null && ! Content::query()->where('code', $normalized)->whereKeyNot($content->id)->exists()) {
            return $normalized;
        }

        return $this->allocateFor($content, $payload);
    }

    /**
     * Persist the resolved code. A concurrent request that claimed the same code
     * first turns into a UNIQUE violation, which is retried with the next free
     * sequence instead of surfacing as a 500.
     */
    public function assign(Content $content, mixed $requested, array $payload = []): string
    {
        $current = $content->code;
        if ($current !== null && $current !== '') {
            // Already coded: never re-issue, never overwrite.
            return (string) $current;
        }

        for ($attempt = 0; $attempt < self::ATTEMPTS; $attempt++) {
            $code = $this->resolve($content, $requested, $payload);
            try {
                $content->fill(['code' => $code])->save();

                return $code;
            } catch (QueryException $exception) {
                if (! $this->isUniqueViolation($exception)) {
                    throw $exception;
                }
                // The requested code is taken; fall back to the series sequence.
                $requested = null;
            }
        }

        abort(409, 'تولید کد یکتا برای این محتوا ممکن نشد؛ دوباره تلاش کنید.');
    }

    private function isUniqueViolation(QueryException $exception): bool
    {
        $sqlState = (string) $exception->getCode();

        return in_array($sqlState, ['23000', '23505'], true)
            || str_contains(strtolower($exception->getMessage()), 'unique');
    }

    /** Backfill helper for the `contents:allocate-codes` command. */
    public function backfillMissing(int $limit = 200): int
    {
        $done = 0;
        Content::query()->where(function ($query): void {
            $query->whereNull('code')->orWhere('code', '');
        })->orderBy('id')->limit($limit)->pluck('id')
            ->each(function ($id) use (&$done): void {
                DB::transaction(function () use ($id, &$done): void {
                    /** @var Content $content */
                    $content = Content::whereKey($id)->lockForUpdate()->first();
                    if (! $content || $content->code !== null && $content->code !== '') {
                        return;
                    }
                    $content->update(['code' => $this->allocateGeneral()]);
                    $done++;
                }, 3);
            });

        return $done;
    }
}
