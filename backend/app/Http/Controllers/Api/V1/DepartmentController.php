<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Http\Resources\DepartmentResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Validator;

class DepartmentController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $departments = Department::query()
            ->with('parent')
            ->orderBy('name')
            ->get();

        return DepartmentResource::collection($departments);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $department = Department::create($this->attributes($data));

        return (new DepartmentResource($department->load('parent')))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, Department $department): DepartmentResource
    {
        $data = $this->validated($request, $department);

        $payload = array_merge(
            $department->payload ?? [],
            $data['members'] !== null ? ['members' => $data['members']] : [],
        );

        $department->update([
            ...$this->attributes($data),
            'payload' => $payload,
        ]);

        return new DepartmentResource($department->refresh()->load('parent'));
    }

    public function destroy(Department $department): Response
    {
        $department->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Department $department = null): array
    {
        $nameRule = ['required', 'string', 'max:120'];

        return Validator::make($request->all(), [
            'name' => $nameRule,
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'managerId' => ['sometimes', 'nullable', 'integer'],
            'parentId' => ['sometimes', 'nullable', 'integer'],
            'status' => ['sometimes', 'nullable', 'string', 'max:20'],
            'members' => ['sometimes', 'nullable', 'array'],
        ])->validate();
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function attributes(array $data): array
    {
        $payload = [];

        if (array_key_exists('members', $data) && is_array($data['members'])) {
            $payload['members'] = $data['members'];
        }

        return [
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'manager_id' => isset($data['managerId']) && is_numeric($data['managerId']) ? (int) $data['managerId'] : null,
            'parent_id' => isset($data['parentId']) && is_numeric($data['parentId']) ? (int) $data['parentId'] : null,
            'status' => in_array($data['status'] ?? null, ['active', 'inactive'], true) ? $data['status'] : 'active',
            'payload' => $payload === [] ? null : $payload,
        ];
    }
}
