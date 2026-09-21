import React from 'react';
import { ContentStatus } from '../types';

export const getContentStatusBadge = (status: ContentStatus) => {
  switch (status) {
    case 'idea': return <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold border border-slate-200 whitespace-nowrap">ایده اولیه</span>;
    case 'planning': return <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-[10px] font-bold border border-blue-200 whitespace-nowrap">برنامه‌ریزی</span>;
    case 'producing': return <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-[10px] font-bold border border-amber-200 whitespace-nowrap">در حال تولید</span>;
    case 'in_progress': return <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-[10px] font-bold border border-amber-200 whitespace-nowrap">در حال انجام</span>;
    case 'reviewing': return <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-md text-[10px] font-bold border border-purple-200 whitespace-nowrap">در انتظار بازبینی</span>;
    case 'revising': return <span className="px-2 py-1 bg-rose-50 text-rose-700 rounded-md text-[10px] font-bold border border-rose-200 whitespace-nowrap">نیازمند اصلاح</span>;
    case 'approving': return <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-bold border border-indigo-200 whitespace-nowrap">در انتظار تأیید</span>;
    case 'approved': return <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-bold border border-emerald-200 whitespace-nowrap">تأییدشده</span>;
    case 'ready_to_publish': return <span className="px-2 py-1 bg-teal-50 text-teal-700 rounded-md text-[10px] font-bold border border-teal-200 whitespace-nowrap">آماده انتشار</span>;
    case 'published': return <span className="px-2 py-1 bg-green-50 text-green-700 rounded-md text-[10px] font-bold border border-green-200 whitespace-nowrap">منتشرشده</span>;
    case 'completed': return <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-bold border border-emerald-200 whitespace-nowrap">انجام شده</span>;
    case 'suspended': return <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded-md text-[10px] font-bold border border-orange-200 whitespace-nowrap">تعلیق</span>;
    case 'cancelled': return <span className="px-2 py-1 bg-red-50 text-red-700 rounded-md text-[10px] font-bold border border-red-200 whitespace-nowrap">لغو شده</span>;
    case 'archived': return <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-md text-[10px] font-bold border border-slate-200 whitespace-nowrap">آرشیو</span>;
    default: return <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold border border-slate-200 whitespace-nowrap">{status}</span>;
  }
};
