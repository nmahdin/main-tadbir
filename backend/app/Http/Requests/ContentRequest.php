<?php

namespace App\Http\Requests;

use App\Services\ContentReview;
use App\Support\Content\StageAdvanceMode;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ContentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * دو فیلد سیاست مرحله پیش از اعتبارسنجی به معادل پشتیبانی‌شده نگاشت می‌شوند —
     * دقیقاً همان کاری که برای `status` در کنترلر انجام می‌شود و برای قالب‌های
     * فرایند در `OrganizationSettings` هم انجام شده است. مقادیر تاریخی
     * (`forward`/`forwarded` برای حالت فعال‌سازی و `any_reviewer`/`explicit_approver`
     * برای سیاست ارزیاب) در دادهٔ قدیمی وجود دارند؛ اگر خروجی بگیرند، ذخیرهٔ
     * جریان محتوا با خطای ۴۲۲ بسته می‌شود، در حالی که معنای زمان اجرای آن‌ها
     * همان مقدار پیش‌فرض امن است.
     */
    protected function prepareForValidation(): void
    {
        $stages = $this->input('stages');
        if (! is_array($stages) || ! array_is_list($stages)) {
            return;
        }
        $normalized = [];
        foreach ($stages as $stage) {
            if (is_array($stage)) {
                $mode = $stage['advanceMode'] ?? null;
                if (is_string($mode) && trim($mode) !== '' && ! in_array($mode, StageAdvanceMode::ALL, true)) {
                    $stage['advanceMode'] = StageAdvanceMode::of($mode);
                }
                if (in_array($stage['reviewerStrategy'] ?? null, ['any_reviewer', 'explicit_approver'], true)) {
                    $stage['reviewerStrategy'] = 'stage_reviewer';
                }
            }
            $normalized[] = $stage;
        }
        $this->merge(['stages' => $normalized]);
    }

    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'reviewVersion' => ['sometimes', 'string', 'size:64'],
            'stages' => ['sometimes', 'array', 'list', 'max:100'],
            'stages.*.id' => ['required', 'string', 'max:120', 'distinct'],
            'stages.*.status' => ['sometimes', 'string', Rule::in(ContentReview::STATUSES)],
            'stages.*.advanceMode' => ['sometimes', 'nullable', Rule::in(StageAdvanceMode::ALL)],
            'stages.*.reviewRequired' => ['sometimes', 'boolean'],
            'stages.*.reviewerStrategy' => ['sometimes', 'nullable', Rule::in(['stage_reviewer', 'content_owner', 'department_manager'])],
            'title' => [$required, 'string', 'max:255'],
            'type' => [$required, 'string', 'max:80'],
            // targetAudience remains the first selected value for old clients;
            // targetAudiences is the canonical multi-selection.
            'targetAudience' => ['sometimes', 'nullable', 'string', 'max:80'],
            'targetAudiences' => ['sometimes', 'array', 'max:30'],
            'targetAudiences.*' => ['string', 'max:80', 'distinct'],
            'mediaGoal' => ['sometimes', 'nullable', 'string', 'max:1000'],
            // Derived statuses are produced by the workflow; the transition guard
            // in the controller rejects any attempt to move into one of them.
            'status' => ['sometimes', 'string', 'max:80', Rule::notIn(['in_progress', 'completed'])],
            'code' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[A-Za-z0-9][A-Za-z0-9._-]*$/'],
            'seriesId' => ['sometimes', 'nullable', 'string', 'max:120'],
            'seriesCode' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[A-Za-z0-9][A-Za-z0-9._-]*$/'],
            'deadline' => ['sometimes', 'nullable', 'date'],
            // دپارتمان مجری ستون مستقل ندارد و داخل payload نگه داشته می‌شود.
            // عمداً `exists` ندارد: حذف یک دپارتمان نباید ویرایش پرونده‌های قدیمی
            // را با خطای اعتبارسنجی ببندد.
            'departmentId' => ['sometimes', 'nullable', 'string', 'max:120'],
            'ownerId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'projectId' => ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
        ];
    }
}
