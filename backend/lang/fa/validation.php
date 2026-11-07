<?php

/*
|--------------------------------------------------------------------------
| پیام‌های اعتبارسنجی (فارسی)
|--------------------------------------------------------------------------
|
| پیش از این فایل، هیچ ترجمهٔ فارسی برای قواعد اعتبارسنجی وجود نداشت و Laravel
| پیام‌های انگلیسی چارچوب را برمی‌گرداند («The title field is required.»). فرانت
| تنها متن فارسی را نمایش می‌دهد، پس هر خطای ۴۲۲ فقط به «اطلاعات واردشده معتبر
| نیست» تبدیل می‌شد و کاربر دلیل ردشدن را نمی‌دانست. با این فایل، پیامِ دقیقِ
| همان قاعدهٔ نقض‌شده و نامِ فارسیِ همان فیلد به کاربر نشان داده می‌شود.
|
*/

return [

    'accepted' => 'فیلد :attribute باید پذیرفته شود.',
    'accepted_if' => 'وقتی :other برابر :value است، فیلد :attribute باید پذیرفته شود.',
    'active_url' => 'فیلد :attribute باید یک نشانی اینترنتی معتبر باشد.',
    'after' => 'فیلد :attribute باید تاریخی بعد از :date باشد.',
    'after_or_equal' => 'فیلد :attribute باید تاریخی برابر یا بعد از :date باشد.',
    'alpha' => 'فیلد :attribute فقط می‌تواند شامل حروف باشد.',
    'alpha_dash' => 'فیلد :attribute فقط می‌تواند شامل حروف، اعداد، خط تیره و زیرخط باشد.',
    'alpha_num' => 'فیلد :attribute فقط می‌تواند شامل حروف و اعداد باشد.',
    'any_of' => 'فیلد :attribute معتبر نیست.',
    'array' => 'فیلد :attribute باید یک فهرست باشد.',
    'array_keys' => 'فیلد :attribute فقط می‌تواند شامل این کلیدها باشد: :values.',
    'ascii' => 'فیلد :attribute فقط می‌تواند شامل حروف و نمادهای تک‌بایتی باشد.',
    'base64' => 'فیلد :attribute باید یک رشتهٔ Base64 معتبر باشد.',
    'before' => 'فیلد :attribute باید تاریخی قبل از :date باشد.',
    'before_or_equal' => 'فیلد :attribute باید تاریخی برابر یا قبل از :date باشد.',
    'between' => [
        'array' => 'تعدادِ موارد فیلد :attribute باید بین :min و :max باشد.',
        'file' => 'حجم فیلد :attribute باید بین :min و :max کیلوبایت باشد.',
        'numeric' => 'مقدار فیلد :attribute باید بین :min و :max باشد.',
        'string' => 'طول فیلد :attribute باید بین :min و :max نویسه باشد.',
    ],
    'boolean' => 'فیلد :attribute باید درست یا نادرست باشد.',
    'can' => 'فیلد :attribute مقدار غیرمجاز دارد.',
    'confirmed' => 'تکرارِ فیلد :attribute با مقدار واردشده یکسان نیست.',
    'contains' => 'فیلد :attribute یکی از مقادیر لازم را ندارد.',
    'current_password' => 'رمز عبور نادرست است.',
    'date' => 'فیلد :attribute باید یک تاریخ معتبر باشد.',
    'date_equals' => 'فیلد :attribute باید تاریخی برابر با :date باشد.',
    'date_format' => 'فیلد :attribute باید با قالب :format مطابق باشد.',
    'decimal' => 'فیلد :attribute باید :decimal رقم اعشار داشته باشد.',
    'declined' => 'فیلد :attribute باید رد شود.',
    'declined_if' => 'وقتی :other برابر :value است، فیلد :attribute باید رد شود.',
    'different' => 'فیلد :attribute و :other باید متفاوت باشند.',
    'digits' => 'فیلد :attribute باید :digits رقم باشد.',
    'digits_between' => 'فیلد :attribute باید بین :min و :max رقم باشد.',
    'dimensions' => 'ابعاد تصویرِ فیلد :attribute معتبر نیست.',
    'distinct' => 'فیلد :attribute مقدار تکراری دارد.',
    'doesnt_contain' => 'فیلد :attribute نباید شامل این مقادیر باشد: :values.',
    'doesnt_end_with' => 'فیلد :attribute نباید با یکی از این مقادیر پایان یابد: :values.',
    'doesnt_start_with' => 'فیلد :attribute نباید با یکی از این مقادیر آغاز شود: :values.',
    'email' => 'فیلد :attribute باید یک نشانی ایمیل معتبر باشد.',
    'encoding' => 'فیلد :attribute باید با :encoding کدگذاری شده باشد.',
    'ends_with' => 'فیلد :attribute باید با یکی از این مقادیر پایان یابد: :values.',
    'enum' => 'مقدار انتخاب‌شده برای :attribute معتبر نیست.',
    'exists' => 'مقدار انتخاب‌شده برای :attribute معتبر نیست یا پیدا نشد.',
    'extensions' => 'فیلد :attribute باید یکی از این پسوندها را داشته باشد: :values.',
    'file' => 'فیلد :attribute باید یک پرونده باشد.',
    'filled' => 'فیلد :attribute باید مقدار داشته باشد.',
    'gt' => [
        'array' => 'تعدادِ موارد فیلد :attribute باید بیشتر از :value باشد.',
        'file' => 'حجم فیلد :attribute باید بیشتر از :value کیلوبایت باشد.',
        'numeric' => 'مقدار فیلد :attribute باید بیشتر از :value باشد.',
        'string' => 'طول فیلد :attribute باید بیشتر از :value نویسه باشد.',
    ],
    'gte' => [
        'array' => 'تعدادِ موارد فیلد :attribute باید :value یا بیشتر باشد.',
        'file' => 'حجم فیلد :attribute باید :value کیلوبایت یا بیشتر باشد.',
        'numeric' => 'مقدار فیلد :attribute باید :value یا بیشتر باشد.',
        'string' => 'طول فیلد :attribute باید :value نویسه یا بیشتر باشد.',
    ],
    'hex_color' => 'فیلد :attribute باید یک رنگ هگزادسیمال معتبر باشد.',
    'image' => 'فیلد :attribute باید یک تصویر باشد.',
    'in' => 'مقدار انتخاب‌شده برای :attribute معتبر نیست.',
    'in_array' => 'فیلد :attribute باید در :other وجود داشته باشد.',
    'in_array_keys' => 'فیلد :attribute باید دست‌کم یکی از این کلیدها را داشته باشد: :values.',
    'integer' => 'فیلد :attribute باید عدد صحیح باشد.',
    'ip' => 'فیلد :attribute باید یک نشانی IP معتبر باشد.',
    'ipv4' => 'فیلد :attribute باید یک نشانی IPv4 معتبر باشد.',
    'ipv6' => 'فیلد :attribute باید یک نشانی IPv6 معتبر باشد.',
    'json' => 'فیلد :attribute باید یک رشتهٔ JSON معتبر باشد.',
    'list' => 'فیلد :attribute باید یک فهرست باشد.',
    'lowercase' => 'فیلد :attribute باید با حروف کوچک باشد.',
    'lt' => [
        'array' => 'تعدادِ موارد فیلد :attribute باید کمتر از :value باشد.',
        'file' => 'حجم فیلد :attribute باید کمتر از :value کیلوبایت باشد.',
        'numeric' => 'مقدار فیلد :attribute باید کمتر از :value باشد.',
        'string' => 'طول فیلد :attribute باید کمتر از :value نویسه باشد.',
    ],
    'lte' => [
        'array' => 'تعدادِ موارد فیلد :attribute باید :value یا کمتر باشد.',
        'file' => 'حجم فیلد :attribute باید :value کیلوبایت یا کمتر باشد.',
        'numeric' => 'مقدار فیلد :attribute باید :value یا کمتر باشد.',
        'string' => 'طول فیلد :attribute باید :value نویسه یا کمتر باشد.',
    ],
    'mac_address' => 'فیلد :attribute باید یک نشانی MAC معتبر باشد.',
    'max' => [
        'array' => 'تعدادِ موارد فیلد :attribute نباید بیشتر از :max باشد.',
        'file' => 'حجم فیلد :attribute نباید بیشتر از :max کیلوبایت باشد.',
        'numeric' => 'مقدار فیلد :attribute نباید بیشتر از :max باشد.',
        'string' => 'طول فیلد :attribute نباید بیشتر از :max نویسه باشد.',
    ],
    'max_digits' => 'فیلد :attribute نباید بیشتر از :max رقم داشته باشد.',
    'mimes' => 'فیلد :attribute باید پرونده‌ای از این نوع باشد: :values.',
    'mimetypes' => 'فیلد :attribute باید پرونده‌ای از این نوع باشد: :values.',
    'min' => [
        'array' => 'تعدادِ موارد فیلد :attribute باید دست‌کم :min باشد.',
        'file' => 'حجم فیلد :attribute باید دست‌کم :min کیلوبایت باشد.',
        'numeric' => 'مقدار فیلد :attribute باید دست‌کم :min باشد.',
        'string' => 'طول فیلد :attribute باید دست‌کم :min نویسه باشد.',
    ],
    'min_digits' => 'فیلد :attribute باید دست‌کم :min رقم داشته باشد.',
    'missing' => 'فیلد :attribute نباید ارسال شود.',
    'missing_if' => 'وقتی :other برابر :value است، فیلد :attribute نباید ارسال شود.',
    'missing_unless' => 'فیلد :attribute نباید ارسال شود مگر آنکه :other برابر :value باشد.',
    'missing_with' => 'وقتی :values ارسال شده است، فیلد :attribute نباید ارسال شود.',
    'missing_with_all' => 'وقتی :values ارسال شده‌اند، فیلد :attribute نباید ارسال شود.',
    'multiple_of' => 'فیلد :attribute باید مضربی از :value باشد.',
    'not_in' => 'مقدار انتخاب‌شده برای :attribute معتبر نیست.',
    'not_regex' => 'قالب فیلد :attribute معتبر نیست.',
    'numeric' => 'فیلد :attribute باید عدد باشد.',
    'password' => [
        'letters' => 'فیلد :attribute باید دست‌کم یک حرف داشته باشد.',
        'mixed' => 'فیلد :attribute باید دست‌کم یک حرف بزرگ و یک حرف کوچک داشته باشد.',
        'numbers' => 'فیلد :attribute باید دست‌کم یک عدد داشته باشد.',
        'symbols' => 'فیلد :attribute باید دست‌کم یک نماد داشته باشد.',
        'uncompromised' => 'این :attribute در نشتِ داده‌ها دیده شده است؛ مقدار دیگری انتخاب کنید.',
    ],
    'present' => 'فیلد :attribute باید ارسال شود.',
    'present_if' => 'وقتی :other برابر :value است، فیلد :attribute باید ارسال شود.',
    'present_unless' => 'فیلد :attribute باید ارسال شود مگر آنکه :other برابر :value باشد.',
    'present_with' => 'وقتی :values ارسال شده است، فیلد :attribute باید ارسال شود.',
    'present_with_all' => 'وقتی :values ارسال شده‌اند، فیلد :attribute باید ارسال شود.',
    'prohibited' => 'ارسال فیلد :attribute مجاز نیست.',
    'prohibited_if' => 'وقتی :other برابر :value است، ارسال فیلد :attribute مجاز نیست.',
    'prohibited_if_accepted' => 'وقتی :other پذیرفته شده است، ارسال فیلد :attribute مجاز نیست.',
    'prohibited_if_declined' => 'وقتی :other رد شده است، ارسال فیلد :attribute مجاز نیست.',
    'prohibited_unless' => 'ارسال فیلد :attribute مجاز نیست مگر آنکه :other در :values باشد.',
    'prohibits' => 'فیلد :attribute مانع از ارسال :other می‌شود.',
    'regex' => 'قالب فیلد :attribute معتبر نیست.',
    'required' => 'فیلد :attribute الزامی است.',
    'required_array_keys' => 'فیلد :attribute باید شامل این کلیدها باشد: :values.',
    'required_if' => 'وقتی :other برابر :value است، فیلد :attribute الزامی است.',
    'required_if_accepted' => 'وقتی :other پذیرفته شده است، فیلد :attribute الزامی است.',
    'required_if_declined' => 'وقتی :other رد شده است، فیلد :attribute الزامی است.',
    'required_unless' => 'فیلد :attribute الزامی است مگر آنکه :other در :values باشد.',
    'required_with' => 'وقتی :values ارسال شده است، فیلد :attribute الزامی است.',
    'required_with_all' => 'وقتی :values ارسال شده‌اند، فیلد :attribute الزامی است.',
    'required_without' => 'وقتی :values ارسال نشده است، فیلد :attribute الزامی است.',
    'required_without_all' => 'وقتی هیچ‌یک از :values ارسال نشده است، فیلد :attribute الزامی است.',
    'same' => 'فیلد :attribute باید با :other یکسان باشد.',
    'size' => [
        'array' => 'تعدادِ موارد فیلد :attribute باید :size باشد.',
        'file' => 'حجم فیلد :attribute باید :size کیلوبایت باشد.',
        'numeric' => 'مقدار فیلد :attribute باید :size باشد.',
        'string' => 'طول فیلد :attribute باید :size نویسه باشد.',
    ],
    'starts_with' => 'فیلد :attribute باید با یکی از این مقادیر آغاز شود: :values.',
    'string' => 'فیلد :attribute باید متن باشد.',
    'timezone' => 'فیلد :attribute باید یک منطقهٔ زمانی معتبر باشد.',
    'unique' => 'این :attribute پیش‌تر ثبت شده است.',
    'uploaded' => 'بارگذاری فیلد :attribute انجام نشد.',
    'uppercase' => 'فیلد :attribute باید با حروف بزرگ باشد.',
    'url' => 'فیلد :attribute باید یک نشانی اینترنتی معتبر باشد.',
    'ulid' => 'فیلد :attribute باید یک ULID معتبر باشد.',
    'uuid' => 'فیلد :attribute باید یک UUID معتبر باشد.',

    /*
    |--------------------------------------------------------------------------
    | پیام‌های سفارشی سامانه
    |--------------------------------------------------------------------------
    */

    'custom' => [
        'deadline' => [
            'after_or_equal' => 'مهلت انجام باید برابر یا بعد از تاریخ شروع وظیفه باشد.',
        ],
        'startDate' => [
            'after_or_equal' => 'تاریخ شروع باید برابر یا بعد از مهلت انجام فعلی باشد.',
        ],
        'publishInfo.date' => [
            'date_format' => 'تاریخ انتشار باید به شکل سال-ماه-روز (مثلاً 2026-10-24) باشد.',
        ],
        'publishInfo.time' => [
            'date_format' => 'ساعت انتشار باید به شکل ساعت:دقیقه (مثلاً 09:30) باشد.',
        ],
        'publishInfo.status' => [
            'in' => 'وضعیت زمان‌بندی انتشار فقط می‌تواند «برنامه‌ریزی‌شده» یا «آماده» باشد.',
        ],
        'expectedVersion' => [
            'size' => 'نسخهٔ ارسالی با نسخهٔ سرور هم‌خوان نیست؛ صفحه را تازه کنید.',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | نام فارسی فیلدها
    |--------------------------------------------------------------------------
    |
    | بدون این نگاشت، پیام‌ها با نام فنی فیلد (مثل «projectId») نمایش داده می‌شدند
    | و کاربر نمی‌دانست کدام ورودی مشکل دارد.
    |
    */

    'attributes' => [
        // عمومی
        'name' => 'نام',
        'title' => 'عنوان',
        'description' => 'توضیحات',
        'note' => 'یادداشت',
        'reason' => 'دلیل',
        'status' => 'وضعیت',
        'type' => 'نوع',
        'date' => 'تاریخ',
        'time' => 'ساعت',
        'file' => 'پرونده',
        'files' => 'پرونده‌ها',
        'email' => 'ایمیل',
        'password' => 'رمز عبور',
        'login' => 'نام کاربری یا ایمیل',
        'code' => 'کد',
        'key' => 'کلید',
        'parentId' => 'والد',
        'managerId' => 'مدیر',
        'tags' => 'برچسب‌ها',
        'tags.*' => 'برچسب',

        // وظیفه
        'projectId' => 'پروژه',
        'contentId' => 'محتوای مرتبط',
        'contentStageId' => 'مرحلهٔ محتوا',
        'kind' => 'نوع وظیفه',
        'assigneeId' => 'مسئول انجام',
        'priority' => 'اولویت',
        'startDate' => 'تاریخ شروع',
        'deadline' => 'مهلت انجام',
        'estimatedHours' => 'برآورد زمان',
        'loggedHours' => 'زمان ثبت‌شده',
        'dependencies' => 'وابستگی‌ها',
        'dependencies.*' => 'وابستگی',
        'isBlocked' => 'مسدود بودن',
        'blockedReason' => 'دلیل مسدودی',
        'subtasks' => 'چک‌لیست',
        'subtasks.*.id' => 'شناسهٔ مورد چک‌لیست',
        'subtasks.*.title' => 'عنوان مورد چک‌لیست',
        'subtasks.*.completed' => 'انجام‌شدن مورد چک‌لیست',

        // محتوا و انتشار
        'ownerId' => 'مدیر پرونده',
        'publisherId' => 'ناشر',
        'departmentId' => 'دپارتمان',
        'seriesId' => 'مجموعه',
        'contentType' => 'نوع محتوا',
        'publishInfo' => 'اطلاعات انتشار',
        'publishInfo.date' => 'تاریخ انتشار',
        'publishInfo.time' => 'ساعت انتشار',
        'publishInfo.channels' => 'کانال‌های انتشار',
        'publishInfo.caption' => 'کپشن',
        'publishInfo.status' => 'وضعیت زمان‌بندی',
        'expectedVersion' => 'نسخهٔ سند',
        'stages' => 'مرحله‌های جریان',
        'occurrence' => 'تکرار مجموعه',

        // دارایی و جدول اطلاعات
        'cells' => 'سلول‌های ردیف',
        'cells.*' => 'سلول ردیف',
        'tableId' => 'جدول اطلاعات',
        'rowId' => 'ردیف جدول',
        'folder_id' => 'پوشه',
        'category_id' => 'دسته‌بندی',
        'confidentiality' => 'سطح محرمانگی',
        'access_grants' => 'دسترسی‌ها',
        'googleMeet' => 'جلسهٔ گوگل‌میت',
        'googleWorkspace' => 'گوگل ورک‌اسپیس',
    ],

];
