import { Conversation, ChatMessage } from '../types';

export const INITIAL_CONVERSATIONS: Conversation[] = [
  // 1. Direct Messages
  {
    id: 'conv-dm-1',
    type: 'direct',
    name: 'مهدی رضایی',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    description: 'طراح ارشد رابط کاربری و دیزاین سیستم',
    members: [
      { userId: 'usr-1', role: 'owner', joinedAt: '۱۴۰۵/۰۵/۰۱' },
      { userId: 'usr-10', role: 'member', joinedAt: '۱۴۰۵/۰۵/۰۱' }
    ],
    memberIds: ['usr-1', 'usr-10'],
    unreadCount: 1,
    lastMessage: {
      text: 'فایل کامپوننت‌های ریسپانسیو رو در فیگما آپدیت کردم، لطفا بررسی کن.',
      timestamp: '۱۶:۴۲',
      senderId: 'usr-10',
      senderName: 'مهدی رضایی'
    },
    pinnedMessageIds: ['msg-dm-1-2'],
    isMuted: false,
    createdAt: '۱۴۰۵/۰۵/۰۱',
    updatedAt: '۱۴۰۵/۰۶/۱۰ - ۱۶:۴۲'
  },
  {
    id: 'conv-dm-2',
    type: 'direct',
    name: 'علی احمدی',
    avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
    description: 'توسعه‌دهنده ارشد بک‌اند و API',
    members: [
      { userId: 'usr-1', role: 'owner', joinedAt: '۱۴۰۵/۰۵/۱۰' },
      { userId: 'usr-11', role: 'member', joinedAt: '۱۴۰۵/۰۵/۱۰' }
    ],
    memberIds: ['usr-1', 'usr-11'],
    unreadCount: 0,
    lastMessage: {
      text: 'اندپوینت‌های Swagger به‌روزرسانی شد و کش ردیس هم فعال شد.',
      timestamp: '۱۵:۲۰',
      senderId: 'usr-11',
      senderName: 'علی احمدی'
    },
    pinnedMessageIds: [],
    isMuted: false,
    createdAt: '۱۴۰۵/۰۵/۱۰',
    updatedAt: '۱۴۰۵/۰۶/۱۰ - ۱۵:۲۰'
  },
  {
    id: 'conv-dm-3',
    type: 'direct',
    name: 'سارا محمدی',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    description: 'مدیر بازاریابی دیجیتال و رشد',
    members: [
      { userId: 'usr-1', role: 'owner', joinedAt: '۱۴۰۵/۰۵/۱۵' },
      { userId: 'usr-12', role: 'member', joinedAt: '۱۴۰۵/۰۵/۱۵' }
    ],
    memberIds: ['usr-1', 'usr-12'],
    unreadCount: 0,
    lastMessage: {
      text: 'گزارش تحلیلی تبدیل کمپین تابستانه را ضمیمه کردم.',
      timestamp: 'دیروز',
      senderId: 'usr-12',
      senderName: 'سارا محمدی'
    },
    pinnedMessageIds: [],
    isMuted: false,
    createdAt: '۱۴۰۵/۰۵/۱۵',
    updatedAt: '۱۴۰۵/۰۶/۰۹ - ۱۱:۳۰'
  },
  {
    id: 'conv-dm-4',
    type: 'direct',
    name: 'محمد کریمی',
    avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&auto=format&fit=crop&q=80',
    description: 'سرپرست آزمون نرم‌افزار و DevOps',
    members: [
      { userId: 'usr-1', role: 'owner', joinedAt: '۱۴۰۵/۰۵/۱۸' },
      { userId: 'usr-13', role: 'member', joinedAt: '۱۴۰۵/۰۵/۱۸' }
    ],
    memberIds: ['usr-1', 'usr-13'],
    unreadCount: 0,
    lastMessage: {
      text: 'تست‌های E2E با موفقیت روی سرور استیج پاس شدند.',
      timestamp: '۱۴۰۵/۰۶/۰۷',
      senderId: 'usr-13',
      senderName: 'محمد کریمی'
    },
    pinnedMessageIds: [],
    isMuted: true,
    createdAt: '۱۴۰۵/۰۵/۱۸',
    updatedAt: '۱۴۰۵/۰۶/۰۷ - ۰۹:۱۵'
  },

  // 2. Groups
  {
    id: 'conv-group-1',
    type: 'group',
    name: 'تیم طراحی و تجربه کاربری (UI/UX)',
    avatar: 'https://images.unsplash.com/photo-1542744094-3a31f272c490?w=150&auto=format&fit=crop&q=80',
    color: '#8b5cf6',
    description: 'هماهنگی دیزاین سیستم، تایپوگرافی، پترن‌های تعاملی و ماک‌آپ‌های محصول',
    teamId: 'team-design',
    members: [
      { userId: 'usr-1', role: 'owner', joinedAt: '۱۴۰۵/۰۱/۱۵' },
      { userId: 'usr-10', role: 'admin', joinedAt: '۱۴۰۵/۰۳/۱۰' },
      { userId: 'usr-5', role: 'member', joinedAt: '۱۴۰۵/۰۶/۱۵' },
      { userId: 'usr-3', role: 'member', joinedAt: '۱۴۰۵/۰۴/۱۰' }
    ],
    memberIds: ['usr-1', 'usr-10', 'usr-5', 'usr-3'],
    unreadCount: 2,
    lastMessage: {
      text: 'النا رستمی: تایپ‌فیس جدید ایران‌یکان ۳ برای تمام کامپوننت‌ها ست شد.',
      timestamp: '۱۷:۰۵',
      senderId: 'usr-5',
      senderName: 'النا رستمی'
    },
    pinnedMessageIds: ['msg-grp-1-1'],
    isMuted: false,
    createdAt: '۱۴۰۵/۰۱/۱۵',
    updatedAt: '۱۴۰۵/۰۶/۱۰ - ۱۷:۰۵'
  },
  {
    id: 'conv-group-2',
    type: 'group',
    name: 'تیم مهندسی و توسعه نرم‌افزار',
    avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80',
    color: '#3b82f6',
    description: 'بحث‌های فنی فرانت‌اند و بک‌اند، بررسی PRها، دیتابیس و معماری',
    teamId: 'team-dev',
    members: [
      { userId: 'usr-1', role: 'admin', joinedAt: '۱۴۰۵/۰۱/۱۵' },
      { userId: 'usr-4', role: 'owner', joinedAt: '۱۴۰۵/۰۵/۰۱' },
      { userId: 'usr-3', role: 'admin', joinedAt: '۱۴۰۵/۰۴/۱۰' },
      { userId: 'usr-11', role: 'member', joinedAt: '۱۴۰۵/۰۱/۲۰' },
      { userId: 'usr-13', role: 'member', joinedAt: '۱۴۰۵/۰۲/۱۵' }
    ],
    memberIds: ['usr-1', 'usr-4', 'usr-3', 'usr-11', 'usr-13'],
    unreadCount: 0,
    lastMessage: {
      text: 'داوود کیانی: مایگریشن اسکیمای PostgreSQL بدون دان‌تایم با موفقیت انجام شد.',
      timestamp: '۱۳:۴۰',
      senderId: 'usr-4',
      senderName: 'داوود کیانی'
    },
    pinnedMessageIds: ['msg-grp-2-1'],
    isMuted: false,
    createdAt: '۱۴۰۵/۰۱/۱۵',
    updatedAt: '۱۴۰۵/۰۶/۱۰ - ۱۳:۴۰'
  },
  {
    id: 'conv-group-3',
    type: 'group',
    name: 'تیم بازاریابی و رشد محصول',
    avatar: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=150&auto=format&fit=crop&q=80',
    color: '#ec4899',
    description: 'برنامه‌ریزی محتوا، شبکه‌های اجتماعی، سئو و رویدادهای B2B',
    members: [
      { userId: 'usr-1', role: 'admin', joinedAt: '۱۴۰۵/۰۱/۱۵' },
      { userId: 'usr-12', role: 'owner', joinedAt: '۱۴۰۵/۰۴/۰۵' },
      { userId: 'usr-7', role: 'member', joinedAt: '۱۴۰۵/۰۵/۲۵' },
      { userId: 'usr-2', role: 'member', joinedAt: '۱۴۰۵/۰۲/۲۰' }
    ],
    memberIds: ['usr-1', 'usr-12', 'usr-7', 'usr-2'],
    unreadCount: 0,
    lastMessage: {
      text: 'سارا محمدی: ویدیو پروموشن معرفی امکانات نسخه جدید آماده شد.',
      timestamp: 'دیروز',
      senderId: 'usr-12',
      senderName: 'سارا محمدی'
    },
    pinnedMessageIds: [],
    isMuted: false,
    createdAt: '۱۴۰۵/۰۴/۰۵',
    updatedAt: '۱۴۰۵/۰۶/۰۹ - ۱۵:۵۰'
  },

  // 3. Project Channels
  {
    id: 'conv-chan-1',
    type: 'channel',
    name: 'کانال پروژه سامانه جامع تدبیر [SYNC]',
    avatar: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=150&auto=format&fit=crop&q=80',
    color: '#6366f1',
    description: 'کانال اطلاع‌رسانی و مباحثات پروژه بازطراحی پرتال ابری کلود‌سینک ۲.۰',
    projectId: 'proj-1',
    members: [
      { userId: 'usr-1', role: 'owner', joinedAt: '۱۴۰۵/۰۷/۲۰' },
      { userId: 'usr-2', role: 'admin', joinedAt: '۱۴۰۵/۰۷/۲۰' },
      { userId: 'usr-3', role: 'member', joinedAt: '۱۴۰۵/۰۷/۲۰' },
      { userId: 'usr-4', role: 'member', joinedAt: '۱۴۰۵/۰۷/۲۰' },
      { userId: 'usr-5', role: 'member', joinedAt: '۱۴۰۵/۰۷/۲۰' },
      { userId: 'usr-6', role: 'member', joinedAt: '۱۴۰۵/۰۷/۲۰' },
      { userId: 'usr-10', role: 'member', joinedAt: '۱۴۰۵/۰۷/۲۰' }
    ],
    memberIds: ['usr-1', 'usr-2', 'usr-3', 'usr-4', 'usr-5', 'usr-6', 'usr-10'],
    unreadCount: 0,
    lastMessage: {
      text: 'مهرداد وصالی: اسپرینت شماره ۴ تا پایان هفته جاری تحویل داده می‌شود.',
      timestamp: '۱۱:۱۵',
      senderId: 'usr-2',
      senderName: 'مهرداد وصالی'
    },
    pinnedMessageIds: ['msg-chan-1-1'],
    isMuted: false,
    createdAt: '۱۴۰۵/۰۷/۲۰',
    updatedAt: '۱۴۰۵/۰۶/۱۰ - ۱۱:۱۵'
  },
  {
    id: 'conv-chan-2',
    type: 'channel',
    name: 'کانال پروژه پورتال مشتریان [PORTAL]',
    avatar: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=150&auto=format&fit=crop&q=80',
    color: '#0ea5e9',
    description: 'هماهنگی نیازمندی‌های مشتریان سازمانی، پنل گزارش‌گیری و تیکتینگ',
    projectId: 'proj-2',
    members: [
      { userId: 'usr-1', role: 'owner', joinedAt: '۱۴۰۵/۰۶/۰۱' },
      { userId: 'usr-2', role: 'admin', joinedAt: '۱۴۰۵/۰۶/۰۱' },
      { userId: 'usr-11', role: 'member', joinedAt: '۱۴۰۵/۰۶/۰۱' },
      { userId: 'usr-12', role: 'member', joinedAt: '۱۴۰۵/۰۶/۰۱' }
    ],
    memberIds: ['usr-1', 'usr-2', 'usr-11', 'usr-12'],
    unreadCount: 0,
    lastMessage: {
      text: 'سارا چنگیزی: پروتوتایپ جریان ورود دو مرحله‌ای توسط مشتری تایید شد.',
      timestamp: 'دیروز',
      senderId: 'usr-1',
      senderName: 'سارا چنگیزی'
    },
    pinnedMessageIds: [],
    isMuted: false,
    createdAt: '۱۴۰۵/۰۶/۰۱',
    updatedAt: '۱۴۰۵/۰۶/۰۹ - ۱۷:۲۰'
  }
];

export const INITIAL_MESSAGES: ChatMessage[] = [
  // Messages in conv-dm-1 (مهدی رضایی)
  {
    id: 'msg-dm-1-1',
    conversationId: 'conv-dm-1',
    senderId: 'usr-1',
    text: 'سلام مهدی جان، وضعیت دیزاین سیستم در فیگما در چه مرحله‌ایه؟ آیا تغییرات رنگ‌ها و گرادینت‌ها اعمال شد؟',
    timestamp: '۱۶:۳۰',
    createdAt: '2026-08-31T16:30:00Z',
    deliveryStatus: 'read',
    isStarred: false,
    reactions: [
      { emoji: '👍', count: 1, userIds: ['usr-10'] }
    ]
  },
  {
    id: 'msg-dm-1-2',
    conversationId: 'conv-dm-1',
    senderId: 'usr-10',
    text: 'سلام مهندس چنگیزی عزیز. بله تمام توکن‌های رنگی و تایپوگرافی مطابق دیزاین سیستم تدبیر بازبینی شد و با استانداردهای WCAG AA تطبیق داده شد.',
    timestamp: '۱۶:۳۴',
    createdAt: '2026-08-31T16:34:00Z',
    deliveryStatus: 'read',
    isPinned: true,
    isStarred: true,
    replyToMessageId: 'msg-dm-1-1',
    replyToMessage: {
      id: 'msg-dm-1-1',
      senderName: 'سارا چنگیزی',
      text: 'سلام مهدی جان، وضعیت دیزاین سیستم در فیگما در چه مرحله‌ایه؟'
    },
    attachments: [
      {
        id: 'att-1',
        name: 'Tadbir-Design-System-v2.fig',
        size: 14850000,
        sizeFormatted: '۱۴.۱ مگابایت',
        type: 'archive',
        url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800&auto=format&fit=crop&q=80'
      }
    ],
    reactions: [
      { emoji: '🔥', count: 1, userIds: ['usr-1'] },
      { emoji: '❤️', count: 1, userIds: ['usr-1'] }
    ]
  },
  {
    id: 'msg-dm-1-3',
    conversationId: 'conv-dm-1',
    senderId: 'usr-1',
    text: 'بسیار عالی، تسک زیر رو هم ارجاع دادم تا تغییراتش رو نهایی کنی:',
    timestamp: '۱۶:۳۸',
    createdAt: '2026-08-31T16:38:00Z',
    deliveryStatus: 'read',
    taskRef: {
      taskId: 'task-1',
      title: 'طراحی رابط کاربری داشبورد تحلیلی و چارت‌ها',
      status: 'in_progress',
      priority: 'urgent',
      projectName: 'بازطراحی پرتال ابری کلود‌سینک ۲.۰',
      assigneeName: 'مهدی رضایی'
    }
  },
  {
    id: 'msg-dm-1-4',
    conversationId: 'conv-dm-1',
    senderId: 'usr-10',
    text: 'فایل کامپوننت‌های ریسپانسیو رو در فیگما آپدیت کردم، لطفا بررسی کن.',
    timestamp: '۱۶:۴۲',
    createdAt: '2026-08-31T16:42:00Z',
    deliveryStatus: 'delivered',
    isStarred: false,
    attachments: [
      {
        id: 'att-2',
        name: 'responsive-preview-dashboard.png',
        size: 3200000,
        sizeFormatted: '۳.۱ مگابایت',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=300&auto=format&fit=crop&q=80'
      }
    ]
  },

  // Messages in conv-group-1 (تیم طراحی و تجربه کاربری)
  {
    id: 'msg-grp-1-1',
    conversationId: 'conv-group-1',
    senderId: 'usr-10',
    text: 'همکاران گرامی، راهنمای استانداردهای دسترسی‌پذیری و تضاد رنگی (Contrast Ratio) در سامانه تدبیر تدوین شد. لطفا همه اعضا مطالعه کنند.',
    timestamp: '۱۴:۱۵',
    createdAt: '2026-08-31T14:15:00Z',
    deliveryStatus: 'read',
    isPinned: true,
    isStarred: true,
    attachments: [
      {
        id: 'att-3',
        name: 'Accessibility-Guidelines-Tadbir.pdf',
        size: 4500000,
        sizeFormatted: '۴.۳ مگابایت',
        type: 'document',
        url: '#'
      }
    ],
    reactions: [
      { emoji: '✅', count: 3, userIds: ['usr-1', 'usr-5', 'usr-3'] },
      { emoji: '🎉', count: 2, userIds: ['usr-5', 'usr-1'] }
    ]
  },
  {
    id: 'msg-grp-1-2',
    conversationId: 'conv-group-1',
    senderId: 'usr-3',
    text: 'ممنون مهدی جان. کامپوننت‌های دکمه و اینپوت‌ها در نسخه فرانت‌اند بر اساس این گایدلاین کاملا به‌روزرسانی شدند.',
    timestamp: '۱۵:۱۰',
    createdAt: '2026-08-31T15:10:00Z',
    deliveryStatus: 'read',
    replyToMessageId: 'msg-grp-1-1',
    replyToMessage: {
      id: 'msg-grp-1-1',
      senderName: 'مهدی رضایی',
      text: 'راهنمای استانداردهای دسترسی‌پذیری و تضاد رنگی تدوین شد.'
    },
    reactions: [
      { emoji: '👏', count: 2, userIds: ['usr-10', 'usr-1'] }
    ]
  },
  {
    id: 'msg-grp-1-3',
    conversationId: 'conv-group-1',
    senderId: 'usr-5',
    text: 'تایپ‌فیس جدید ایران‌یکان ۳ برای تمام کامپوننت‌ها ست شد و لایوت‌های RTL به صورت پیکسلی چک شدند.',
    timestamp: '۱۷:۰۵',
    createdAt: '2026-08-31T17:05:00Z',
    deliveryStatus: 'sent',
    attachments: [
      {
        id: 'att-4',
        name: 'voice-update-design.mp3',
        size: 850000,
        sizeFormatted: '۸۳۰ کیلوبایت',
        type: 'voice',
        duration: '0:38',
        url: '#'
      }
    ]
  },

  // Messages in conv-chan-1 (کانال پروژه سامانه جامع تدبیر)
  {
    id: 'msg-chan-1-1',
    conversationId: 'conv-chan-1',
    senderId: 'usr-2',
    text: '📌 بیانیه اهداف اسپرینت چهارم: تمرکز اصلی این هفته روی بهینه‌سازی بارگذاری ماژول دارایی‌های دیجیتال (DAM)، تکمیل سیستم پیام‌رسان یکپارچه و تست نهایی رول‌های کاربری است.',
    timestamp: '۰۹:۰۰',
    createdAt: '2026-08-31T09:00:00Z',
    deliveryStatus: 'read',
    isPinned: true,
    isStarred: true,
    projectRef: {
      projectId: 'proj-1',
      name: 'بازطراحی پرتال ابری کلود‌سینک ۲.۰',
      key: 'SYNC',
      color: '#6366f1',
      status: 'active',
      progress: 68
    },
    reactions: [
      { emoji: '🚀', count: 4, userIds: ['usr-1', 'usr-3', 'usr-4', 'usr-10'] }
    ]
  },
  {
    id: 'msg-chan-1-2',
    conversationId: 'conv-chan-1',
    senderId: 'usr-4',
    text: 'سرویس سشن‌ها و ذخیره‌سازی داده‌های چت در سطح لوکال و دیتابیس تست شد و بدون هیچ خطایی اجرا می‌شود.',
    timestamp: '۱۰:۳۰',
    createdAt: '2026-08-31T10:30:00Z',
    deliveryStatus: 'read',
    reactions: [
      { emoji: '👍', count: 2, userIds: ['usr-2', 'usr-1'] }
    ]
  },
  {
    id: 'msg-chan-1-3',
    conversationId: 'conv-chan-1',
    senderId: 'usr-2',
    text: 'مهرداد وصالی: اسپرینت شماره ۴ تا پایان هفته جاری تحویل داده می‌شود.',
    timestamp: '۱۱:۱۵',
    createdAt: '2026-08-31T11:15:00Z',
    deliveryStatus: 'read',
    reactions: [
      { emoji: '❤️', count: 3, userIds: ['usr-1', 'usr-3', 'usr-10'] }
    ]
  },

  // Messages in conv-dm-2 (علی احمدی)
  {
    id: 'msg-dm-2-1',
    conversationId: 'conv-dm-2',
    senderId: 'usr-1',
    text: 'سلام علی جان، وضعیت مستندات API احراز هویت و مدیریت سشن‌ها به کجا رسید؟',
    timestamp: '۱۵:۰۰',
    createdAt: '2026-08-31T15:00:00Z',
    deliveryStatus: 'read'
  },
  {
    id: 'msg-dm-2-2',
    conversationId: 'conv-dm-2',
    senderId: 'usr-11',
    text: 'اندپوینت‌های Swagger به‌روزرسانی شد و کش ردیس هم فعال شد.',
    timestamp: '۱۵:۲۰',
    createdAt: '2026-08-31T15:20:00Z',
    deliveryStatus: 'read',
    attachments: [
      {
        id: 'att-5',
        name: 'api-specification-v2.json',
        size: 540000,
        sizeFormatted: '۵۲۷ کیلوبایت',
        type: 'document',
        url: '#'
      }
    ],
    reactions: [
      { emoji: '🙏', count: 1, userIds: ['usr-1'] }
    ]
  }
];
