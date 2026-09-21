import { Idea, ThinkTankMeeting } from '../types';

export const INITIAL_IDEAS: Idea[] = [
  {
    id: 'idea-1',
    code: 'IDEA-101',
    title: 'یکپارچه‌سازی دستیار هوشمند تدبیر (AI Copilot) در مدیریت اسپرینت‌ها و پیش‌بینی ریسک',
    description: 'استفاده از مدل‌های هوش مصنوعی برای تحلیل داده‌های اسپرینت‌های گذشته، پیش‌بینی گلوگاه‌های تحویل تسک، پیشنهاد تخصیص خودکار وظایف بر اساس مهارت و ظرفیت اعضا، و تولید خودکار خلاصه‌های مدیریتی.',
    problemSolved: 'مدیران پروژه‌ها زمان زیادی را صرف برآورد زمان، شناسایی تاخیرها و نوشتن گزارش هفتگی می‌کنند که باعث کاهش تمرکز بر استراتژی محصول می‌شود.',
    proposedSolution: 'ایجاد یک سرویس هوش مصنوعی داخلی متصل به موتور پیش‌بینی با امکان هشدار پیش‌دستانه (Early Warning) در صورت احتمال تاخیر در Milestoneهای کلیدی.',
    creatorId: 'usr-1', // سهراب
    teamId: 'team-1',
    projectId: 'prj-1',
    convertedProjectId: undefined,
    convertedTaskId: undefined,
    priority: 'urgent',
    status: 'approved',
    tags: ['هوش مصنوعی', 'پیش‌بینی ریسک', 'اتوماسیون', 'اسپرینت'],
    assetIds: ['asset-1'],
    targetDepartment: 'مهندسی نرم‌افزار و هوش مصنوعی',
    estimatedBudget: '۱۸۰ میلیون تومان',
    estimatedEffort: '۲ اسپرینت (۴ هفته)',
    createdAt: '۱۴۰۵/۰۵/۱۰ - ۰۹:۳۰',
    updatedAt: '۱۴۰۵/۰۶/۰۸ - ۱۱:۴۵',
    hasPoll: true,
    pollQuestion: 'آیا با پایلوت‌کردن این قابلیت در پروژه بانکداری نوین موافقید؟',
    pollOptions: [
      { id: 'opt-1', text: 'بله، اولویت فوق‌العاده بالایی دارد', votes: ['usr-1', 'usr-2', 'usr-4', 'usr-11'] },
      { id: 'opt-2', text: 'بله، اما پس از اتمام بازنویسی دیتابیس', votes: ['usr-3', 'usr-5'] },
      { id: 'opt-3', text: 'خیر، نیازمند بررسی بیشتر هزینه‌های زیرساخت', votes: ['usr-6'] }
    ],
    votes: [
      { id: 'vote-1', userId: 'usr-1', option: 'agree', timestamp: '۱۴۰۵/۰۵/۱۰ - ۱۰:۰۰', comment: 'طرح بسیار استراتژیکی برای ایجاد مزیت رقابتی سامانه تدبیر است.' },
      { id: 'vote-2', userId: 'usr-2', option: 'agree', timestamp: '۱۴۰۵/۰۵/۱۱ - ۰۹:۱۵', comment: 'در صورت اتصال به گزارش‌های تحلیلی، ارزش افزوده عالی خواهد داشت.' },
      { id: 'vote-3', userId: 'usr-4', option: 'agree', timestamp: '۱۴۰۵/۰۵/۱۱ - ۱۱:۳۰', comment: 'از منظر زیرساخت و کشینگ آماده پیاده‌سازی API هستیم.' },
      { id: 'vote-4', userId: 'usr-5', option: 'agree', timestamp: '۱۴۰۵/۰۵/۱۲ - ۱۴:۲۰', comment: 'روی سناریوی رابط کاربری و نمایش پرامپت‌ها کار خواهم کرد.' },
      { id: 'vote-5', userId: 'usr-6', option: 'needs_investigation', timestamp: '۱۴۰۵/۰۵/۱۳ - ۱۶:۰۰', comment: 'نیاز به تست‌های خودکار بنچمارک دقت مدل داریم.' }
    ],
    comments: [
      {
        id: 'comm-1',
        userId: 'usr-4',
        text: 'برای کاهش Latency می‌توانیم از سیستم صف RabbitMQ و کش Redis برای پردازش‌های سنگین استفاده کنیم.',
        timestamp: '۱۴۰۵/۰۵/۱۱ - ۱۱:۳۵',
        reactions: [{ emoji: '🔥', userIds: ['usr-1', 'usr-2'], count: 2 }]
      },
      {
        id: 'comm-2',
        userId: 'usr-5',
        text: 'یک پنل شناور (Floating Panel) در گوشه بردهای کانبان برای دستیار هوش مصنوعی طراحی خواهم کرد.',
        timestamp: '۱۴۰۵/۰۵/۱۲ - ۱۵:۰۰',
        replyToId: 'comm-1',
        replyToAuthor: 'داوود کیانی',
        replyToText: 'برای کاهش Latency می‌توانیم از سیستم صف RabbitMQ...',
        reactions: [{ emoji: '👍', userIds: ['usr-1', 'usr-4', 'usr-10'], count: 3 }]
      },
      {
        id: 'comm-3',
        userId: 'usr-1',
        text: 'در جلسه هیئت مدیره این ایده تصویب شد و به زودی به فاز طراحی تفصیلی و تسک‌های اجرایی تبدیل می‌شود.',
        timestamp: '۱۴۰۵/۰۶/۰۸ - ۱۱:۴۵',
        reactions: [{ emoji: '🎉', userIds: ['usr-2', 'usr-3', 'usr-4', 'usr-5'], count: 4 }]
      }
    ],
    activities: [
      { id: 'act-1', userId: 'usr-1', action: 'ایده را با عنوان "یکپارچه‌سازی دستیار هوشمند تدبیر" ثبت کرد.', timestamp: '۱۴۰۵/۰۵/۱۰ - ۰۹:۳۰', type: 'edit' },
      { id: 'act-2', userId: 'usr-1', action: 'نظرسنجی ارزیابی را اضافه کرد.', timestamp: '۱۴۰۵/۰۵/۱۰ - ۰۹:۴۰', type: 'vote' },
      { id: 'act-3', userId: 'usr-1', action: 'وضعیت ایده را به «تصویب‌شده» تغییر داد.', timestamp: '۱۴۰۵/۰۶/۰۸ - ۱۱:۴۵', type: 'status_change', details: 'تصویب در جلسه اتاق فکر شماره ۳' }
    ]
  },
  {
    id: 'idea-2',
    code: 'IDEA-102',
    title: 'پیاده‌سازی حالت آفلاین و سینک خودکار داده‌ها (PWA Offline First) در تدبیر',
    description: 'ایجاد قابلیت ثبت فعالیت، افزودن تسک و یادداشت‌ها بدون نیاز به اینترنت فعال با استفاده از Service Workers و IndexedDB محلی، و سینک هوشمند هنگام اتصال مجدد.',
    problemSolved: 'کاربران هنگام حضور در جلسات، ماموریت‌ها یا قطعی مقطعی اینترنت دسترسی به ثبت اطلاعات سازمانی را از دست می‌دهند.',
    proposedSolution: 'طراحی لایه کش محلی با الگوریتم حل تعارض (CRDT یا Last-Write-Wins) برای همگام‌سازی بی‌درنگ پس از آنلاین شدن.',
    creatorId: 'usr-4', // داوود کیانی
    teamId: 'team-1',
    priority: 'high',
    status: 'in_progress',
    tags: ['آفلاین', 'PWA', 'همگام‌سازی', 'معماری'],
    assetIds: [],
    targetDepartment: 'تیم زیرساخت و فرانت‌اند',
    estimatedBudget: '۹۵ میلیون تومان',
    estimatedEffort: '۳ هفته کاری',
    createdAt: '۱۴۰۵/۰۵/۱۸ - ۱۱:۱۵',
    updatedAt: '۱۴۰۵/۰۶/۰۱ - ۱۶:۳۰',
    hasPoll: false,
    votes: [
      { id: 'vote-6', userId: 'usr-4', option: 'agree', timestamp: '۱۴۰۵/۰۵/۱۸ - ۱۱:۲۰', comment: 'زیرساخت پایه‌ای برای نرم‌افزار سازمانی مدرن است.' },
      { id: 'vote-7', userId: 'usr-10', option: 'agree', timestamp: '۱۴۰5/۰۵/۱۹ - ۰۹:۰۰', comment: 'نشانگر وضعیت اتصال (Online/Offline) را در هدر طراحی می‌کنم.' },
      { id: 'vote-8', userId: 'usr-2', option: 'agree', timestamp: '۱۴۰۵/۰۵/۲۰ - ۱۲:۰۰', comment: 'برای پروژه‌های کارگاهی و میدانی حیاتی است.' }
    ],
    comments: [
      {
        id: 'comm-4',
        userId: 'usr-10',
        text: 'برای حفظ تجربه کاربری، اعلان صوتی یا نوتیفیکیشن ملایم وضعیت آنلاین شدن بسیار کارساز خواهد بود.',
        timestamp: '۱۴۰۵/۰۵/۲۲ - ۱۰:۱۵'
      }
    ],
    activities: [
      { id: 'act-4', userId: 'usr-4', action: 'ایده را ثبت کرد.', timestamp: '۱۴۰۵/۰۵/۱۸ - ۱۱:۱۵', type: 'edit' },
      { id: 'act-5', userId: 'usr-1', action: 'وضعیت ایده را به «در حال اجرا» ارتقا داد.', timestamp: '۱۴۰۵/۰۶/۰۱ - ۱۶:۳۰', type: 'status_change' }
    ]
  },
  {
    id: 'idea-3',
    code: 'IDEA-103',
    title: 'سیستم دیزاین توکن‌های پویا (Design Tokens) برای سفارشی‌سازی تم سازمان‌ها',
    description: 'امکان تعریف هویت بصری، رنگ سازمانی، تایپوگرافی و لوگوی اختصاصی برای هر مشتری سازمانی به صورت White-label بدون نیاز به تغییر در کد منبع.',
    problemSolved: 'مشتریان سازمانی کلان خواهان هویت بصری منطبق بر برندبوک خود در پلتفرم هستند.',
    proposedSolution: 'تعریف متغیرهای CSS و استخراج توکن‌های استایل از طریق پنل تنظیمات پیشرفته با پیش‌نمایش زنده.',
    creatorId: 'usr-5', // النا رستمی
    teamId: 'team-3',
    priority: 'medium',
    status: 'under_review',
    tags: ['طراحی', 'سیستم دیزاین', 'White-label', 'شخصی‌سازی'],
    assetIds: [],
    targetDepartment: 'تیم طراحی محصول',
    estimatedBudget: '۵۰ میلیون تومان',
    estimatedEffort: '۲ هفته',
    createdAt: '۱۴۰۵/۰۵/۲۵ - ۱۴:۴۵',
    updatedAt: '۱۴۰۵/۰۶/۰۵ - ۱۰:۲۰',
    hasPoll: true,
    pollQuestion: 'آیا اولویت این قابلیت برای مشتریان Enterprise بیشتر از دارک‌مود است؟',
    pollOptions: [
      { id: 'opt-d1', text: 'بله، ارزش تجاری و بازاریابی بسیار بالاتری دارد', votes: ['usr-12', 'usr-7', 'usr-1'] },
      { id: 'opt-d2', text: 'خیر، دارک‌مود تقاضای عمومی بالاتری دارد', votes: ['usr-6', 'usr-11'] }
    ],
    votes: [
      { id: 'vote-9', userId: 'usr-5', option: 'agree', timestamp: '۱۴۰۵/۰۵/۲۵ - ۱۵:۰۰' },
      { id: 'vote-10', userId: 'usr-12', option: 'agree', timestamp: '۱۴۰۵/۰۵/۲۶ - ۱۰:۳۰', comment: 'در جلسات پرزنت فروش سازمانی بسیار تاثیرگذار است.' }
    ],
    comments: [],
    activities: [
      { id: 'act-6', userId: 'usr-5', action: 'ایده را ثبت کرد.', timestamp: '۱۴۰۵/۰۵/۲۵ - ۱۴:۴۵', type: 'edit' }
    ]
  },
  {
    id: 'idea-4',
    code: 'IDEA-104',
    title: 'ماژول ارزیابی عملکرد و پاداش‌دهی گیمیفیکیشن (Kudos & Badges) برای انگیزش تیم‌ها',
    description: 'ایجاد سیستم امتیازدهی شفاف به اعضای تیم به پاس تحویل به موقع تسک‌ها، کمک به سایر همکاران در حل چالش‌ها و مشارکت موثر در اتاق فکر.',
    problemSolved: 'کاهش انگیزه در اسپرینت‌های فشرده و عدم دیده‌شدن مشارکت‌های غیررسمی مانند راهنمایی فنی و ثبت ایده‌ها.',
    proposedSolution: 'اهدای نشان‌های افتخار ماهانه (Top Innovator, Bug Hunter, Team Player) همراه با امکان تبدیل امتیاز به بن‌های رفاهی.',
    creatorId: 'usr-3', // پروانه حسینی
    teamId: 'team-2',
    priority: 'medium',
    status: 'submitted',
    tags: ['منابع انسانی', 'گیمیفیکیشن', 'انگیزش', 'فرهنگ سازمانی'],
    assetIds: [],
    targetDepartment: 'توسعه سرمایه انسانی و محصول',
    estimatedBudget: '۳۰ میلیون تومان',
    estimatedEffort: '۲ هفته',
    createdAt: '۱۴۰۵/۰۶/۰۲ - ۰۹:۰۰',
    updatedAt: '۱۴۰۵/۰۶/۰۲ - ۰۹:۰۰',
    hasPoll: false,
    votes: [
      { id: 'vote-11', userId: 'usr-3', option: 'agree', timestamp: '۱۴۰۵/۰۶/۰۲ - ۰۹:۱۰' },
      { id: 'vote-12', userId: 'usr-7', option: 'agree', timestamp: '۱۴۰۵/۰۶/۰۳ - ۱۳:۰۰' }
    ],
    comments: [
      {
        id: 'comm-5',
        userId: 'usr-2',
        text: 'ایده بسیار جالبی است؛ می‌توانیم لیدربورد ماهانه را در داشبورد اصلی نمایش دهیم.',
        timestamp: '۱۴۰۵/۰۶/۰۴ - ۱۶:۴۰'
      }
    ],
    activities: [
      { id: 'act-7', userId: 'usr-3', action: 'ایده را ثبت کرد.', timestamp: '۱۴۰۵/۰۶/۰۲ - ۰۹:۰۰', type: 'edit' }
    ]
  },
  {
    id: 'idea-5',
    code: 'IDEA-105',
    title: 'معماری چندمستاجری (Multi-Tenancy) ابری و ایزوله‌سازی داده‌های مشتریان بانکی',
    description: 'ارتقای پایگاه داده به معماری Row-Level Security و دیتابیس‌های ایزوله به ازای هر هلدینگ بزرگ جهت رعایت استانداردهای افتا و بانک مرکزی.',
    problemSolved: 'موانع حقوقی و الزامات امنیتی مشتریان حوزه مالی برای استقرار ابری در محیط‌های مشترک.',
    proposedSolution: 'ایجاد لایه Tenant-Routing خودکار در سطوح API Gateway و Connection Pool دیتابیس PostgreSQL.',
    creatorId: 'usr-11', // علی احمدی
    teamId: 'team-1',
    priority: 'urgent',
    status: 'needs_info',
    tags: ['امنیت', 'بانکداری', 'چندمستاجری', 'زیرساخت'],
    assetIds: [],
    targetDepartment: 'تیم امنیت و زیرساخت شبکه',
    estimatedBudget: '۲۲۰ میلیون تومان',
    estimatedEffort: '۶ هفته',
    createdAt: '۱۴۰۵/۰۵/۰۱ - ۱۱:۳۰',
    updatedAt: '۱۴۰۵/۰۵/۲۸ - ۱۰:۰۰',
    hasPoll: false,
    votes: [
      { id: 'vote-13', userId: 'usr-11', option: 'agree', timestamp: '۱۴۰۵/۰۵/۰۱ - ۱۱:۴۵' },
      { id: 'vote-14', userId: 'usr-6', option: 'agree', timestamp: '۱۴۰۵/۰۵/۰۲ - ۱۵:۲۰' }
    ],
    comments: [
      {
        id: 'comm-6',
        userId: 'usr-1',
        text: 'لطفاً مقایسه فنی بین رویکرد Schema-per-tenant و Database-per-tenant را در مستندات پیوست کنید تا در جلسه تصمیم‌گیری شود.',
        timestamp: '۱۴۰۵/۰۵/۲۸ - ۱۰:۰۰'
      }
    ],
    activities: [
      { id: 'act-8', userId: 'usr-11', action: 'ایده را ثبت کرد.', timestamp: '۱۴۰۵/۰۵/۰۱ - ۱۱:۳۰', type: 'edit' },
      { id: 'act-9', userId: 'usr-1', action: 'وضعیت ایده را به «نیازمند اطلاعات تکمیلی» تغییر داد.', timestamp: '۱۴۰۵/۰۵/۲۸ - ۱۰:۰۰', type: 'status_change' }
    ]
  },
  {
    id: 'idea-6',
    code: 'IDEA-106',
    title: 'اپلیکیشن موبایل بومی Flutter برای مدیریت سریع وظایف و مصوبات مدیران',
    description: 'توسعه کلاینت موبایل سبک با پشتیبانی از اعلان‌های فشاری (Push Notification) بلادرنگ و قابلیت تایید کارتابل با حسگر بیومتریک (اثر انگشت و چهره).',
    problemSolved: 'مدیران ارشد در سفر و خارج از سازمان برای تایید سریع مکاتبات و مصوبات نیازمند ابزار موبایلی سریع و امن هستند.',
    proposedSolution: 'ساخت اپلیکیشن نیتیو با Flutter متصل به وب‌سرویس‌های RESTful و WebSocket سامانه تدبیر.',
    creatorId: 'usr-2', // بهاره رهنما
    teamId: 'team-1',
    priority: 'high',
    status: 'implemented',
    tags: ['موبایل', 'فلاتر', 'نوتیفیکیشن', 'کارتابل'],
    assetIds: [],
    targetDepartment: 'تیم توسعه موبایل',
    estimatedBudget: '۱۴۰ میلیون تومان',
    estimatedEffort: '۴ اسپرینت',
    createdAt: '۱۴۰۴/۱۱/۱۰ - ۱۰:۰۰',
    updatedAt: '۱۴۰۵/۰۴/۱۵ - ۱۸:۰۰',
    hasPoll: false,
    votes: [
      { id: 'vote-15', userId: 'usr-2', option: 'agree', timestamp: '۱۴۰۴/۱۱/۱۰ - ۱۰:۱۵' },
      { id: 'vote-16', userId: 'usr-1', option: 'agree', timestamp: '۱۴۰۴/۱۱/۱۱ - ۰۹:۰۰' }
    ],
    comments: [
      {
        id: 'comm-7',
        userId: 'usr-1',
        text: 'این ایده با موفقیت پیاده‌سازی و در بازارهای داخلی منتشر شد و بازخورد مدیران بسیار مثبت بود.',
        timestamp: '۱۴۰۵/۰۴/۱۵ - ۱۸:۰۰'
      }
    ],
    activities: [
      { id: 'act-10', userId: 'usr-2', action: 'ایده را ثبت کرد.', timestamp: '۱۴۰۴/۱۱/۱۰ - ۱۰:۰۰', type: 'edit' },
      { id: 'act-11', userId: 'usr-1', action: 'وضعیت را به «پیاده‌سازی‌شده» تغییر داد.', timestamp: '۱۴۰۵/۰۴/۱۵ - ۱۸:۰۰', type: 'status_change' }
    ]
  }
];

export const INITIAL_THINK_TANK_MEETINGS: ThinkTankMeeting[] = [
  {
    id: 'ttm-1',
    title: 'جلسه راهبردی ارزیابی ایده‌های هوش مصنوعی و معماری ابری ۱۴۰۵',
    description: 'بررسی کارشناسی ایده‌های مطرح شده پیرامون ادغام موتور هوش مصنوعی و مقیاس‌پذیری زیرساخت تدبیر.',
    date: '۱۴۰۵/۰۶/۱۵',
    time: '۱۰:۰۰',
    duration: '۹۰ دقیقه',
    organizerId: 'usr-1',
    attendeeIds: ['usr-1', 'usr-2', 'usr-4', 'usr-5', 'usr-11'],
    status: 'scheduled',
    locationType: 'hybrid',
    locationDetails: 'اتاق جلسات VIP طبقه ۴ + لینک گوگل میت',
    relatedIdeaIds: ['idea-1', 'idea-5'],
    agenda: [
      {
        id: 'ag-1',
        title: 'مرور فیدبک‌های تیم فنی در خصوص Latency و پردازش هوش مصنوعی',
        durationMinutes: 25,
        presenterId: 'usr-4',
        completed: false,
        relatedIdeaId: 'idea-1'
      },
      {
        id: 'ag-2',
        title: 'بررسی الزامات امنیتی افتا برای معماری چندمستاجری',
        durationMinutes: 35,
        presenterId: 'usr-11',
        completed: false,
        relatedIdeaId: 'idea-5'
      },
      {
        id: 'ag-3',
        title: 'تصمیم‌گیری نهایی و تبدیل ایده‌ها به اسپرینت اجرایی',
        durationMinutes: 30,
        presenterId: 'usr-1',
        completed: false
      }
    ],
    decisions: [],
    actionItems: [
      {
        id: 'ai-1',
        title: 'تهیه پروپوزال فنی اتصال API هوش مصنوعی به سرور ابری',
        assigneeId: 'usr-4',
        deadline: '۱۴۰۵/۰۶/۱۸',
        status: 'pending'
      }
    ],
    createdAt: '۱۴۰۵/۰۶/۰۵'
  },
  {
    id: 'ttm-2',
    title: 'کارگاه بارش فکری بهبود تجربه کاربری و آنبوردینگ مشتریان',
    description: 'شناسایی نقاط اصطکاک (Friction Points) در ورود اعضای جدید و بازطراحی المان‌های آموزشی درون‌برنامه‌ای.',
    date: '۱۴۰۵/۰۶/۰۲',
    time: '۱۴:۳۰',
    duration: '۶۰ دقیقه',
    organizerId: 'usr-5',
    attendeeIds: ['usr-5', 'usr-3', 'usr-7', 'usr-10', 'usr-12'],
    status: 'completed',
    locationType: 'in_person',
    locationDetails: 'سالن نوآوری و طراحی',
    relatedIdeaIds: ['idea-3', 'idea-4'],
    agenda: [
      {
        id: 'ag-4',
        title: 'تحلیل داده‌های خروج کاربر در ۵ دقیقه اول ثبت‌نام',
        durationMinutes: 20,
        presenterId: 'usr-7',
        completed: true
      },
      {
        id: 'ag-5',
        title: 'نمایش وایرفریم‌های اولیه تور مجازی و سیستم نشان‌ها',
        durationMinutes: 40,
        presenterId: 'usr-5',
        completed: true
      }
    ],
    minutesSummary: 'در این جلسه نتایج مصاحبه با ۱۰ مشتری سازمانی مرور شد. مقرر گردید تور تعاملی آنبوردینگ در قالب ۳ مرحله کوتاه و جذاب با المان‌های گیمیفیکیشن پیاده‌سازی شود.',
    decisions: [
      'تصویب پیاده‌سازی تور مجازی ۳ مرحله‌ای در اولین ورود کاربران',
      'یکپارچه‌سازی سیستم امتیازدهی با فعالیت‌های ثبت تسک'
    ],
    actionItems: [
      {
        id: 'ai-2',
        title: 'طراحی پروتوتایپ فیگما برای نشان‌های گیمیفیکیشن',
        assigneeId: 'usr-5',
        deadline: '۱۴۰۵/۰۶/۱۰',
        status: 'completed'
      },
      {
        id: 'ai-3',
        title: 'تهیه متون راهنمای فارسی کوتاه برای استپ‌های آنبوردینگ',
        assigneeId: 'usr-7',
        deadline: '۱۴۰۵/۰۶/۰۸',
        status: 'completed'
      }
    ],
    createdAt: '۱۴۰۵/۰۵/۲۸'
  }
];
