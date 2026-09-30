<?php

use App\Http\Controllers\SystemStatusController;
use Illuminate\Support\Facades\Route;

Route::get('/', SystemStatusController::class)->name('system.status');
