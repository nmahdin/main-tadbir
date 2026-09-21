<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class RegisterRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:120'],
            'username' => [
                'required', 'string', 'min:3', 'max:60',
                'regex:/^[A-Za-z0-9._-]+$/',
                'unique:users,username',
            ],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'confirmed', Password::min(8)->letters()->numbers()],
            'phone' => ['nullable', 'string', 'max:20', 'regex:/^[0-9+\-\s]+$/'],
            'department' => ['nullable', 'string', 'max:120'],
            'title' => ['nullable', 'string', 'max:120'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'نام و نام خانوادگی را وارد کنید.',
            'name.max' => 'نام و نام خانوادگی بیش از حد طولانی است.',
            'username.required' => 'نام کاربری را وارد کنید.',
            'username.min' => 'نام کاربری باید حداقل ۳ کاراکتر باشد.',
            'username.regex' => 'نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد.',
            'username.unique' => 'این نام کاربری قبلاً ثبت شده است.',
            'email.required' => 'ایمیل را وارد کنید.',
            'email.email' => 'قالب ایمیل صحیح نیست.',
            'email.unique' => 'این ایمیل قبلاً در سامانه ثبت شده است.',
            'password.required' => 'رمز عبور را وارد کنید.',
            'password.confirmed' => 'رمز عبور و تکرار آن یکسان نیستند.',
            'password.min' => 'رمز عبور باید حداقل ۸ کاراکتر و شامل حرف و عدد باشد.',
            'phone.regex' => 'شماره تماس معتبر نیست.',
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => is_string($this->email) ? mb_strtolower(trim($this->email)) : $this->email,
            'username' => is_string($this->username) ? trim($this->username) : $this->username,
            'phone' => is_string($this->phone) ? preg_replace('/\s+/', '', $this->phone) : $this->phone,
        ]);
    }
}
