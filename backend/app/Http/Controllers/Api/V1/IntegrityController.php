<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\IntegrityDiagnostics;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Validation\Rule;

class IntegrityController extends Controller
{
    public function index(Request $request, IntegrityDiagnostics $diagnostics)
    {
        abort_unless($request->user()?->isActive() && $request->user()->hasPermission('integrity.view'), 403);
        $data = $request->validate(['severity' => ['sometimes', Rule::in(['critical', 'warning', 'info'])],
            'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'between:1,100']]);
        $all = collect($diagnostics->findings());
        $summary = ['critical' => $all->where('severity', 'critical')->count(),
            'warning' => $all->where('severity', 'warning')->count(), 'info' => $all->where('severity', 'info')->count()];
        if (! empty($data['severity'])) $all = $all->where('severity', $data['severity'])->values();
        $page = $data['page'] ?? 1; $size = $data['per_page'] ?? 25;
        $paginator = new LengthAwarePaginator($all->forPage($page, $size)->values(), $all->count(), $size, $page,
            ['path' => $request->url(), 'query' => $request->query()]);
        return response()->json(['data' => $paginator->items(), 'meta' => [
            'current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(), 'total' => $paginator->total(), 'summary' => $summary,
            'readOnly' => true,
        ]]);
    }
}
