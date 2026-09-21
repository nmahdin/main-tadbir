const fs = require('fs');
let code = fs.readFileSync('src/components/content/ContentDetailView.tsx', 'utf8');

const targetStr = `{activeTab === 'publish' && (
          <div className="text-center py-12 text-slate-500">
            <Globe className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-700">مدیریت انتشار</p>
            <p className="text-sm mt-1">اطلاعات زمان‌بندی انتشار و پلتفرم‌های مقصد.</p>
          </div>
        )}`;

const replacementStr = `{activeTab === 'publish' && (
          <div className="space-y-6">
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">وضعیت و پلتفرم‌های انتشار</h3>
                    <p className="text-xs text-slate-500">جزئیات مربوط به پخش و نشر محتوا</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={\`px-3 py-1 text-xs font-bold rounded-lg border \${
                    content.publishInfo?.status === 'published' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    content.publishInfo?.status === 'scheduled' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    content.publishInfo?.status === 'cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    'bg-slate-100 text-slate-700 border-slate-200'
                  }\`}>
                    {content.publishInfo?.status === 'published' ? 'منتشرشده' :
                     content.publishInfo?.status === 'scheduled' ? 'زمان‌بندی‌شده' :
                     content.publishInfo?.status === 'cancelled' ? 'لغو شده' : 'برنامه‌ریزی نشده'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">تاریخ انتشار</label>
                  <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>{content.publishInfo?.date || 'تنظیم نشده'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">ساعت انتشار</label>
                  <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>{content.publishInfo?.time || 'تنظیم نشده'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <label className="text-xs font-bold text-slate-700 mb-2 block">پلتفرم‌های مقصد</label>
                <div className="flex flex-wrap gap-2">
                  {content.publishInfo?.channels?.length > 0 ? (
                    content.publishInfo.channels.map(channel => (
                      <span key={channel} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-bold flex items-center gap-1.5">
                        <Share2 className="w-3.5 h-3.5" />
                        {channel}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">پلتفرمی انتخاب نشده است.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer">
                ویرایش تنظیمات انتشار
              </button>
            </div>
          </div>
        )}`;

const importTarget = `import { \n  ArrowRight,\n  MessageSquare,`;
const importReplacement = `import { \n  ArrowRight,\n  MessageSquare,\n  Share2,`;

code = code.replace(targetStr, replacementStr);
if (code.includes('Share2') && !code.includes('import { Share2 }') && !code.includes('Share2,')) {
    code = code.replace(importTarget, importReplacement);
}

fs.writeFileSync('src/components/content/ContentDetailView.tsx', code);
