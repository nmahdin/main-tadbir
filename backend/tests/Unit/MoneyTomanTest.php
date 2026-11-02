<?php

namespace Tests\Unit;

use App\Core\Billing\BillingArithmeticException;
use App\Core\Billing\MoneyToman;
use PHPUnit\Framework\TestCase;

/**
 * C5-M2-S1: integer-Toman arithmetic precision and overflow checks.
 */
class MoneyTomanTest extends TestCase
{
    public function test_zero_and_of_are_positive_non_floats(): void
    {
        $zero = MoneyToman::zero();
        $this->assertSame(0, $zero->toInt());
        $this->assertTrue($zero->isZero());
        $this->assertTrue(MoneyToman::of(0)->isZero());

        $m = MoneyToman::of(1_500_000);
        $this->assertSame(1_500_000, $m->toInt());
        $this->assertFalse($m->isZero());
    }

    public function test_negative_inputs_fail_closed(): void
    {
        $this->expectException(BillingArithmeticException::class);
        $this->expectExceptionMessage('non-negative');
        MoneyToman::of(-1);
    }

    public function test_add_and_subtract_integer_bounds(): void
    {
        $a = MoneyToman::of(1_500_000);
        $b = MoneyToman::of(150_000);
        $this->assertSame(1_650_000, $a->add($b)->toInt());
        $this->assertSame(1_350_000, $a->subtract($b)->toInt());
        // Subtraction refuses negatives.
        $threw = false;
        try {
            $b->subtract($a);
        } catch (BillingArithmeticException $e) {
            $threw = $e->errorCode === 'money_underflow';
        }
        $this->assertTrue($threw, 'Subtraction below zero must fail closed.');
    }

    public function test_percentage_round_half_up_exact_and_edge(): void
    {
        $price = MoneyToman::of(1_500_000);
        // -10% discount = 150,000.
        $this->assertSame(150_000, $price->percentage(1000)->toInt());
        // +9% tax over taxable 1,350,000 = 121,500.
        $this->assertSame(121_500, MoneyToman::of(1_350_000)->percentage(900)->toInt());
        // Half-up edge: 1005 * 10% = 100.5 -> 101.
        $this->assertSame(101, MoneyToman::of(1005)->percentage(1000)->toInt());
        // Zero and 0bp both yield zero.
        $this->assertSame(0, $price->percentage(0)->toInt());
        $this->assertSame(0, MoneyToman::zero()->percentage(900)->toInt());
    }

    public function test_rate_out_of_range_fails_closed(): void
    {
        $this->expectException(BillingArithmeticException::class);
        $this->expectExceptionMessage('[0, 10000]');
        MoneyToman::of(100)->percentage(10001);
    }

    public function test_addition_overflow_is_rejected(): void
    {
        $max = MoneyToman::of(\PHP_INT_MAX);
        $threw = false;
        try {
            $max->add(MoneyToman::of(1));
        } catch (BillingArithmeticException $e) {
            $threw = $e->errorCode === 'money_overflow';
        }
        $this->assertTrue($threw, 'Saturating arithmetic must reject 64-bit overflow.');
    }

    public function test_percentage_overflow_is_rejected(): void
    {
        // A value so large that amount*max_bp would exceed PHP_INT_MAX.
        $big = MoneyToman::of(\intdiv(\PHP_INT_MAX, 10_000) + 1);
        $threw = false;
        try {
            $big->percentage(10_000);
        } catch (BillingArithmeticException $e) {
            $threw = $e->errorCode === 'money_overflow';
        }
        $this->assertTrue($threw, 'Percentage must fail before float contamination.');
    }
}
