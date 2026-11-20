<?php

namespace App\Core\Messaging;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $slug
 * @property int $version
 * @property string $audience
 * @property int|null $organization_id
 * @property string $title
 * @property string $body_markdown
 * @property string $cta_label
 * @property string|null $cta_link
 * @property string|null $category
 * @property string $status
 * @property bool $ack_required
 * @property string|null $ack_policy_version
 * @property Carbon|null $published_at
 * @property Carbon|null $retired_at
 * @property int $published_by_user_id
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class CoreSystemMessage extends Model
{
    protected $table = 'core_system_messages';

    protected $fillable = [
        'slug', 'version', 'audience', 'organization_id',
        'title', 'body_markdown', 'cta_label', 'cta_link',
        'category', 'status', 'ack_required', 'ack_policy_version',
        'published_at', 'retired_at', 'published_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'organization_id' => 'integer',
            'published_by_user_id' => 'integer',
            'ack_required' => 'boolean',
            'published_at' => 'datetime',
            'retired_at' => 'datetime',
        ];
    }

    /**
     * Validate that a deep-link points at a relative path inside the app
     * to block javascript:/data:/external schemes.
     */
    public static function safeCtaLink(string $link): ?string
    {
        $link = trim($link);
        if ($link === '' || strlen($link) > 1000) {
            return null;
        }
        // Reject absolute URLs with a host other than our own SPA.
        if (preg_match('#^[a-zA-Z][a-zA-Z0-9+.\-]*:#', $link)
            && ! str_starts_with($link, '/')) {
            return null;
        }

        return $link;
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(CoreSystemMessageDelivery::class, 'message_id');
    }

    public function isPublished(): bool
    {
        return $this->status === 'published' && $this->published_at !== null && $this->retired_at === null;
    }
}
