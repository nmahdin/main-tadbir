<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class PublicationCommandRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'expectedVersion' => 'required|string|size:64',
            // تاریخ و ساعت انتشار دلخواه؛ هر دو اختیاری‌اند و پیش‌فرض «همین حالا» است.
            'publishDate' => ['nullable', 'date_format:Y-m-d'],
            'publishTime' => ['nullable', 'date_format:H:i'],
        ];
    }
}
