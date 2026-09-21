<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class WorkspaceRecordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        if (! $this->filled('title') && $this->filled('subject')) {
            $this->merge(['title' => $this->input('subject')]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'title' => [$required, 'string', 'max:255'],
            'status' => ['sometimes', 'nullable', 'string', 'max:80'],
        ];
    }
}
