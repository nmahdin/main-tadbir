import { AlertCircle, BellRing, Blocks, BookOpen, CalendarDays, FormInput, GalleryHorizontal, Grid2x2, LayoutDashboard, LayoutPanelTop, Layers, MousePointerClick, Palette, PanelsTopLeft, Radius, Ruler, Shapes, Sparkles, Table2, TextCursorInput, Type, type LucideIcon } from 'lucide-react';
export const STUDIO_ROOT='/theme-previews';
export type StudioPage={id:string;slug:string;title:string;description:string;group:string;icon:LucideIcon};
export type StudioGroup={id:string;title:string;items:readonly StudioPage[]};
const item=(group:string,id:string,slug:string,title:string,description:string,icon:LucideIcon):StudioPage=>({group,id,slug,title,description,icon});
export const STUDIO_GROUPS:readonly StudioGroup[]=[
 {id:'home',title:'شروع و راهنما',items:[
  item('home','overview','','نمای کلی استودیو','نقشهٔ بخش‌ها و وضعیت سیستم طراحی',LayoutDashboard),
  item('home','gallery','gallery','گالری قدیمی','نسخهٔ مرجع از ویترین کامپوننت‌های موجود',GalleryHorizontal)
 ]},
 {id:'foundations',title:'مبانی طراحی',items:[
  item('foundations','colors','foundations/colors','رنگ‌ها و پالت','توکن‌های معنایی و دسترس‌پذیری رنگ‌ها',Palette),
  item('foundations','typography','foundations/typography','تایپوگرافی','خط فارسی، اندازه و سلسله‌مراتب متن',Type),
  item('foundations','spacing','foundations/spacing','فاصله‌گذاری','ریتم بصری و گرید واکنش‌گرا',Ruler),
  item('foundations','radius','foundations/radius','گردی سطوح','مقایسهٔ ۲۴ پیکسل مصوب با ۲۸ پیکسل پیشنهادی',Radius),
  item('foundations','shadows','foundations/shadows','سایه‌ها','ارتفاع‌های مجاز و استفادهٔ گزینشی',Layers),
  item('foundations','icons','foundations/icons','آیکن‌ها','جهت و اندازهٔ آیکن‌ها در رابط راست‌به‌چپ',Shapes)
 ]},
 {id:'components',title:'اجزای رابط کاربری',items:[
  item('components','buttons','components/buttons','دکمه‌ها','حالت‌های تعاملی، تغییر وضعیت و بازخورد',MousePointerClick),
  item('components','inputs','components/inputs','کنترل‌های ورودی','انتخاب‌گرها، فیلدها و کنترل‌های ورودی',TextCursorInput),
  item('components','forms','components/forms','فرم‌های کامل','اعتبارسنجی و پیام‌های راهنما',FormInput),
  item('components','data','components/data','جدول، فهرست و کارت','مرتب‌سازی آزمایشی و صفحه‌بندی',Table2),
  item('components','feedback','components/feedback','هشدارها و پنجره‌ها','اعلان، توست، مودال و کشو',BellRing),
  item('components','states','components/states','وضعیت‌های صفحه','Loading، Skeleton، Empty، Error',AlertCircle),
  item('components','navigation','components/navigation','ناوبری و لایه‌ها','تب، Breadcrumb، Tooltip و Popover',PanelsTopLeft),
  item('components','dashboard','components/dashboard','داشبورد و ابزارک‌ها','کارت‌های آماری و نماهای نمونه',Grid2x2),
  item('components','locale','components/locale','فارسی و راست‌به‌چپ','ارقام، تاریخ و متن ترکیبی فارسی و لاتین',CalendarDays)
 ]},
 {id:'prototypes',title:'نمونه‌های تعاملی',items:[
  item('prototypes','shell','prototypes/shell','پوستهٔ آزمایشی','سایدبار و هدر تعاملی با دادهٔ ساختگی',LayoutPanelTop),
  item('prototypes','tour','prototypes/tour','تور محصول','معرفی گام‌به‌گام سه محیط نمونه',Sparkles),
  item('prototypes','layout','prototypes/layout','چیدمان داشبورد','ویرایش آزمایشی ابزارک‌های مجاز',Blocks)
 ]},
 {id:'references',title:'پژوهش و استانداردها',items:[
  item('references','coverage','research/coverage','پوشش کامپوننت‌ها','مقایسهٔ اولویت‌دار با چهار کتابخانهٔ معتبر',BookOpen)
 ]}
];
export const STUDIO_PAGES=STUDIO_GROUPS.flatMap(group=>group.items);
export function studioPath(slug:string){return slug?STUDIO_ROOT+'/'+slug:STUDIO_ROOT;}
export function resolveStudioPage(path:string):StudioPage|null{
 const normalized=path.replace(/\/+$/,'')||'/';
 return STUDIO_PAGES.find(page=>studioPath(page.slug)===normalized)??null;
}
export function studioGroupFor(page:StudioPage|null){return STUDIO_GROUPS.find(group=>group.id===page?.group)??null;}
export function studioToggleGroup(groups:readonly string[],id:string){return groups.includes(id)?groups.filter(x=>x!==id):[...groups,id];}