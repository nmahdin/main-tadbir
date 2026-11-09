<?php

namespace App\Core\Billing\Documents;

/**
 * C5-M5 financial document types.
 */
enum BillingDocumentType: string
{
    case INVOICE = 'invoice';
    case RECEIPT = 'receipt';
}
