<?php

namespace App\Core\Billing;

use JsonSerializable;
use Stringable;

/**
 * Immutable whole-Iranian-Toman value (C5-M2 §3.1).
 *
 * Whole-integer Toman only; never floats, never minor units. Every
 * arithmetic entry point is overflow-checked and refuses to go
 * outside signed 64-bit bounds, which PHP would otherwise silently
 * coerce to float. Negative money is not allowed on canonical
 * amounts (discounts are represented as separate non-negative
 * MoneyToman credits clamped by the caller).
 */
final class MoneyToman implements JsonSerializable, Stringable
{
    public const BASIS_POINTS_DENOMINATOR = 10_000;

    private function __construct(private readonly int $amountToman)
    {
    }

    public static function zero(): self
    {
        return new self(0);
    }

    public static function of(int $amountToman): self
    {
        if ($amountToman < 0) {
            throw new BillingArithmeticException('money_negative', 'Whole-Toman amounts must be non-negative.');
        }

        return new self($amountToman);
    }

    public function toInt(): int
    {
        return $this->amountToman;
    }

    public function isZero(): bool
    {
        return $this->amountToman === 0;
    }

    public function equals(self $other): bool
    {
        return $this->amountToman === $other->amountToman;
    }

    public function greaterThan(self $other): bool
    {
        return $this->amountToman > $other->amountToman;
    }

    public function add(self $other): self
    {
        $a = $this->amountToman;
        $b = $other instanceof self ? $other->amountToman : (int) $other;
        self::assertAdd($a, $b);

        return new self($a + $b);
    }

    /**
     * Subtraction that refuses to go negative (canonical money is
     * non-negative; callers that need a signed delta must use a
     * separate integer).
     */
    public function subtract(self $other): self
    {
        $a = $this->amountToman;
        $b = $other instanceof self ? $other->amountToman : (int) $other;

        if ($b > $a) {
            throw new BillingArithmeticException('money_underflow', 'Subtraction would yield a negative amount.');
        }

        return new self($a - $b);
    }

    /**
     * Basis-point percentage with round-half-up, exactly once per
     * line: pct(amount, bp) = intdiv(amount*bp + 5000, 10000).
     * Operand ranges are checked so the multiplication cannot
     * overflow a signed 64-bit integer.
     *
     * @param  int<0,10000>  $basisPoints
     */
    public function percentage(int $basisPoints): self
    {
        if ($basisPoints < 0 || $basisPoints > self::BASIS_POINTS_DENOMINATOR) {
            throw new BillingArithmeticException('rate_out_of_range', 'Basis-point rate must be in [0, 10000].');
        }

        if ($this->amountToman === 0 || $basisPoints === 0) {
            return self::zero();
        }

        $maxOperand = intdiv(PHP_INT_MAX - 5000, max($basisPoints, 1));
        if ($this->amountToman > $maxOperand) {
            throw new BillingArithmeticException('money_overflow', 'Percentage multiplication would overflow signed 64-bit bounds.');
        }

        return new self(intdiv($this->amountToman * $basisPoints + 5000, self::BASIS_POINTS_DENOMINATOR));
    }

    public function __toString(): string
    {
        return number_format($this->amountToman, 0, '.', ',');
    }

    public function jsonSerialize(): array
    {
        return ['amount_toman' => $this->amountToman, 'currency' => 'تومان'];
    }

    private static function assertAdd(int $a, int $b): void
    {
        if ($b < 0 || $a < 0) {
            throw new BillingArithmeticException('money_negative', 'Addition operands must be non-negative.');
        }

        if ($a > PHP_INT_MAX - $b) {
            throw new BillingArithmeticException('money_overflow', 'Addition would overflow signed 64-bit bounds.');
        }
    }
}
