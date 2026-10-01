<?php

namespace App\Http\Requests;

use App\Rules\PasswordByteLimit;
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
            'password' => [$this->isMethod('post') ? 'required' : 'sometimes', 'nullable', 'confirmed', Password::min(8)->letters()->numbers(), new PasswordByteLimit],
            'role' => ['sometimes', 'string'],
            'roleId' => ['sometimes', 'nullable', 'string', 'max:100'],
            'avatar' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'status' => ['sometimes', Rule::in(['active', 'inactive', 'blocked', 'pending'])],
            'title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'departmentId' => ['sometimes', 'nullable', 'integer', 'exists:departments,id'],
            'department' => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:20'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'bio' => ['sometimes', 'nullable', 'string'],
            'skills' => ['sometimes', 'array'],
            'skills.*' => ['string', 'max:100'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'نام و نام خانوادگی الزامی است.',
            'name.max' => 'نام نمی‌تواند بیشتر از ۲۵۵ نویسه باشد.',
            'username.required' => 'نام کاربری الزامی است.',
            'username.max' => 'نام کاربری نمی‌تواند بیشتر از ۱۰۰ نویسه باشد.',
            'username.unique' => 'این نام کاربری قبلاً ثبت شده است.',
            'password.required' => 'رمز عبور الزامی است.',
            'password.confirmed' => 'رمز عبور و تکرار آن یکسان نیستند.',
            'password.min' => 'رمز عبور باید حداقل ۸ نویسه باشد.',
            'password.letters' => 'رمز عبور باید حداقل شامل یک حرف باشد.',
            'password.numbers' => 'رمز عبور باید حداقل شامل یک عدد باشد.',
            'password.mixed' => 'رمز عبور باید شامل حروف کوچک و بزرگ باشد.',
            'password.symbols' => 'رمز عبور باید حداقل شامل یک نماد باشد.',
            'password.uncompromised' => 'این رمز عبور در نشت‌های اطلاعاتی دیده شده است؛ رمز دیگری انتخاب کنید.',
            'status.in' => 'وضعیت حساب کاربری معتبر نیست.',
            'phone.max' => 'شماره تماس نمی‌تواند بیشتر از ۲۰ نویسه باشد.',
        ];
    }
}
