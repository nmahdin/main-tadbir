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
            'login.required' => 'نام کاربری یا ایمیل را وارد کنید.',
            'login.string' => 'نام کاربری یا ایمیل معتبر نیست.',
            'password.required' => 'رمز عبور را وارد کنید.',
            'remember.boolean' => 'مقدار «مرا به خاطر بسپار» معتبر نیست.',
        ];
    }

    /**
     * یکسان‌سازی ورودی: ایمیل با حروف کوچک و حذف فاصله‌های اضافه از نام کاربری.
     */
    protected function prepareForValidation(): void
    {
        if (! is_string($this->login)) {
            return;
        }

        $login = trim($this->login);

        $this->merge([
            'login' => str_contains($login, '@') ? mb_strtolower($login) : $login,
        ]);
    }
}
