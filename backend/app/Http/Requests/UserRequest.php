<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $userId = $this->route('user')?->getKey();
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:255'],
            'username' => [$required, 'string', 'max:100', Rule::unique('users', 'username')->ignore($userId)],
            'email' => [$required, 'email', 'max:255', Rule::unique('users', 'email')->ignore($userId)],
            'password' => [$this->isMethod('post') ? 'required' : 'sometimes', 'nullable', 'confirmed', Password::min(8)->letters()->numbers()],
            'role' => ['sometimes', 'string', 'exists:roles,key'],
            'status' => ['sometimes', Rule::in(['active', 'inactive', 'blocked', 'pending'])],
            'title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'department' => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:20'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'bio' => ['sometimes', 'nullable', 'string'],
            'skills' => ['sometimes', 'array'],
            'skills.*' => ['string', 'max:100'],
            'twoFactorEnabled' => ['sometimes', 'boolean'],
        ];
    }
}
