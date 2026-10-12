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
            'ownerId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'projectId' => ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
        ];
    }
}
