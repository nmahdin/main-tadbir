<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class ResetPasswordRequest extends FormRequest
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
            'token' => ['required', 'string'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string', 'confirmed', Password::min(8)->letters()->numbers()],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'token.required' => 'کد بازیابی رمز عبور ارسال نشده است.',
            'email.required' => 'ایمیل حساب کاربری را وارد کنید.',
            'email.email' => 'قالب ایمیل صحیح نیست.',
            'password.required' => 'رمز عبور جدید را وارد کنید.',
            'password.confirmed' => 'رمز عبور جدید و تکرار آن یکسان نیستند.',
            'password.min' => 'رمز عبور باید حداقل ۸ کاراکتر و شامل حرف و عدد باشد.',
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => is_string($this->email) ? mb_strtolower(trim($this->email)) : $this->email,
        ]);
    }
}
