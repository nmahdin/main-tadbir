<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('subject_type', 24);
            $table->unsignedBigInteger('subject_id');
            $table->foreignId('parent_id')->nullable()->constrained('comments')->nullOnDelete();
            $table->text('body');
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['subject_type', 'subject_id', 'created_at']);
            $table->index(['user_id', 'created_at']);
        });

        if (Schema::hasTable('task_comments')) {
            DB::table('task_comments')->orderBy('id')->each(function ($comment): void {
                DB::table('comments')->insert([
                    'user_id' => $comment->user_id,
                    'subject_type' => 'task',
                    'subject_id' => $comment->task_id,
                    'body' => $comment->text,
                    'metadata' => null,
                    'created_at' => $comment->created_at,
                    'updated_at' => $comment->updated_at,
                ]);
            });
            Schema::drop('task_comments');
        }

        $this->movePayloadComments('contents', 'content');
        $this->movePayloadComments('workspace_records', 'idea', fn ($query) => $query->where('kind', 'idea'));
        $this->movePayloadComments('domain_records', 'asset', fn ($query) => $query->where('domain', 'asset'));
    }

    public function down(): void
    {
        Schema::create('task_comments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('text');
            $table->timestamps();
        });
        DB::table('comments')->where('subject_type', 'task')->whereNotNull('user_id')->orderBy('id')->each(function ($comment): void {
            DB::table('task_comments')->insert([
                'task_id' => $comment->subject_id,
                'user_id' => $comment->user_id,
                'text' => $comment->body,
                'created_at' => $comment->created_at,
                'updated_at' => $comment->updated_at,
            ]);
        });

        $this->restorePayloadComments('contents', 'content');
        $this->restorePayloadComments('workspace_records', 'idea');
        $this->restorePayloadComments('domain_records', 'asset');
        Schema::dropIfExists('comments');
    }

    private function movePayloadComments(string $table, string $subjectType, ?Closure $scope = null): void
    {
        if (! Schema::hasTable($table)) {
            return;
        }
        $query = DB::table($table)->select(['id', 'payload', 'created_at'])->orderBy('id');
        if ($scope) {
            $scope($query);
        }
        $query->each(function ($record) use ($table, $subjectType): void {
            $payload = json_decode((string) $record->payload, true);
            if (! is_array($payload) || ! is_array($payload['comments'] ?? null)) {
                return;
            }
            $legacyIds = [];
            foreach ($payload['comments'] as $legacy) {
                if (! is_array($legacy) || ! is_string($legacy['text'] ?? null) || trim($legacy['text']) === '') {
                    continue;
                }
                $userId = isset($legacy['userId']) && ctype_digit((string) $legacy['userId']) && DB::table('users')->where('id', $legacy['userId'])->exists()
                    ? (int) $legacy['userId'] : null;
                $createdAt = $this->date($legacy['createdAt'] ?? $legacy['timestamp'] ?? null, $record->created_at);
                $metadata = array_filter([
                    'legacy_id' => isset($legacy['id']) ? (string) $legacy['id'] : null,
                    'legacy_reply_to' => isset($legacy['replyToId']) ? (string) $legacy['replyToId'] : null,
                    'asset_ids' => isset($legacy['assetIds']) && is_array($legacy['assetIds']) ? array_values($legacy['assetIds']) : null,
                    'reactions' => isset($legacy['reactions']) && is_array($legacy['reactions']) ? array_values($legacy['reactions']) : null,
                ], fn ($value) => $value !== null);
                $id = DB::table('comments')->insertGetId([
                    'user_id' => $userId, 'subject_type' => $subjectType, 'subject_id' => $record->id,
                    'parent_id' => null, 'body' => trim($legacy['text']),
                    'metadata' => $metadata ? json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
                    'created_at' => $createdAt, 'updated_at' => $createdAt,
                ]);
                if (isset($legacy['id'])) {
                    $legacyIds[(string) $legacy['id']] = $id;
                }
            }
            foreach ($payload['comments'] as $legacy) {
                if (is_array($legacy) && isset($legacy['id'], $legacy['replyToId'], $legacyIds[(string) $legacy['id']], $legacyIds[(string) $legacy['replyToId']])) {
                    DB::table('comments')->where('id', $legacyIds[(string) $legacy['id']])->update(['parent_id' => $legacyIds[(string) $legacy['replyToId']]]);
                }
            }
            unset($payload['comments']);
            DB::table($table)->where('id', $record->id)->update(['payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        });
    }

    private function restorePayloadComments(string $table, string $subjectType): void
    {
        if (! Schema::hasTable($table)) {
            return;
        }
        DB::table('comments')->where('subject_type', $subjectType)->orderBy('id')->get()->groupBy('subject_id')->each(function ($comments, $subjectId) use ($table): void {
            $record = DB::table($table)->where('id', $subjectId)->first(['payload']);
            if (! $record) {
                return;
            }
            $payload = json_decode((string) $record->payload, true) ?: [];
            $payload['comments'] = $comments->map(fn ($comment) => [
                'id' => (string) $comment->id,
                'userId' => $comment->user_id ? (string) $comment->user_id : '',
                'text' => $comment->body,
                'timestamp' => (string) $comment->created_at,
                'replyToId' => $comment->parent_id ? (string) $comment->parent_id : null,
            ])->all();
            DB::table($table)->where('id', $subjectId)->update(['payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        });
    }

    private function date(mixed $value, mixed $fallback): string
    {
        try {
            return $value ? Carbon::parse($value)->toDateTimeString() : Carbon::parse($fallback)->toDateTimeString();
        } catch (Throwable) {
            return now()->toDateTimeString();
        }
    }
};
