<?php

namespace App\Http\Requests\Auth;

use App\Rules\PasswordByteLimit;
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
            'password' => ['required', 'string', 'confirmed', Password::min(8)->letters()->numbers(), new PasswordByteLimit],
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
            'password.required' => 'رمز عبور را وارد کنید.',
            'password.confirmed' => 'رمز عبور و تکرار آن یکسان نیستند.',
            'password.min' => 'رمز عبور باید حداقل ۸ کاراکتر و شامل حرف و عدد باشد.',
            'password.letters' => 'رمز عبور باید حداقل شامل یک حرف باشد.',
            'password.numbers' => 'رمز عبور باید حداقل شامل یک عدد باشد.',
            'password.mixed' => 'رمز عبور باید شامل حروف کوچک و بزرگ باشد.',
            'password.symbols' => 'رمز عبور باید حداقل شامل یک نماد باشد.',
            'password.uncompromised' => 'این رمز عبور در نشت‌های اطلاعاتی دیده شده است؛ رمز دیگری انتخاب کنید.',
            'phone.regex' => 'شماره تماس معتبر نیست.',
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'username' => is_string($this->username) ? trim($this->username) : $this->username,
            'phone' => is_string($this->phone) ? preg_replace('/\s+/', '', $this->phone) : $this->phone,
        ]);
    }
}
