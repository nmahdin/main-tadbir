<?php

namespace App\Services\Organization;

use App\Models\User;
use App\Services\TaskOperations;
use App\Support\Content\StageAdvanceMode;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Authoritative contract for organization-controlled settings.
 *
 * Environment secrets, queue/cache drivers and integration credentials never
 * belong here. Operational status identifiers stay bounded by backend domain
 * contracts; labels, colors and ordering remain organization-configurable.
 */
final class OrganizationSettings
{
    public const KEYS = [
        'content_types',
        'target_audiences',
        'categories',
        'idea_categories',
        'process_templates',
        'content_code_policies',
        'publishing_platforms',
        'workflows',
        'general',
        'notifications',
        'security',
        'task_priorities',
        'task_statuses',
        'dam_statuses',
        'content_statuses',
        'google_meet',
    ];

    private const ADMINISTRATIVE_KEYS = ['notifications', 'security'];

    private const OBJECT_KEYS = ['general', 'notifications', 'security', 'google_meet'];

    public const DEFAULTS = [
        'general' => [
            'orgName' => 'سامانه سازمانی تدبیر',
            'workspaceSlug' => 'tadbir-corp',
            'sprintLength' => '2 weeks',
            'timezone' => 'Asia/Tehran',
            'calendar' => 'jalali',
            'loginDescription' => '',
            'themeColor' => '#4f46e5',
            'secretariatEnabled' => true,
        ],
        'notifications' => [
            'deadlineReminders' => true,
            'mentionAlerts' => true,
        ],
        'security' => [
            'twoFactorEnforced' => false,
            'passwordMinLength' => 8,
            'sessionLifetimeMinutes' => 480,
            'maxLoginAttempts' => 5,
        ],
        'google_meet' => [
            'enabled' => true,
            'calendarId' => 'primary',
            'delegatedUser' => '',
            'timezone' => 'Asia/Tehran',
            'sendUpdates' => 'none',
            'defaultDurationMinutes' => 60,
        ],
    ];

    private const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

    public function supports(string $key): bool
    {
        return in_array($key, self::KEYS, true);
    }

    /** @return list<string> */
    public function readableKeys(User $actor): array
    {
        if ($actor->isAdmin() || $actor->hasPermission('settings.manage')) {
            return self::KEYS;
        }

        return array_values(array_diff(self::KEYS, self::ADMINISTRATIVE_KEYS));
    }

    public function canRead(User $actor, string $key): bool
    {
        return in_array($key, $this->readableKeys($actor), true);
    }

    public function canWrite(User $actor, string $key): bool
    {
        return $actor->isAdmin()
            || $actor->hasPermission('settings.manage')
            || ($key === 'idea_categories' && $actor->hasPermission('thinktank.create_idea'))
            || (in_array($key, ['process_templates', 'workflows'], true)
                && ($actor->hasPermission('content.workflow.manage') || $actor->hasPermission('content.edit')));
    }

    /** Merge stored object settings with safe structural defaults. */
    public function hydrate(string $key, mixed $value): array
    {
        $default = self::DEFAULTS[$key] ?? [];
        if (! is_array($value)) {
            return $default;
        }

        $merged = in_array($key, self::OBJECT_KEYS, true) ? [...$default, ...$value] : $value;
        if ($key === 'notifications') {
            unset($merged['emailAlerts'], $merged['weeklyDigest']);
        }
        if ($key === 'security') {
            // This is a compatibility value, not an environment-level password policy.
            $merged['passwordMinLength'] = 8;
        }

        return $merged;
    }

    /** Validate and strip unsupported fields before persistence. */
    public function validate(string $key, mixed $value): array
    {
        // These two retired email toggles are the only accepted legacy input. Other
        // unknown fields remain validation errors so typos cannot be silently stored.
        if ($key === 'notifications' && is_array($value)) {
            unset($value['emailAlerts'], $value['weeklyDigest']);
        }
        if ($key === 'task_statuses' && is_array($value)) {
            $normalized = [];
            $seen = [];
            foreach ($value as $status) {
                if (! is_array($status)) {
                    continue;
                }
                $id = strtolower(trim((string) ($status['id'] ?? '')));
                // Unknown identifiers must reach the authoritative Rule::in below
                // and fail validation; silently dropping a typo would report a
                // successful save while persisting a different configuration.
                if (isset($seen[$id])) {
                    continue;
                }
                $seen[$id] = true;
                $label = trim((string) ($status['label'] ?? $id));
                $color = trim((string) ($status['color'] ?? ''));
                $normalized[] = [
                    'id' => $id,
                    'label' => mb_substr($label !== '' ? $label : $id, 0, 120),
                    'color' => preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1 ? $color : '#64748b',
                    'order' => count($normalized) + 1,
                ];
            }
            $value = $normalized;
        }
        if ($key === 'content_statuses' && is_array($value)) {
            // Accept stale list/object shapes from old clients, but persist only the
            // canonical fields. Invalid, duplicate and retired rows cannot block the
            // rest of the organization settings save.
            $normalized = [];
            $seen = [];
            foreach ($value as $legacyId => $status) {
                if (is_string($status)) {
                    $status = ['label' => $status];
                }
                if (! is_array($status)) {
                    continue;
                }
                $fallbackId = is_string($legacyId) ? $legacyId : '';
                $id = trim((string) ($status['id'] ?? $status['key'] ?? $status['status'] ?? $fallbackId));
                $canonicalId = strtolower($id);
                if ($id === '' || preg_match('/^[A-Za-z0-9_-]+$/', $id) !== 1
                    || in_array($canonicalId, ['in_progress', 'completed'], true)
                    || isset($seen[$canonicalId])) {
                    continue;
                }
                $seen[$canonicalId] = true;
                $label = trim((string) ($status['label'] ?? $status['name'] ?? $status['title'] ?? $id));
                $color = trim((string) ($status['color'] ?? ''));
                $normalized[] = [
                    'id' => $id,
                    'label' => mb_substr($label !== '' ? $label : $id, 0, 120),
                    'color' => preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1 ? $color : '#64748b',
                    'order' => count($normalized) + 1,
                ];
                if (count($normalized) >= 100) {
                    break;
                }
            }
            $value = $normalized;
        }

        $rules = match ($key) {
            'general' => [
                'value' => ['present', 'array:orgName,workspaceSlug,sprintLength,timezone,calendar,loginDescription,themeColor,secretariatEnabled'],
                'value.orgName' => ['sometimes', 'string', 'max:160'],
                'value.workspaceSlug' => ['sometimes', 'string', 'max:80', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
                'value.sprintLength' => ['sometimes', 'string', 'max:32'],
                'value.timezone' => ['sometimes', 'string', 'max:64'],
                'value.calendar' => ['sometimes', Rule::in(['jalali', 'gregorian'])],
                'value.loginDescription' => ['sometimes', 'nullable', 'string', 'max:240'],
                'value.themeColor' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
                'value.secretariatEnabled' => ['sometimes', 'boolean'],
            ],
            'notifications' => [
                'value' => ['present', 'array:deadlineReminders,mentionAlerts'],
                'value.deadlineReminders' => ['sometimes', 'boolean'],
                'value.mentionAlerts' => ['sometimes', 'boolean'],
            ],
            'security' => [
                'value' => ['present', 'array:twoFactorEnforced,passwordMinLength,sessionLifetimeMinutes,maxLoginAttempts'],
                'value.twoFactorEnforced' => ['sometimes', 'boolean'],
                'value.passwordMinLength' => ['sometimes', 'integer', 'between:8,128'],
                'value.sessionLifetimeMinutes' => ['sometimes', 'integer', 'between:15,43200'],
                'value.maxLoginAttempts' => ['sometimes', 'integer', 'between:1,100'],
            ],
            'google_meet' => [
                'value' => ['present', 'array:enabled,calendarId,delegatedUser,timezone,sendUpdates,defaultDurationMinutes'],
                'value.enabled' => ['required', 'boolean'],
                'value.calendarId' => ['required', 'string', 'max:255'],
                'value.delegatedUser' => ['present', 'nullable', 'email:rfc', 'max:255'],
                'value.timezone' => ['required', 'timezone'],
                'value.sendUpdates' => ['required', Rule::in(['none', 'all', 'externalOnly'])],
                'value.defaultDurationMinutes' => ['required', 'integer', 'between:15,1440'],
            ],
            'target_audiences', 'categories', 'idea_categories' => [
                'value' => ['present', 'array', 'list', 'max:100'],
                'value.*' => ['required', 'string', 'max:80', 'distinct'],
            ],
            'content_types' => [
                'value' => ['present', 'array', 'list', 'max:100'],
                'value.*' => ['array:id,name,color'],
                'value.*.id' => ['required', 'string', 'max:80', 'regex:/^[A-Za-z0-9_-]+$/', 'distinct'],
                'value.*.name' => ['required', 'string', 'max:120'],
                'value.*.color' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            ],
            'task_priorities' => $this->orderedOptionsRules(self::TASK_PRIORITIES),
            'task_statuses' => $this->orderedOptionsRules(TaskOperations::STATUSES),
            'dam_statuses' => $this->orderedOptionsRules(minItems: 1, maxIdLength: 30),
            'content_statuses' => $this->orderedOptionsRules(forbiddenIds: ['in_progress', 'completed']),
            'content_code_policies' => [
                'value' => ['present', 'array', 'list', 'max:100'],
                'value.*' => ['array:id,scope,matchId,prefix,padding,description'],
                'value.*.id' => ['required', 'string', 'max:120', 'distinct'],
                'value.*.scope' => ['required', Rule::in(['content_type', 'series'])],
                'value.*.matchId' => ['required', 'string', 'max:120'],
                'value.*.prefix' => ['required', 'string', 'max:6', 'regex:/^[A-Za-z0-9]+$/'],
                'value.*.padding' => ['sometimes', 'nullable', 'integer', 'between:2,8'],
                'value.*.description' => ['sometimes', 'nullable', 'string', 'max:500'],
            ],
            'publishing_platforms' => [
                'value' => ['present', 'array', 'list', 'max:100'],
                'value.*' => ['array:id,name,iconName,color,bg,isEnabled,urlPattern,description,category,handle,defaultHandle'],
                'value.*.id' => ['required', 'string', 'max:80', 'regex:/^[A-Za-z0-9_-]+$/', 'distinct'],
                'value.*.name' => ['required', 'string', 'max:120'],
                'value.*.iconName' => ['sometimes', 'nullable', 'string', 'max:80'],
                'value.*.color' => ['required', 'string', 'max:80'],
                'value.*.bg' => ['required', 'string', 'max:120'],
                'value.*.isEnabled' => ['required', 'boolean'],
                'value.*.urlPattern' => ['sometimes', 'nullable', 'string', 'max:500'],
                'value.*.description' => ['sometimes', 'nullable', 'string', 'max:500'],
                'value.*.category' => ['sometimes', 'nullable', 'string', 'max:80'],
                'value.*.handle' => ['sometimes', 'nullable', 'string', 'max:160'],
                'value.*.defaultHandle' => ['sometimes', 'nullable', 'string', 'max:160'],
            ],
            'workflows' => [
                'value' => ['present', 'array', 'list', 'max:100'],
                'value.*' => ['array:id,name,description,entityType,stages,createdAt'],
                'value.*.id' => ['required', 'string', 'max:120', 'distinct'],
                'value.*.name' => ['required', 'string', 'max:160'],
                'value.*.description' => ['sometimes', 'nullable', 'string', 'max:1000'],
                'value.*.entityType' => ['required', Rule::in(['content', 'project', 'idea', 'letter', 'general'])],
                'value.*.createdAt' => ['sometimes', 'nullable', 'string', 'max:40'],
                'value.*.stages' => ['required', 'array', 'list', 'max:100'],
                'value.*.stages.*' => ['array:id,name,description,roleIds,userIds,canTransitionNext,canRevert,deadlineDays'],
                'value.*.stages.*.id' => ['required', 'string', 'max:120', 'distinct'],
                'value.*.stages.*.name' => ['required', 'string', 'max:160'],
                'value.*.stages.*.description' => ['sometimes', 'nullable', 'string', 'max:1000'],
                'value.*.stages.*.roleIds' => ['sometimes', 'array', 'list', 'max:100'],
                'value.*.stages.*.roleIds.*' => ['string', 'max:40', 'distinct'],
                'value.*.stages.*.userIds' => ['sometimes', 'array', 'list', 'max:100'],
                'value.*.stages.*.userIds.*' => ['string', 'max:40', 'distinct'],
                'value.*.stages.*.canTransitionNext' => ['required', 'boolean'],
                'value.*.stages.*.canRevert' => ['required', 'boolean'],
                'value.*.stages.*.deadlineDays' => ['sometimes', 'nullable', 'integer', 'between:0,3650'],
            ],
            'process_templates' => [
                'value' => ['present', 'array', 'list', 'max:100'],
                'value.*' => ['array:id,name,type,iconName,description,estimatedDays,stages'],
                'value.*.id' => ['required', 'string', 'max:120', 'distinct'],
                'value.*.name' => ['required', 'string', 'max:160'],
                'value.*.type' => ['required', 'string', 'max:80'],
                'value.*.iconName' => ['sometimes', 'nullable', 'string', 'max:80'],
                'value.*.description' => ['sometimes', 'nullable', 'string', 'max:1000'],
                'value.*.estimatedDays' => ['sometimes', 'nullable', 'integer', 'between:0,3650'],
                'value.*.stages' => ['required', 'array', 'list', 'max:100'],
                'value.*.stages.*' => ['array:stageKey,title,description,departmentId,departmentName,defaultRole,order,daysFromStart,deadlinePolicy,inputs,outputs,dependsOnPrevious,reviewRequired,reviewerStrategy,advanceMode'],
                'value.*.stages.*.stageKey' => ['required', 'string', 'max:120'],
                'value.*.stages.*.title' => ['required', 'string', 'max:160'],
                'value.*.stages.*.description' => ['sometimes', 'nullable', 'string', 'max:1000'],
                'value.*.stages.*.departmentId' => ['sometimes', 'nullable', 'string', 'max:40'],
                'value.*.stages.*.departmentName' => ['sometimes', 'nullable', 'string', 'max:160'],
                'value.*.stages.*.defaultRole' => ['sometimes', 'nullable', 'string', 'max:120'],
                'value.*.stages.*.order' => ['required', 'integer', 'between:0,1000'],
                'value.*.stages.*.daysFromStart' => ['required', 'integer', 'between:0,3650'],
                'value.*.stages.*.deadlinePolicy' => ['sometimes', 'nullable', Rule::in(['from_start', 'from_previous', 'none'])],
                'value.*.stages.*.inputs' => ['present', 'array', 'list', 'max:100'],
                'value.*.stages.*.outputs' => ['present', 'array', 'list', 'max:100'],
                'value.*.stages.*.dependsOnPrevious' => ['sometimes', 'boolean'],
                'value.*.stages.*.reviewRequired' => ['sometimes', 'boolean'],
                'value.*.stages.*.reviewerStrategy' => ['sometimes', 'nullable', Rule::in(['stage_reviewer', 'content_owner', 'department_manager'])],
                'value.*.stages.*.advanceMode' => ['sometimes', 'nullable', Rule::in(StageAdvanceMode::ALL)],
            ],
            default => ['value' => ['present', 'array']],
        };

        $validated = Validator::make(['value' => $value], $rules)->validate()['value'];

        return in_array($key, self::OBJECT_KEYS, true)
            ? $this->hydrate($key, $validated)
            : $validated;
    }

    /** @param list<string> $allowedIds @param list<string> $forbiddenIds */
    private function orderedOptionsRules(array $allowedIds = [], array $forbiddenIds = [], int $minItems = 0, int $maxIdLength = 80): array
    {
        $idRules = ['required', 'string', 'max:'.$maxIdLength, 'regex:/^[A-Za-z0-9_-]+$/', 'distinct'];
        if ($allowedIds !== []) {
            $idRules[] = Rule::in($allowedIds);
        }
        if ($forbiddenIds !== []) {
            $idRules[] = Rule::notIn($forbiddenIds);
        }

        $valueRules = ['present', 'array', 'list', 'max:100'];
        if ($minItems > 0) {
            $valueRules[] = 'min:'.$minItems;
        }

        return [
            'value' => $valueRules,
            'value.*' => ['array:id,label,color,order'],
            'value.*.id' => $idRules,
            'value.*.label' => ['required', 'string', 'max:120'],
            'value.*.color' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'value.*.order' => ['required', 'integer', 'between:0,1000'],
        ];
    }
}
