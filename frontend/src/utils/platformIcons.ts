import {
  Clapperboard,
  Globe,
  Instagram,
  Linkedin,
  MessageCircle,
  MessageSquare,
  Mic,
  Newspaper,
  PlayCircle,
  Radio,
  Rss,
  Send,
  Share2,
  Tv,
  Twitter,
  Video,
  Youtube,
  type LucideIcon,
} from 'lucide-react';

/**
 * Keep this map explicit. A namespace import from lucide-react pulls every icon
 * into the production chunk and adds hundreds of kilobytes to the first load.
 */
export const PLATFORM_ICON_OPTIONS = [
  { value: 'Globe', label: 'وب‌سایت (Globe)' },
  { value: 'Send', label: 'تلگرام / ایتا (Send)' },
  { value: 'MessageCircle', label: 'بله / واتس‌اپ (MessageCircle)' },
  { value: 'MessageSquare', label: 'ایتا / پیام‌رسان (MessageSquare)' },
  { value: 'PlayCircle', label: 'روبیکا / پخش (PlayCircle)' },
  { value: 'Clapperboard', label: 'آپارات / ویدیو (Clapperboard)' },
  { value: 'Instagram', label: 'اینستاگرام (Instagram)' },
  { value: 'Twitter', label: 'توییتر / ایکس (Twitter)' },
  { value: 'Linkedin', label: 'لینکدین (Linkedin)' },
  { value: 'Youtube', label: 'یوتیوب (Youtube)' },
  { value: 'Video', label: 'ویدیو / آپارات (Video)' },
  { value: 'Mic', label: 'پادکست (Mic)' },
  { value: 'Rss', label: 'فید خبری (Rss)' },
  { value: 'Newspaper', label: 'خبرگزاری (Newspaper)' },
  { value: 'Radio', label: 'رادیو (Radio)' },
  { value: 'Tv', label: 'تلویزیون (Tv)' },
  { value: 'Share2', label: 'انتشار عمومی (Share2)' },
] as const;

const PLATFORM_ICONS: Record<string, LucideIcon> = {
  Globe,
  Send,
  MessageCircle,
  MessageSquare,
  PlayCircle,
  Clapperboard,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  Video,
  Mic,
  Rss,
  Newspaper,
  Radio,
  Tv,
  Share2,
};

export const platformIcon = (iconName?: string): LucideIcon =>
  PLATFORM_ICONS[iconName || 'Globe'] || Globe;
