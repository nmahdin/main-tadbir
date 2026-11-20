<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Operations\Health\HealthService;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class PlatformHealthController extends Controller
{
    use AuthorizesPlatformRequests;

    public function __construct(private readonly HealthService $health) {}

    public function details(Request $request): JsonResponse
    {
        $this->platformActor($request, 'platform.health.view');

        return response()->json(['data' => $this->health->details()]);
    }
}
