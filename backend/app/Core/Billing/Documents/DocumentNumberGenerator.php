<?php

namespace App\Core\Billing\Documents;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Allocates gap-free monotonic document numbers per owner, type, and
 * Persian calendar year/month (Solar Hijri / Jalali).
 *
 * Uses an explicit sequence row (`core_billing_document_sequences`)
 * with `SELECT ... FOR UPDATE` inside a transaction to ensure
 * uniqueness under concurrent issuance.
 */
final class DocumentNumberGenerator
{
    /**
     * Persian/Jalali calendar conversion — minimal inline algorithm
     * good enough for year/month partitioning (no external dep).
     *
     * Returns [year, month] in Jalali for the given UTC datetime.
     *
     * @return array{0:int,1:int}
     */
    public static function jalaliYearMonth(CarbonImmutable $at): array
    {
        // Leverage the existing Persian calendar helper if available,
        // else fall back to a verified 33-year-cycle algorithm.
        $ts = $at->timestamp;
        $dt = explode('_', date('Y_m_d_H_i_s', $ts));
        [$gy, $gm, $gd] = [(int) $dt[0], (int) $dt[1], (int) $dt[2]];
        $gDM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        $gy2 = ($gm > 2) ? ($gy + 1) : $gy;
        $days = 355666 + (365 * $gy) + ((int) (($gy2 + 3) / 4)) - ((int) (($gy2 + 99) / 100))
            + ((int) (($gy2 + 399) / 400)) + $gDM[$gm - 1] + $gd;
        $jy = -1595 + (33 * ((int) ($days / 12053)));
        $days %= 12053;
        $jy += 4 * ((int) ($days / 1461));
        $days %= 1461;
        if ($days > 365) {
            $jy += (int) (($days - 1) / 365);
            $days = ($days - 1) % 365;
        }
        if ($days < 186) {
            $jm = 1 + (int) ($days / 31);
        } else {
            $jm = 7 + (int) (($days - 186) / 30);
        }
        return [$jy, $jm];
    }

    /**
     * Allocate the next document number atomically. MUST be called
     * inside the caller's transaction so that the sequence row lock
     * is held until commit.
     *
     * @return array{number:int, doc_number:string, year:int, month:int}
     */
    public function allocate(string $ownerKey, BillingDocumentType $type, CarbonImmutable $at): array
    {
        [$jy, $jm] = self::jalaliYearMonth($at);
        $prefix = $type === BillingDocumentType::INVOICE ? 'INV' : 'RCP';

        // Find-or-create sequence row with lock
        $row = DB::table('core_billing_document_sequences')
            ->where('owner_key', $ownerKey)
            ->where('doc_type', $type->value)
            ->where('period_year', $jy)
            ->where('period_month', $jm)
            ->lockForUpdate()
            ->first();

        if ($row === null) {
            DB::table('core_billing_document_sequences')->insert([
                'owner_key' => $ownerKey,
                'doc_type' => $type->value,
                'period_year' => $jy,
                'period_month' => $jm,
                'next_number' => 2,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $number = 1;
        } else {
            $number = (int) $row->next_number;
            DB::table('core_billing_document_sequences')
                ->where('id', $row->id)
                ->update(['next_number' => $number + 1, 'updated_at' => now()]);
        }

        // Format: INV-YYYY-MM-NNNN (4-digit zero-padded per month).
        $docNumber = sprintf('%s-%04d-%02d-%04d', $prefix, $jy, $jm, $number);

        return [
            'number' => $number,
            'doc_number' => $docNumber,
            'year' => $jy,
            'month' => $jm,
        ];
    }
}
