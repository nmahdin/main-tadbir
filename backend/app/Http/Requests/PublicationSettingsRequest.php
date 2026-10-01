<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class PublicationSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'expectedVersion' => 'required|string|size:64', 'publisherId' => 'sometimes|nullable|integer|exists:users,id',
            'publishInfo' => 'required|array:date,time,channels,caption,status',
            'publishInfo.date' => 'sometimes|nullable|date_format:Y-m-d',
            'publishInfo.time' => 'sometimes|nullable|date_format:H:i',
            'publishInfo.channels' => 'sometimes|array|max:30', 'publishInfo.channels.*' => 'string|max:100|distinct',
            'publishInfo.caption' => 'sometimes|nullable|string|max:10000',
            'publishInfo.status' => 'sometimes|in:planned,ready',
        ];
    }
}
