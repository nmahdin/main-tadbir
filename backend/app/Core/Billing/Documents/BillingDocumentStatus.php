<?php

namespace App\Core\Billing\Documents;

enum BillingDocumentStatus: string
{
    case DRAFT = 'draft';
    case ISSUED = 'issued';
    case VOID = 'void';
}
