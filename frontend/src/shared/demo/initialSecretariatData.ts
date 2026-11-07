import { SecretariatLetter, SecretariatResolution, ArchiveDossier } from '../types';

export const INITIAL_LETTERS: SecretariatLetter[] = [
  {
    id: 'let-1',
    letterNumber: 'وارده: دب-۱۴۰۵/۳۴۲',
    indicatNumber: '۱۴۰۵/۳۴۲',
    type: 'incoming',
    subject: 'درخواست رسمی ارتقای زیرساخت امنیتی و تست نفوذ دوره‌ای پلتفرم تدبیر',
    content: 'احتراماً پیرو تفاهم‌نامه همکاری فیمابین در خصوص بهره‌برداری از سامانه مدیریت پروژه تدبیر، خواهشمند است دستور فرمایید گزارش جامع آخرین آزمون‌های آسیب‌پذیری و الزامات انطباق با پروتکل‌های مرکز ماهر و افتا حداکثر ظرف مدت ۱۰ روز کاری به این سازمان ارسال گردد.',
    sender: 'سازمان فناوری اطلاعات و ارتباطات شهرداری تهران',
    recipient: 'مدیریت عامل سامانه تدبیر - جناب آقای سهراب سپهری',
    recipientUserId: 'usr-1',
    ccList: ['معاونت محترم فنی و مهندسی', 'واحد بازرسی و نظارت'],
    date: '۱۴۰۵/۰۶/۰۸',
    registeredAt: '۱۴۰۵/۰۶/۰۸ - ساعت ۰۹:۱۵',
    classification: 'confidential',
    urgency: 'urgent',
    status: 'in_progress',
    responseDeadline: '۱۴۰۵/۰۶/۱۸',
    assetIds: ['asset-1'],
    tags: ['امنیت', 'تست نفوذ', 'شهرداری', 'افتا'],
    archiveDossierId: 'dos-sec-1',
    archiveBox: 'زونکن امنیتی شماره ۱۲',
    referrals: [
      {
        id: 'ref-1',
        letterId: 'let-1',
        fromUserId: 'usr-1',
        toUserId: 'usr-4',
        department: 'تیم زیرساخت و مهندسی نرم‌افزار',
        actionType: 'action',
        instructions: 'جناب کیانی، لطفاً مستندات مربوط به فایروال و گواهی SSL و گزارش تست امنیت به همراه پاسخ رسمی تدوین گردد.',
        deadline: '۱۴۰۵/۰۶/۱۴',
        status: 'in_progress',
        timestamp: '۱۴۰۵/۰۶/۰۸ - ۱۰:۳۰'
      },
      {
        id: 'ref-2',
        letterId: 'let-1',
        fromUserId: 'usr-1',
        toUserId: 'usr-6',
        department: 'تضمین کیفیت و تست',
        actionType: 'review',
        instructions: 'مهندس شریفی، چک‌لیست آخرین پچ‌های امنیتی را ضمیمه پرونده نمایید.',
        deadline: '۱۴۰۵/۰۶/۱۳',
        status: 'completed',
        responseNotes: 'چک‌لیست به‌روزرسانی بسته‌های امنیتی و گزارش Playwright آماده و ضمیمه شد.',
        completedAt: '۱۴۰۵/۰۶/۱۰ - ۱۴:۰۰',
        timestamp: '۱۴۰۵/۰۶/۰۸ - ۱۰:۳۵'
      }
    ],
    workflow: [
      {
        id: 'wf-1',
        userId: 'usr-3',
        stageName: 'ثبت در دبیرخانه',
        action: 'نامه وارده با شماره اندیکاتور ۱۴۰۵/۳۴۲ ثبت و به کارتابل مدیریت ارسال شد.',
        timestamp: '۱۴۰۵/۰۶/۰۸ - ۰۹:۱۵',
        status: 'completed'
      },
      {
        id: 'wf-2',
        userId: 'usr-1',
        stageName: 'دستور مدیریت',
        action: 'مشاهده و ارجاع به مهندسی زیرساخت و تضمین کیفیت جهت اقدام فوری.',
        timestamp: '۱۴۰۵/۰۶/۰۸ - ۱۰:۳۰',
        status: 'completed'
      },
      {
        id: 'wf-3',
        userId: 'usr-4',
        stageName: 'تهیه پاسخ فنی',
        action: 'در حال جمع‌آوری گزارش‌های نفوذپذیری و لاگ‌های سرور.',
        timestamp: '۱۴۰۵/۰۶/۰۹ - ۱۱:۰۰',
        status: 'current'
      }
    ],
    createdAt: '۱۴۰۵/۰۶/۰۸ - ۰۹:۱۵',
    updatedAt: '۱۴۰۵/۰۶/۱۰ - ۱۴:۰۰'
  },
  {
    id: 'let-2',
    letterNumber: 'وارده: دب-۱۴۰۵/۳۳۹',
    indicatNumber: '۱۴۰۵/۳۳۹',
    type: 'incoming',
    subject: 'اعلام رضایت‌مندی و درخواست تمدید قرارداد سالانه لایسنس انترپرایز',
    content: 'با عنایت به عملکرد مطلوب سامانه تدبیر در تسهیل فرآیندهای بین‌بخشی این شرکت، بدین‌وسیله تمایل خود را جهت تمدید قرارداد پشتیبانی و خرید ۵۰ کاربر اضافه اعلام می‌دارد. خواهشمند است پیش‌فاکتور رسمی را ارسال نمایید.',
    sender: 'شرکت سرمایه‌گذاری توسعه معادن و فلزات ایران',
    recipient: 'واحد فروش و امور قراردادهای سامانه تدبیر',
    recipientUserId: 'usr-12',
    date: '۱۴۰۵/۰۶/۰۵',
    registeredAt: '۱۴۰۵/۰۶/۰۵ - ساعت ۱۱:۰۰',
    classification: 'normal',
    urgency: 'normal',
    status: 'answered',
    responseDeadline: '۱۴۰۵/۰۶/۱۲',
    assetIds: [],
    tags: ['قرارداد', 'فروش', 'تمدید', 'مشتری'],
    archiveDossierId: 'dos-con-1',
    archiveBox: 'زونکن قراردادهای ۱۴۰۵',
    referrals: [
      {
        id: 'ref-3',
        letterId: 'let-2',
        fromUserId: 'usr-1',
        toUserId: 'usr-12',
        department: 'رشد و مارکتینگ',
        actionType: 'response',
        instructions: 'سرکار خانم محمدی، پیش‌فاکتور با تخفیف وفاداری سازمانی صادر و ارسال گردد.',
        deadline: '۱۴۰۵/۰۶/۰۷',
        status: 'completed',
        responseNotes: 'پیش‌فاکتور شماره ۱۴۰۵-۸۸ با شماره نامه صادره صاد-۱۴۰۵/۰۸۲ ارسال گردید.',
        completedAt: '۱۴۰۵/۰۶/۰۶ - ۱۶:۳۰',
        timestamp: '۱۴۰۵/۰۶/۰۵ - ۱۱:۳۰'
      }
    ],
    workflow: [
      {
        id: 'wf-4',
        userId: 'usr-3',
        stageName: 'ثبت در دبیرخانه',
        action: 'ثبت نامه و ارجاع به مدیرعامل.',
        timestamp: '۱۴۰۵/۰۶/۰۵ - ۱۱:۰۰',
        status: 'completed'
      },
      {
        id: 'wf-5',
        userId: 'usr-12',
        stageName: 'صدور پاسخ',
        action: 'ارسال پیش‌فاکتور رسمی به انضمام کاتالوگ قابلیت‌های جدید.',
        timestamp: '۱۴۰۵/۰۶/۰۶ - ۱۶:۳۰',
        status: 'completed'
      }
    ],
    createdAt: '۱۴۰۵/۰۶/۰۵ - ۱۱:۰۰',
    updatedAt: '۱۴۰۵/۰۶/۰۶ - ۱۶:۳۰'
  },
  {
    id: 'let-3',
    letterNumber: 'وارده: دب-۱۴۰۵/۳۳۱',
    indicatNumber: '۱۴۰۵/۳۳۱',
    type: 'incoming',
    subject: 'دعوت به شرکت در مناقصه عمومی تجهیز مراکز داده و اتوماسیون پروژه‌های ملی',
    content: 'بدین‌وسیله از شرکت محترم سامانه تدبیر دعوت به عمل می‌آید جهت دریافت اسناد مناقصه عمومی یکپارچه‌سازی پروژه‌های راهبردی کشور به سامانه ستاد ایران مراجعه و پیشنهادات فنی و مالی خود را ثبت نمایند.',
    sender: 'وزارت ارتباطات و فناوری اطلاعات',
    recipient: 'مدیریت محترم عامل',
    recipientUserId: 'usr-1',
    date: '۱۴۰۵/۰۵/۲۸',
    registeredAt: '۱۴۰۵/۰۵/۲۸ - ساعت ۰۸:۳۰',
    classification: 'normal',
    urgency: 'urgent',
    status: 'archived',
    responseDeadline: '۱۴۰۵/۰۶/۰۵',
    assetIds: [],
    tags: ['مناقصه', 'دولتی', 'ستاد'],
    archiveDossierId: 'dos-adm-1',
    archiveBox: 'بایگانی مناقصات ۱۴۰۵',
    referrals: [],
    workflow: [
      {
        id: 'wf-6',
        userId: 'usr-3',
        stageName: 'ثبت و بایگانی',
        action: 'اسناد دریافت و در پوشه مناقصات دولتی ذخیره شد.',
        timestamp: '۱۴۰۵/۰۵/۲۸ - ۰۸:۳۰',
        status: 'completed'
      }
    ],
    createdAt: '۱۴۰۵/۰۵/۲۸ - ۰۸:۳۰',
    updatedAt: '۱۴۰۵/۰۶/۰۵ - ۱۷:۰۰'
  },
  {
    id: 'let-4',
    letterNumber: 'صادره: صاد-۱۴۰۵/۰۸۲',
    indicatNumber: 'صاد-۱۴۰۵/۰۸۲',
    type: 'outgoing',
    subject: 'ارسال پیش‌فاکتور رسمی و جدول خدمات پشتیبانی VIP سال ۱۴۰۵',
    content: 'عطف به نامه وارده شماره دب-۱۴۰۵/۳۳۹، بدین‌وسیله به پیوست پیش‌فاکتور تمدید قرارداد سرویس‌های سازمانی سامانه تدبیر به همراه شرایط تخفیف وفاداری ۱۰ درصدی و بسته پشتیبانی ۲۴/۷ به حضور ارسال می‌گردد.',
    sender: 'شرکت سامانه مدیریت پروژه تدبیر',
    senderUserId: 'usr-12',
    recipient: 'مدیریت محترم عامل شرکت سرمایه‌گذاری توسعه معادن و فلزات ایران',
    date: '۱۴۰۵/۰۶/۰۶',
    registeredAt: '۱۴۰۵/۰۶/۰۶ - ساعت ۱۶:۰۰',
    classification: 'normal',
    urgency: 'normal',
    status: 'sent',
    relatedLetterId: 'let-2',
    assetIds: ['asset-2'],
    tags: ['صادره', 'پیش‌فاکتور', 'قرارداد'],
    archiveDossierId: 'dos-con-1',
    referrals: [],
    workflow: [
      {
        id: 'wf-7',
        userId: 'usr-12',
        stageName: 'تهیه پیش‌نویس',
        action: 'نگارش متن و پیوست پیش‌فاکتور رسمی.',
        timestamp: '۱۴۰۵/۰۶/۰۶ - ۱۴:۰۰',
        status: 'completed'
      },
      {
        id: 'wf-8',
        userId: 'usr-1',
        stageName: 'تأیید و امضا',
        action: 'امضای الکترونیک نامه توسط مدیرعامل.',
        timestamp: '۱۴۰۵/۰۶/۰۶ - ۱۵:۳۰',
        status: 'completed'
      },
      {
        id: 'wf-9',
        userId: 'usr-3',
        stageName: 'ارسال دبیرخانه',
        action: 'صدور شماره نامه و ارسال پستی و ایمیلی به مخاطب.',
        timestamp: '۱۴۰۵/۰۶/۰۶ - ۱۶:۳۰',
        status: 'completed'
      }
    ],
    createdAt: '۱۴۰۵/۰۶/۰۶ - ۱۴:۰۰',
    updatedAt: '۱۴۰۵/۰۶/۰۶ - ۱۶:۳۰'
  },
  {
    id: 'let-5',
    letterNumber: 'صادره: صاد-۱۴۰۵/۰۸۵',
    indicatNumber: 'صاد-۱۴۰۵/۰۸۵',
    type: 'outgoing',
    subject: 'گزارش اقدامات ارتقای امنیت و رفع آسیب‌پذیری‌های اعلامی',
    content: 'پیرو مذاکرات انجام‌شده، گزارش اقدامات اصلاحی انجام گرفته بر روی وب‌سرویس‌های سامانه تدبیر به انضمام نتایج اسکن OWASP ZAP جهت استحضار تقدیم می‌گردد.',
    sender: 'معاونت فنی و زیرساخت سامانه تدبیر',
    senderUserId: 'usr-4',
    recipient: 'ریاست محترم مرکز امنیت اطلاعات سازمان فناوری شهرداری',
    date: '۱۴۰۵/۰۶/۱۰',
    registeredAt: '۱۴۰۵/۰۶/۱۰ - ساعت ۱۱:۲۰',
    classification: 'confidential',
    urgency: 'urgent',
    status: 'under_review',
    relatedLetterId: 'let-1',
    assetIds: [],
    tags: ['صادره', 'امنیت', 'گزارش'],
    archiveDossierId: 'dos-sec-1',
    referrals: [],
    workflow: [
      {
        id: 'wf-10',
        userId: 'usr-4',
        stageName: 'پیش‌نویس',
        action: 'نگارش گزارش فنی و ضمیمه فایل‌ها.',
        timestamp: '۱۴۰۵/۰۶/۱۰ - ۱۱:۲۰',
        status: 'completed'
      },
      {
        id: 'wf-11',
        userId: 'usr-1',
        stageName: 'بررسی مدیریت',
        action: 'در حال بررسی نهایی قبل از ابلاغ رسمی.',
        timestamp: '۱۴۰۵/۰۶/۱۰ - ۱۲:۰۰',
        status: 'current'
      }
    ],
    createdAt: '۱۴۰۵/۰۶/۱۰ - ۱۱:۲۰',
    updatedAt: '۱۴۰۵/۰۶/۱۰ - ۱۲:۰۰'
  }
];

export const INITIAL_RESOLUTIONS: SecretariatResolution[] = [
  {
    id: 'res-1',
    code: 'مصوبه هیئت مدیره م-۱۴۰۵/۱۸',
    title: 'تخصیص بودجه و آغاز فاز اجرایی زیرساخت هوش مصنوعی تدبیر (AI Copilot)',
    date: '۱۴۰۵/۰۶/۰۱',
    meetingTitle: 'جلسه پنجاه و دوم هیئت مدیره',
    content: 'هیئت مدیره با اتفاق آرا طرح توسعه دستیار هوشمند تدبیر را به عنوان پروژه اولویت اول سال ۱۴۰۵ به تصویب رساند. مقرر شد مبلغ ۱۸۰ میلیون تومان از محل بودجه تحقیق و توسعه به این پروژه تخصیص یابد.',
    responsibleUserId: 'usr-1', // سهراب سپهری
    department: 'مهندسی و فناوری اطلاعات',
    deadline: '۱۴۰۵/۰۷/۱۵',
    status: 'in_progress',
    taskIds: ['tsk-1'],
    notes: 'پایلوت اولیه باید تا انتهای شهریور ماه روی محیط استیجینگ راه‌اندازی شود.',
    createdAt: '۱۴۰۵/۰۶/۰۱'
  },
  {
    id: 'res-2',
    code: 'مصوبه اداری م-۱۴۰۵/۱۹',
    title: 'تصویب آیین‌نامه کاری شناور و روزهای دورکاری تیم‌های مهندسی',
    date: '۱۴۰۵/۰۵/۱۵',
    meetingTitle: 'کمیته مدیریت منابع انسانی',
    content: 'بر اساس این مصوبه، کلیه اعضای تیم‌های فنی و طراحی مجاز به استفاده از ۲ روز دورکاری در هفته با هماهنگی سرپرست تیم و ثبت پیشرفت روزانه در سامانه تدبیر می‌باشند.',
    responsibleUserId: 'usr-3', // پروانه حسینی
    department: 'سرمایه انسانی و اداری',
    deadline: '۱۴۰۵/۰۵/۲۰',
    status: 'implemented',
    taskIds: [],
    notes: 'بخشنامه به تمامی همکاران از طریق پیام‌رسان داخلی و ایمیل ابلاغ گردید.',
    createdAt: '۱۴۰۵/۰۵/۱۵'
  },
  {
    id: 'res-3',
    code: 'مصوبه مالی م-۱۴۰۵/۲۰',
    title: 'ارتقای ظرفیت سرورهای پردازشی و خرید تجهیزات شبکه',
    date: '۱۴۰۵/۰۶/۰۴',
    meetingTitle: 'کمیته راهبری زیرساخت',
    content: 'خرید ۳ دستگاه سرور اختصاصی ابری در دیتابیس آسیاتک جهت میزبانی داده‌های مشتریان بانکی و ارتقای پهنای باند شبکه تا ۱۰ گیگابیت بر ثانیه.',
    responsibleUserId: 'usr-4', // داوود کیانی
    department: 'تیم زیرساخت و دوآپس',
    deadline: '۱۴۰۵/۰۶/۲۵',
    status: 'in_progress',
    taskIds: [],
    notes: 'استعلام قیمت‌ها از شرکت‌های معتبر انجام شده و در مرحله انعقاد قرارداد است.',
    createdAt: '۱۴۰۵/۰۶/۰۴'
  }
];

export const INITIAL_ARCHIVE_DOSSIERS: ArchiveDossier[] = [
  {
    id: 'dos-sec-1',
    code: 'DOS-SEC-1405-01',
    title: 'پرونده مکاتبات و الزامات امنیت اطلاعات و ممیزی افتا',
    category: 'administrative',
    location: 'قفسه A-3، زونکن امنیتی ۱۲ و آرشیو دیجیتال Cloud',
    confidentiality: 'confidential',
    letterIds: ['let-1', 'let-5'],
    resolutionIds: ['res-3'],
    assetIds: ['asset-1'],
    description: 'شامل کلیه مکاتبات، گزارش‌های آسیب‌پذیری و گواهینامه‌های امنیتی سیستم.',
    retentionYears: 10,
    createdAt: '۱۴۰۴/۰۱/۱۰',
    updatedAt: '۱۴۰۵/۰۶/۱۰'
  },
  {
    id: 'dos-con-1',
    code: 'DOS-CON-1405-04',
    title: 'پرونده قراردادها و تفاهم‌نامه‌های مشتریان بزرگ سازمانی',
    category: 'contracts',
    location: 'گاوصندوق اسناد مالی و سامانه اسناد دیجیتال',
    confidentiality: 'normal',
    letterIds: ['let-2', 'let-4'],
    resolutionIds: [],
    assetIds: ['asset-2'],
    description: 'شامل اصل و تصویر قراردادها، پیش‌فاکتورها و متمم‌های همکاری سازمانی.',
    retentionYears: 15,
    createdAt: '۱۴۰۴/۰۱/۱۵',
    updatedAt: '۱۴۰۵/۰۶/۰۶'
  },
  {
    id: 'dos-adm-1',
    code: 'DOS-ADM-1405-09',
    title: 'پرونده مناقصات دولتی و اسناد استعلام بها',
    category: 'administrative',
    location: 'قفسه B-1، زونکن مناقصات ۱۴۰۵',
    confidentiality: 'normal',
    letterIds: ['let-3'],
    resolutionIds: [],
    assetIds: [],
    description: 'مکاتبات مربوط به سامانه ستاد ایران و ارزیابی کیفی شرکت در مناقصات.',
    retentionYears: 5,
    createdAt: '۱۴۰۵/۰۲/۰۱',
    updatedAt: '۱۴۰۵/۰۵/۲۸'
  }
];
