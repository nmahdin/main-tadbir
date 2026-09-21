import { DigitalAsset, AssetFolder } from '../types';

export const INITIAL_FOLDERS: AssetFolder[] = [
  {
    id: 'fld-1',
    name: 'پروژه‌های در حال اجرا',
    parentId: null,
    color: '#6366f1',
    createdBy: 'usr-1',
    createdAt: '۱۴۰۴/۰۱/۱۰',
    itemCount: 8,
    isFavorite: true,
    sharedWith: [
      { targetId: 'team-1', targetType: 'team', targetName: 'تیم طراحی محصول', access: 'edit' },
      { targetId: 'team-2', targetType: 'team', targetName: 'تیم مهندسی فرانت‌اند', access: 'view' }
    ]
  },
  {
    id: 'fld-2',
    name: 'پروژه پرتال ابری کلود‌سینک ۲.۰',
    parentId: 'fld-1',
    color: '#3b82f6',
    createdBy: 'usr-2',
    createdAt: '۱۴۰۴/۰۱/۱۵',
    projectId: 'proj-1',
    itemCount: 4,
    isFavorite: true
  },
  {
    id: 'fld-3',
    name: 'طراحی رابط و تجربه کاربری (UI/UX)',
    parentId: 'fld-2',
    color: '#ec4899',
    createdBy: 'usr-5',
    createdAt: '۱۴۰۴/۰۱/۲۰',
    projectId: 'proj-1',
    itemCount: 3,
    isFavorite: true
  },
  {
    id: 'fld-4',
    name: 'هویت بصری و دیزاین‌سیستم تدبیر',
    parentId: null,
    color: '#8b5cf6',
    createdBy: 'usr-5',
    createdAt: '۱۴۰۴/۰۲/۰۱',
    itemCount: 5,
    isFavorite: true,
    sharedWith: [
      { targetId: 'usr-1', targetType: 'user', targetName: 'سارا چنگیزی', access: 'manage' },
      { targetId: 'usr-3', targetType: 'user', targetName: 'علی رضوانی', access: 'view' }
    ]
  },
  {
    id: 'fld-5',
    name: 'اسناد راهبردی، مالی و قراردادها',
    parentId: null,
    color: '#10b981',
    createdBy: 'usr-1',
    createdAt: '۱۴۰۴/۰۲/۱۰',
    itemCount: 4,
    isFavorite: false
  },
  {
    id: 'fld-6',
    name: 'محتوای رسانه‌ای، ویدئوها و پادکست‌ها',
    parentId: null,
    color: '#f59e0b',
    createdBy: 'usr-2',
    createdAt: '۱۴۰۴/۰۳/۰۵',
    itemCount: 3,
    isFavorite: false
  },
  {
    id: 'fld-7',
    name: 'سورس‌کدها و پکیج‌های بیلد',
    parentId: null,
    color: '#64748b',
    createdBy: 'usr-4',
    createdAt: '۱۴۰۴/۰۳/۱۵',
    itemCount: 2,
    isFavorite: false
  }
];

export const INITIAL_ASSETS: DigitalAsset[] = [
  {
    id: 'ast-1',
    title: 'کتابچه راهنمای هویت بصری و دیزاین‌سیستم تدبیر',
    fileName: 'Tadbir_Brand_Guidelines_v2.4.pdf',
    extension: 'pdf',
    category: 'document',
    mimeType: 'application/pdf',
    size: 8450000,
    sizeFormatted: '۸.۴۵ مگابایت',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    thumbnailUrl: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&auto=format&fit=crop&q=80',
    folderId: 'fld-4',
    projectId: 'proj-1',
    taskId: 'tsk-101',
    tags: ['Branding', 'Design System', 'UI', 'Final', 'Official'],
    createdBy: 'usr-5', // Elena
    createdAt: '۱۴۰۴/۰۳/۱۰ - ۰۹:۳۰',
    updatedAt: '۱۴۰۴/۰۶/۰۲ - ۱۱:۱۵',
    isFavorite: true,
    isTrash: false,
    permissionLevel: 'organization',
    sharedWith: [
      { targetId: 'team-1', targetType: 'team', targetName: 'تیم طراحی محصول', access: 'manage' },
      { targetId: 'team-2', targetType: 'team', targetName: 'تیم مهندسی نرم‌افزار', access: 'view' }
    ],
    currentVersion: 3,
    versions: [
      {
        id: 'ver-1-3',
        versionNumber: 3,
        fileName: 'Tadbir_Brand_Guidelines_v2.4.pdf',
        size: 8450000,
        sizeFormatted: '۸.۴۵ مگابایت',
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        uploadedBy: 'usr-5',
        uploadedAt: '۱۴۰۴/۰۶/۰۲ - ۱۱:۱۵',
        changelog: 'اصلاح پالت رنگی دارک‌مود، افزودن فونت‌های رسمی Vazirmatn و استانداردهای فاصله گذاری ۸ پیکسلی.',
        downloadCount: 38
      },
      {
        id: 'ver-1-2',
        versionNumber: 2,
        fileName: 'Tadbir_Brand_Guidelines_v2.0.pdf',
        size: 7920000,
        sizeFormatted: '۷.۹۲ مگابایت',
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        uploadedBy: 'usr-5',
        uploadedAt: '۱۴۰۴/۰۴/۱۸ - ۱۴:۲۰',
        changelog: 'به‌روزرسانی گرید سیستم و تعاریف دکمه‌ها و فرم‌ها بر اساس نسخه دوم سامانه تدبیر.',
        downloadCount: 19
      },
      {
        id: 'ver-1-1',
        versionNumber: 1,
        fileName: 'Tadbir_Brand_Guidelines_v1.0.pdf',
        size: 6100000,
        sizeFormatted: '۶.۱۰ مگابایت',
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        uploadedBy: 'usr-1',
        uploadedAt: '۱۴۰۴/۰۳/۱۰ - ۰۹:۳۰',
        changelog: 'نسخه اولیه تدوین هویت بصری برند، پالت رنگی اصلی و لوگوتایپ سازمانی.',
        downloadCount: 12
      }
    ],
    comments: [
      {
        id: 'comm-1',
        userId: 'usr-1',
        text: 'فوق‌العاده شده! لطفاً بخش کدهای HEX رنگ‌ها و نسبت کنتراست‌های WCAG AAA را نیز به پیوست اضافه کنید.',
        createdAt: '۱۴۰۴/۰۶/۰۲ - ۱۲:۰۰'
      },
      {
        id: 'comm-2',
        userId: 'usr-5',
        text: 'حتماً مهندس چنگیزی عزیز، در صفحه ۲۴ جدول اعتبارسنجی کامل کنتراست رنگی اضافه شده است.',
        createdAt: '۱۴۰۴/۰۶/۰۲ - ۱۲:۱۵'
      }
    ],
    activities: [
      { id: 'act-1', userId: 'usr-5', action: 'نسخه ۳ فایل را بارگذاری کرد', timestamp: '۱۴۰۴/۰۶/۰۲ - ۱۱:۱۵', details: 'تغییرات پالت رنگی و تایپوگرافی' },
      { id: 'act-2', userId: 'usr-1', action: 'سطح دسترسی را به سازمانی ارتقا داد', timestamp: '۱۴۰۴/۰۶/۰۲ - ۱۱:۳۰' },
      { id: 'act-3', userId: 'usr-3', action: 'فایل را مشاهده و دانلود کرد', timestamp: '۱۴۰۴/۰۶/۰۴ - ۱۰:۴۵' }
    ],
    downloadCount: 69,
    description: 'سند رسمی تعاریف دیزاین‌سیستم، اصول چیدمان ریسپانسیو، متغیرهای CSS و استاندارد لوگو و فونت‌های سامانه تدبیر.'
  },
  {
    id: 'ast-2',
    title: 'وایرفریم‌ها و پروتوتایپ کامل داشبورد پرتال کلود‌سینک',
    fileName: 'CloudSync_Portal_UI_Prototype_Final.png',
    extension: 'png',
    category: 'image',
    mimeType: 'image/png',
    size: 4230000,
    sizeFormatted: '۴.۲۳ مگابایت',
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&auto=format&fit=crop&q=80',
    folderId: 'fld-3',
    projectId: 'proj-1',
    taskId: 'tsk-101',
    tags: ['UI', 'Figma', 'Prototype', 'Dashboard', 'CloudSync'],
    createdBy: 'usr-5',
    createdAt: '۱۴۰۴/۰۵/۲۸ - ۱۶:۴۵',
    updatedAt: '۱۴۰۴/۰۶/۰۸ - ۱۰:۲۰',
    isFavorite: true,
    isTrash: false,
    permissionLevel: 'project',
    sharedWith: [
      { targetId: 'usr-3', targetType: 'user', targetName: 'علی رضوانی', access: 'edit' },
      { targetId: 'usr-2', targetType: 'user', targetName: 'مهرداد وصالی', access: 'manage' }
    ],
    currentVersion: 2,
    versions: [
      {
        id: 'ver-2-2',
        versionNumber: 2,
        fileName: 'CloudSync_Portal_UI_Prototype_Final.png',
        size: 4230000,
        sizeFormatted: '۴.۲۳ مگابایت',
        url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1600&auto=format&fit=crop&q=80',
        uploadedBy: 'usr-5',
        uploadedAt: '۱۴۰۴/۰۶/۰۸ - ۱۰:۲۰',
        changelog: 'اصلاح ویجت نمودارهای بلادرنگ و ساده‌سازی منوی سایدبار.',
        downloadCount: 22
      },
      {
        id: 'ver-2-1',
        versionNumber: 1,
        fileName: 'CloudSync_Portal_UI_Prototype_Draft.png',
        size: 3850000,
        sizeFormatted: '۳.۸۵ مگابایت',
        url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1600&auto=format&fit=crop&q=80',
        uploadedBy: 'usr-5',
        uploadedAt: '۱۴۰۴/۰۵/۲۸ - ۱۶:۴۵',
        changelog: 'طرح اولیه پیش‌نمایش داشبورد کلود‌سینک ۲.۰.',
        downloadCount: 14
      }
    ],
    comments: [
      {
        id: 'comm-3',
        userId: 'usr-3',
        text: 'سلام النا جان، کامپوننت‌های این صفحه رو در ری‌اکت پیاده کردم و انیمیشن‌ها دقیقا منطبق بر پروتوتایپ است.',
        createdAt: '۱۴۰۴/۰۶/۰۸ - ۱۱:۳۰'
      }
    ],
    activities: [
      { id: 'act-4', userId: 'usr-5', action: 'فایل را ایجاد و بارگذاری کرد', timestamp: '۱۴۰۴/۰۵/۲۸ - ۱۶:۴۵' },
      { id: 'act-5', userId: 'usr-3', action: 'دیدگاهی روی تصویر ثبت کرد', timestamp: '۱۴۰۴/۰۶/۰۸ - ۱۱:۳۰' }
    ],
    dimensions: '2560x1440',
    downloadCount: 36,
    description: 'خروجی کیفیت بالای طراحی رابط کاربری داشبورد اصلی کلود‌سینک ۲.۰ شامل نمودارهای پیشرفت و لیست رویدادها.'
  },
  {
    id: 'ast-3',
    title: 'ویدئوی راهنمای تور تعاملی و معرفی سامانه تدبیر',
    fileName: 'Tadbir_System_Walkthrough_Demo_1080p.mp4',
    extension: 'mp4',
    category: 'video',
    mimeType: 'video/mp4',
    size: 28900000,
    sizeFormatted: '۲۸.۹ مگابایت',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&auto=format&fit=crop&q=80',
    folderId: 'fld-6',
    projectId: 'proj-5',
    tags: ['Video', 'Demo', 'Onboarding', 'Tutorial', 'Marketing'],
    createdBy: 'usr-2',
    createdAt: '۱۴۰۴/۰۴/۱۵ - ۱۸:۰۰',
    updatedAt: '۱۴۰۴/۰۴/۱۵ - ۱۸:۰۰',
    isFavorite: true,
    isTrash: false,
    permissionLevel: 'organization',
    sharedWith: [],
    currentVersion: 1,
    versions: [
      {
        id: 'ver-3-1',
        versionNumber: 1,
        fileName: 'Tadbir_System_Walkthrough_Demo_1080p.mp4',
        size: 28900000,
        sizeFormatted: '۲۸.۹ مگابایت',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        uploadedBy: 'usr-2',
        uploadedAt: '۱۴۰۴/۰۴/۱۵ - ۱۸:۰۰',
        changelog: 'ضبط تور ویدیویی کامل بخش پروژه‌ها، وظایف، تقویم و دارایی‌های دیجیتال با گویندگی استودیویی.',
        downloadCount: 45
      }
    ],
    comments: [
      {
        id: 'comm-4',
        userId: 'usr-1',
        text: 'کیفیت تصویر و شفافیت توضیحات عالی است، در صفحه آنبوردینگ مشتریان قرار داده شود.',
        createdAt: '۱۴۰۴/۰۴/۱۶ - ۰۹:۰۰'
      }
    ],
    activities: [
      { id: 'act-6', userId: 'usr-2', action: 'ویدئوی جدید را بارگذاری کرد', timestamp: '۱۴۰۴/۰۴/۱۵ - ۱۸:۰۰' }
    ],
    duration: '۰۳:۴۵',
    dimensions: '1920x1080',
    downloadCount: 45,
    description: 'ویدئوی آموزشی جامع جهت آنبوردینگ کارکنان جدید و آشنایی با کلیه قابلیت‌های پیشرفته سامانه تدبیر.'
  },
  {
    id: 'ast-4',
    title: 'فایل صوتی جلسه بازبینی اسپرینت ۱۴ و ارزیابی ریسک',
    fileName: 'Sprint_14_Retrospective_Voice_Audio.mp3',
    extension: 'mp3',
    category: 'audio',
    mimeType: 'audio/mpeg',
    size: 14200000,
    sizeFormatted: '۱۴.۲ مگابایت',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
    folderId: 'fld-6',
    projectId: 'proj-1',
    tags: ['Audio', 'Meeting', 'Podcast', 'Scrum', 'Sprint 14'],
    createdBy: 'usr-2',
    createdAt: '۱۴۰۴/۰۵/۳۰ - ۱۷:۳۰',
    updatedAt: '۱۴۰۴/۰۵/۳۰ - ۱۷:۳۰',
    isFavorite: false,
    isTrash: false,
    permissionLevel: 'team',
    sharedWith: [
      { targetId: 'team-1', targetType: 'team', targetName: 'تیم مهندسی', access: 'view' }
    ],
    currentVersion: 1,
    versions: [
      {
        id: 'ver-4-1',
        versionNumber: 1,
        fileName: 'Sprint_14_Retrospective_Voice_Audio.mp3',
        size: 14200000,
        sizeFormatted: '۱۴.۲ مگابایت',
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        uploadedBy: 'usr-2',
        uploadedAt: '۱۴۰۴/۰۵/۳۰ - ۱۷:۳۰',
        changelog: 'فایل صوتی باکیفیت ضبط‌شده از جلسه بازبینی اسپرینت ۱۴ با حضور سرپرستان فنی.',
        downloadCount: 15
      }
    ],
    comments: [],
    activities: [
      { id: 'act-7', userId: 'usr-2', action: 'فایل صوتی را ذخیره کرد', timestamp: '۱۴۰۴/۰۵/۳۰ - ۱۷:۳۰' }
    ],
    duration: '۰۶:۱۸',
    downloadCount: 15,
    description: 'فایل صوتی کامل مذاکرات اسپرینت ۱۴ و بررسی علل تاخیر در پیاده‌سازی ماژول توکن‌های امنیتی.'
  },
  {
    id: 'ast-5',
    title: 'گزارش تحلیلی هزینه‌کرد و بودجه‌بندی پروژه‌های فاز پاییز',
    fileName: 'Financial_Budget_Allocation_Q3_1404.xlsx',
    extension: 'xlsx',
    category: 'document',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 2150000,
    sizeFormatted: '۲.۱۵ مگابایت',
    url: '#',
    thumbnailUrl: 'https://images.unsplash.com/photo-1543286386-713bdd548da4?w=600&auto=format&fit=crop&q=80',
    folderId: 'fld-5',
    projectId: 'proj-4',
    tags: ['Financial', 'Excel', 'Budget', 'Management', 'Q3'],
    createdBy: 'usr-1',
    createdAt: '۱۴۰۴/۰۶/۰۱ - ۱۰:۱۵',
    updatedAt: '۱۴۰۴/۰۶/۰۷ - ۱۶:۴۰',
    isFavorite: true,
    isTrash: false,
    permissionLevel: 'private',
    sharedWith: [
      { targetId: 'usr-2', targetType: 'user', targetName: 'مهرداد وصالی', access: 'view' }
    ],
    currentVersion: 2,
    versions: [
      {
        id: 'ver-5-2',
        versionNumber: 2,
        fileName: 'Financial_Budget_Allocation_Q3_1404.xlsx',
        size: 2150000,
        sizeFormatted: '۲.۱۵ مگابایت',
        url: '#',
        uploadedBy: 'usr-1',
        uploadedAt: '۱۴۰۴/۰۶/۰۷ - ۱۶:۴۰',
        changelog: 'افزودن جدول هزینه‌های سرورهای ابری و دستمزد تیم تست خودکار.',
        downloadCount: 8
      },
      {
        id: 'ver-5-1',
        versionNumber: 1,
        fileName: 'Financial_Budget_Draft.xlsx',
        size: 1980000,
        sizeFormatted: '۱.۹۸ مگابایت',
        url: '#',
        uploadedBy: 'usr-1',
        uploadedAt: '۱۴۰۴/۰۶/۰۱ - ۱۰:۱۵',
        changelog: 'پیش‌نویس اولیه بودجه سه‌ماهه سوم سازمان.',
        downloadCount: 4
      }
    ],
    comments: [],
    activities: [
      { id: 'act-8', userId: 'usr-1', action: 'نسخه جدید گزارش مالی را ثبت کرد', timestamp: '۱۴۰۴/۰۶/۰۷ - ۱۶:۴۰' }
    ],
    downloadCount: 12,
    description: 'شیت محاسباتی تفکیک هزینه‌های توسعه نرم‌افزار، لایسنس‌ها، تجهیزات سخت‌افزاری و برآورد نرخ بازگشت سرمایه.'
  },
  {
    id: 'ast-6',
    title: 'پکیج خروجی بیلد نهایی کلاینت وب و استاتیک وب‌پک',
    fileName: 'Tadbir_Web_Client_Release_v3.2.0.zip',
    extension: 'zip',
    category: 'archive',
    mimeType: 'application/zip',
    size: 45800000,
    sizeFormatted: '۴۵.۸ مگابایت',
    url: '#',
    thumbnailUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80',
    folderId: 'fld-7',
    projectId: 'proj-2',
    tags: ['Release', 'Build', 'SourceCode', 'ZIP', 'Production'],
    createdBy: 'usr-4',
    createdAt: '۱۴۰۴/۰۶/۰۵ - ۲۲:۱۰',
    updatedAt: '۱۴۰۴/۰۶/۰۵ - ۲۲:۱۰',
    isFavorite: false,
    isTrash: false,
    permissionLevel: 'organization',
    sharedWith: [],
    currentVersion: 1,
    versions: [
      {
        id: 'ver-6-1',
        versionNumber: 1,
        fileName: 'Tadbir_Web_Client_Release_v3.2.0.zip',
        size: 45800000,
        sizeFormatted: '۴۵.۸ مگابایت',
        url: '#',
        uploadedBy: 'usr-4',
        uploadedAt: '۱۴۰۴/۰۶/۰۵ - ۲۲:۱۰',
        changelog: 'باندل فشرده کدهای کامپایل‌شده فرانت‌اند به همراه فایل‌های سورس‌مپ و assetها.',
        downloadCount: 18
      }
    ],
    comments: [],
    activities: [
      { id: 'act-9', userId: 'usr-4', action: 'پکیج رلیز پروداکشن را ایجاد کرد', timestamp: '۱۴۰۴/۰۶/۰۵ - ۲۲:۱۰' }
    ],
    downloadCount: 18,
    description: 'بسته آرشیو رسمی بیلد پروداکشن برای دیپلوی در سرورهای ابری تدبیر به همراه چک‌سام SHA-256.'
  },
  {
    id: 'ast-7',
    title: 'لوگوهای وکتور رسمی، نشان سازمانی و مونوگرام تدبیر',
    fileName: 'Tadbir_Vector_Logos_Master.svg',
    extension: 'svg',
    category: 'image',
    mimeType: 'image/svg+xml',
    size: 340000,
    sizeFormatted: '۳۴۰ کیلوبایت',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
    folderId: 'fld-4',
    projectId: 'proj-1',
    tags: ['SVG', 'Vector', 'Logo', 'Branding', 'Iconography'],
    createdBy: 'usr-5',
    createdAt: '۱۴۰۴/۰۳/۰۱ - ۱۱:۰۰',
    updatedAt: '۱۴۰۴/۰۵/۱۰ - ۰۹:۱۵',
    isFavorite: true,
    isTrash: false,
    permissionLevel: 'organization',
    sharedWith: [],
    currentVersion: 2,
    versions: [
      {
        id: 'ver-7-2',
        versionNumber: 2,
        fileName: 'Tadbir_Vector_Logos_Master.svg',
        size: 340000,
        sizeFormatted: '۳۴۰ کیلوبایت',
        url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1600&auto=format&fit=crop&q=80',
        uploadedBy: 'usr-5',
        uploadedAt: '۱۴۰۴/۰۵/۱۰ - ۰۹:۱۵',
        changelog: 'بهینه‌سازی منحنی‌های برداری و کاهش حجم فایل SVG.',
        downloadCount: 54
      },
      {
        id: 'ver-7-1',
        versionNumber: 1,
        fileName: 'Tadbir_Logo_Initial.svg',
        size: 520000,
        sizeFormatted: '۵۲۰ کیلوبایت',
        url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1600&auto=format&fit=crop&q=80',
        uploadedBy: 'usr-5',
        uploadedAt: '۱۴۰۴/۰۳/۰۱ - ۱۱:۰۰',
        changelog: 'خروجی برداری اولیه از نرم‌افزار ایلوستریتور.',
        downloadCount: 20
      }
    ],
    comments: [],
    activities: [
      { id: 'act-10', userId: 'usr-5', action: 'نسخه برداری لوگو را بهینه‌سازی کرد', timestamp: '۱۴۰۴/۰۵/۱۰ - ۰۹:۱۵' }
    ],
    dimensions: 'Vector Scalable',
    downloadCount: 74,
    description: 'فایل برداری مستر شامل نشان سازمانی تدبیر، تایپوفیس فارسی و انگلیسی در حالت‌های افقی، عمودی و تک‌رنگ.'
  },
  {
    id: 'ast-8',
    title: 'پیش‌نویس قرارداد سطح خدمت (SLA) و امنیت اطلاعات',
    fileName: 'Security_SLA_Agreement_Draft_2026.docx',
    extension: 'docx',
    category: 'document',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 1450000,
    sizeFormatted: '۱.۴۵ مگابایت',
    url: '#',
    thumbnailUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=600&auto=format&fit=crop&q=80',
    folderId: 'fld-5',
    projectId: 'proj-2',
    tags: ['Legal', 'SLA', 'Security', 'Contract', 'Draft'],
    createdBy: 'usr-1',
    createdAt: '۱۴۰۴/۰۵/۱۵ - ۱۴:۳۰',
    updatedAt: '۱۴۰۴/۰۵/۱۵ - ۱۴:۳۰',
    isFavorite: false,
    isTrash: false,
    permissionLevel: 'project',
    sharedWith: [
      { targetId: 'usr-2', targetType: 'user', targetName: 'مهرداد وصالی', access: 'edit' }
    ],
    currentVersion: 1,
    versions: [
      {
        id: 'ver-8-1',
        versionNumber: 1,
        fileName: 'Security_SLA_Agreement_Draft_2026.docx',
        size: 1450000,
        sizeFormatted: '۱.۴۵ مگابایت',
        url: '#',
        uploadedBy: 'usr-1',
        uploadedAt: '۱۴۰۴/۰۵/۱۵ - ۱۴:۳۰',
        changelog: 'تنظیم بندهای ضمانت آپ‌تایم ۹۹.۹٪ و الزامات نگهداری داده‌ها در سرورهای محلی.',
        downloadCount: 11
      }
    ],
    comments: [],
    activities: [
      { id: 'act-11', userId: 'usr-1', action: 'پیش‌نویس قرارداد را آپلود کرد', timestamp: '۱۴۰۴/۰۵/۱۵ - ۱۴:۳۰' }
    ],
    downloadCount: 11,
    description: 'مستند حقوقی تعهدات کیفیت سرویس‌دهی، جبران خسارت‌های احتمالی قطعی و پروتکل‌های مقابله با نشت داده.'
  },
  {
    id: 'ast-9',
    title: 'دیاگرام معماری میکروسرویس‌ها و سیستم پیام‌رسان توزیع‌شده',
    fileName: 'Microservices_Architecture_v1.2.png',
    extension: 'png',
    category: 'image',
    mimeType: 'image/png',
    size: 3200000,
    sizeFormatted: '۳.۲۰ مگابایت',
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
    folderId: 'fld-2',
    projectId: 'proj-2',
    tags: ['Architecture', 'Backend', 'Diagram', 'Kubernetes', 'Redis'],
    createdBy: 'usr-4',
    createdAt: '۱۴۰۴/۰۴/۲۰ - ۱۱:۲۰',
    updatedAt: '۱۴۰۴/۰۴/۲۵ - ۱۶:۱۰',
    isFavorite: false,
    isTrash: false,
    permissionLevel: 'team',
    sharedWith: [
      { targetId: 'team-2', targetType: 'team', targetName: 'تیم مهندسی', access: 'edit' }
    ],
    currentVersion: 1,
    versions: [
      {
        id: 'ver-9-1',
        versionNumber: 1,
        fileName: 'Microservices_Architecture_v1.2.png',
        size: 3200000,
        sizeFormatted: '۳.۲۰ مگابایت',
        url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1600&auto=format&fit=crop&q=80',
        uploadedBy: 'usr-4',
        uploadedAt: '۱۴۰۴/۰۴/۲۵ - ۱۶:۱۰',
        changelog: 'ترسیم تعاملات بین کلاستر کوبرنتیز، صف پیام‌های RabbitMQ و پایگاه داده رلیشنال.',
        downloadCount: 27
      }
    ],
    comments: [],
    activities: [
      { id: 'act-12', userId: 'usr-4', action: 'دیاگرام فنی را به اشتراک گذاشت', timestamp: '۱۴۰۴/۰۴/۲۵ - ۱۶:۱۰' }
    ],
    dimensions: '3840x2160',
    downloadCount: 27,
    description: 'نقشه فنی توپولوژی سرویس‌های بک‌اند سامانه تدبیر، جریان کشینگ ردیس و لایه‌های لودبالانسر.'
  },
  {
    id: 'ast-10',
    title: 'فایل موقت گزارش لاگ خطاهای سرور در اسپرینت گذشته (زباله)',
    fileName: 'Old_Server_Error_Logs_Sprint12.txt',
    extension: 'txt',
    category: 'document',
    mimeType: 'text/plain',
    size: 450000,
    sizeFormatted: '۴۵۰ کیلوبایت',
    url: '#',
    thumbnailUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&auto=format&fit=crop&q=80',
    folderId: null,
    projectId: 'proj-2',
    tags: ['Logs', 'Archive', 'Old'],
    createdBy: 'usr-6',
    createdAt: '۱۴۰۴/۰۳/۱۵ - ۰۸:۰۰',
    updatedAt: '۱۴۰۴/۰۶/۰۱ - ۰۹:۰۰',
    isFavorite: false,
    isTrash: true,
    deletedAt: '۱۴۰۴/۰۶/۰۱ - ۰۹:۰۰',
    permissionLevel: 'private',
    sharedWith: [],
    currentVersion: 1,
    versions: [
      {
        id: 'ver-10-1',
        versionNumber: 1,
        fileName: 'Old_Server_Error_Logs_Sprint12.txt',
        size: 450000,
        sizeFormatted: '۴۵۰ کیلوبایت',
        url: '#',
        uploadedBy: 'usr-6',
        uploadedAt: '۱۴۰۴/۰۳/۱۵ - ۰۸:۰۰',
        changelog: 'لاگ‌های متنی بررسی خطاهای کلاینت.',
        downloadCount: 2
      }
    ],
    comments: [],
    activities: [
      { id: 'act-13', userId: 'usr-6', action: 'فایل را به سطل زباله منتقل کرد', timestamp: '۱۴۰۴/۰۶/۰۱ - ۰۹:۰۰' }
    ],
    downloadCount: 2,
    description: 'فایل منسوخ‌شده لاگ خطاهای تست که به سطل زباله ارسال شده است.'
  }
];
