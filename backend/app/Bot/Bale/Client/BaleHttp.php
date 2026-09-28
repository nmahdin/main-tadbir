<?php

namespace App\Bot\Bale\Client;

use Illuminate\Http\Client\Factory;

/** No request events/global middleware: Bale puts its secret in the URL. */
final class BaleHttp extends Factory
{
    public function __construct()
    {
        parent::__construct();
    }
}
