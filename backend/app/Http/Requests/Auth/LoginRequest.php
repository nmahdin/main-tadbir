<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'login' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'login.required' => 'نام کاربری را وارد کنید.',
            'login.string' => 'نام کاربری معتبر نیست.',
            'password.required' => 'رمز عبور را وارد کنید.',
            'remember.boolean' => 'مقدار «مرا به خاطر بسپار» معتبر نیست.',
        ];
    }

    /**
     * حذف فاصله‌های اضافه از نام کاربری.
     */
    protected function prepareForValidation(): void
    {
        if (! is_string($this->login)) {
            return;
        }

        $login = trim($this->login);

        $this->merge([
            'login' => $login,
        ]);
    }
}
