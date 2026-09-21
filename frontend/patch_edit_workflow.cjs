const fs = require('fs');
let code = fs.readFileSync('src/components/content/EditWorkflowModal.tsx', 'utf8');

const regexGrid = /<div className="col-span-12 md:col-span-4">[\s\S]*?<\/div>[\s\S]*?<div className="col-span-12 md:col-span-3">[\s\S]*?<\/div>[\s\S]*?<div className="col-span-12 md:col-span-3">[\s\S]*?<\/div>[\s\S]*?<div className="col-span-12 md:col-span-2">[\s\S]*?<\/div>/;

code = code.replace(regexGrid, `
                  <div className="col-span-12 md:col-span-3">
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">عنوان مرحله</label>
                    <input 
                      type="text" 
                      value={stage.title}
                      onChange={e => handleUpdateStage(stage.id, { title: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-hidden"
                    />
                  </div>
                  
                  <div className="col-span-12 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">دپارتمان</label>
                    <select 
                      value={stage.departmentId}
                      onChange={e => {
                        const dept = departments.find(d => d.id === e.target.value);
                        handleUpdateStage(stage.id, { 
                          departmentId: e.target.value,
                          departmentName: dept?.name || ''
                        });
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-hidden"
                    >
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="col-span-12 md:col-span-3">
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">مسئول</label>
                    <select 
                      value={stage.assigneeId || ''}
                      onChange={e => handleUpdateStage(stage.id, { assigneeId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-hidden"
                    >
                      <option value="">بدون مسئول مشخص</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-12 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">ارزیاب</label>
                    <select 
                      value={stage.approverId || ''}
                      onChange={e => handleUpdateStage(stage.id, { approverId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-hidden"
                    >
                      <option value="">بدون ارزیاب</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="col-span-12 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">وضعیت</label>
                    <select 
                      value={stage.status}
                      onChange={e => handleUpdateStage(stage.id, { status: e.target.value as any })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-hidden"
                    >
                      <option value="not_started">شروع نشده</option>
                      <option value="pending_dependency">در انتظار پیش‌نیاز</option>
                      <option value="in_progress">در حال انجام</option>
                      <option value="ready_for_review">آماده بررسی</option>
                      <option value="revisions_needed">نیازمند اصلاح</option>
                      <option value="approved">تأیید شده</option>
                      <option value="completed">تکمیل شده</option>
                    </select>
                  </div>
`);

fs.writeFileSync('src/components/content/EditWorkflowModal.tsx', code);
