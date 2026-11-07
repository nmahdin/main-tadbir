<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ContentResource;
use App\Models\Content;
use App\Services\ContentAccess;
use App\Services\ContentReview;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * تغییر دستی وضعیت یک مرحله از جریان محتوا.
 *
 * چرا مسیر جدا و نه ویرایش عمومی محتوا؟ قاعدهٔ `ContentReview::guardGeneric`
 * عمداً ورود به وضعیت‌های تصمیم (تأیید/اصلاح) و خروج از «در انتظار بررسی» را
 * از ویرایش عمومی می‌بندد تا تصمیم ارزیاب از مسیر رسمی خودش بیاید. اما گردانندهٔ
 * جریان باید بتواند وضعیت سرگردان را اصلاح کند — مثلاً مرحله‌ای که اشتباه
 * «تأییدشده» مانده یا بررسی‌ای که باید باز شود. این مسیر همان کار را با مجوز
 * `content.workflow.manage`، با ثبت در تاریخ فعالیت و هم‌زمان‌سازی تسک‌های مرحله
 * انجام می‌دهد؛ بنابراین «تأییدشده» و «در انتظار بررسی» هم قفل نیستند.
 */
class ContentStageStatusController extends Controller
{
    public function __invoke(Request $request, Content $content, string $stage, ContentReview $review)
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(ContentReview::EDITABLE_STAGE_STATUSES)],
            'expectedVersion' => ['sometimes', 'string', 'size:64'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        abort_unless(app(ContentAccess::class)->canView($request->user(), $content), 403);
        abort_unless($review->canConfigureWorkflow($request->user()), 403, 'تغییر دستی وضعیت مرحله نیازمند مجوز مدیریت جریان محتواست.');

        return new ContentResource($review->overrideStageStatus($request->user(), $content, $stage, $data));
    }
}
