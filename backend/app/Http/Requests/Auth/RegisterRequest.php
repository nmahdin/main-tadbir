<?php

namespace App\Http\Requests\Auth;

use App\Core\Identity\UsernamePolicy;
use App\Modules\Identity\Rules\PasswordByteLimit;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\Validator;

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
            // AMB-01=B: user-chosen username, policy-checked and
            // normalization-equivalent unique (see UsernamePolicy).
            'username' => ['required', 'string'],
            'password' => ['required', 'string', 'confirmed', Password::min(8)->letters()->numbers(), new PasswordByteLimit],
            'email' => ['nullable', 'email', 'max:320'],
            'phone' => ['nullable', 'string', 'max:20', 'regex:/^[0-9+\-\s]+$/'],
            'department' => ['nullable', 'string', 'max:120'],
            'title' => ['nullable', 'string', 'max:120'],
            // Versioned terms evidence (AUTH-EXT-01 §6.5).
            'terms_accepted' => ['required', 'accepted'],
            'terms_version' => ['required', 'string', 'max:20'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $username = (string) $this->input('username', '');
            if ($message = UsernamePolicy::validate($username)) {
                $validator->errors()->add('username', $message);
            } elseif (UsernamePolicy::isTaken($username)) {
                $validator->errors()->add('username', 'این نام کاربری قبلاً انتخاب شده است.');
            }
            $email = $this->input('email');
            if (is_string($email) && $email !== '' && \App\Models\User::where('email', strtolower(trim($email)))->exists()) {
                $validator->errors()->add('email', 'این ایمیل قبلاً استفاده شده است.');
            }
            if ((string) $this->input('terms_version') !== (string) config('auth.terms.current_version')) {
                $validator->errors()->add('terms_version', 'نسخهٔ قوانین به‌روز نیست؛ صفحه را تازه کنید.');
            }
        });
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
            'email.email' => 'ایمیل معتبر نیست.',
            'terms_accepted.required' => 'پذیرش قوانین و مقررات الزامی است.',
            'terms_accepted.accepted' => 'پذیرش قوانین و مقررات الزامی است.',
            'terms_version.required' => 'نسخهٔ قوانین مشخص نیست؛ صفحه را تازه کنید.',
        ];
    }
}
