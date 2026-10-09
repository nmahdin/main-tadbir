<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DomainRecord;
use App\Services\Access\ChatAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Private conversation attachments; every read rechecks current membership. */
final class ChatAttachmentController extends Controller
{
    private const EXTENSIONS = [
        'jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'txt', 'csv', 'md',
        'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip',
        'mp3', 'wav', 'ogg', 'm4a', 'webm', 'mp4', 'mov',
    ];

    public function store(Request $request, DomainRecord $conversation, ChatAccess $access): JsonResponse
    {
        abort_unless($conversation->domain === DomainRecord::DOMAIN_CONVERSATION, 404);
        $conversation = $access->conversation($request->user(), $conversation->id, true);
        abort_unless($request->user()->hasPermission('messaging.send_message'), 403);
        abort_if(($conversation->payload['writePermission'] ?? 'all') === 'admins_only' && ! $access->manages($request->user(), $conversation), 403);
        $data = $request->validate(['file' => ['required', 'file', 'max:20480']]);
        $file = $data['file'];
        $extension = strtolower($file->getClientOriginalExtension());
        abort_unless(in_array($extension, self::EXTENSIONS, true), 422, 'قالب این پیوست مجاز نیست.');
        $token = (string) Str::uuid();
        Storage::disk('local')->putFileAs('chat/'.$conversation->id, $file, $token.'.'.$extension);
        $mime = strtolower((string) ($file->getMimeType() ?: 'application/octet-stream'));
        $type = match (true) {
            str_starts_with($mime, 'image/') => 'image',
            str_starts_with($mime, 'video/') => 'video',
            str_starts_with($mime, 'audio/') => $request->boolean('voice') ? 'voice' : 'audio',
            $extension === 'zip' => 'archive',
            default => 'document',
        };
        $size = (int) $file->getSize();

        return response()->json(['data' => [
            'id' => $token,
            'name' => mb_substr($file->getClientOriginalName(), 0, 255),
            'size' => $size,
            'sizeFormatted' => $size >= 1048576 ? round($size / 1048576, 1).' MB' : max(1, (int) round($size / 1024)).' KB',
            'type' => $type,
            'url' => url('/api/v1/chat/conversations/'.$conversation->id.'/attachments/'.$token),
        ]], 201);
    }

    public function show(Request $request, DomainRecord $conversation, string $token, ChatAccess $access): StreamedResponse
    {
        abort_unless($conversation->domain === DomainRecord::DOMAIN_CONVERSATION, 404);
        $access->conversation($request->user(), $conversation->id);
        abort_unless(Str::isUuid($token), 404);
        $path = collect(Storage::disk('local')->files('chat/'.$conversation->id))
            ->first(fn (string $path) => pathinfo($path, PATHINFO_FILENAME) === $token);
        abort_unless($path, 404);
        $mime = Storage::disk('local')->mimeType($path) ?: 'application/octet-stream';
        $disposition = str_starts_with($mime, 'image/') || str_starts_with($mime, 'audio/') || str_starts_with($mime, 'video/') ? 'inline' : 'attachment';

        return Storage::disk('local')->response($path, basename($path), [
            'Content-Type' => $mime,
            'Content-Disposition' => $disposition.'; filename="'.basename($path).'"',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
