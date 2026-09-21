<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ContentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'title' => [$required, 'string', 'max:255'],
            'type' => [$required, 'string', 'max:80'],
            'status' => ['sometimes', 'string', 'max:80'],
            'deadline' => ['sometimes', 'nullable', 'date'],
            'ownerId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'projectId' => ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
        ];
    }
}
