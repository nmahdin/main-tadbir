<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class PublicationTaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'expectedVersion' => 'required|string|size:64', 'title' => 'sometimes|required|string|max:255',
            'description' => 'sometimes|nullable|string|max:3000',
            'assigneeId' => 'sometimes|integer|exists:users,id', 'priority' => 'sometimes|in:low,medium,high,urgent',
            'deadline' => 'sometimes|nullable|date_format:Y-m-d',
        ];
    }
}
