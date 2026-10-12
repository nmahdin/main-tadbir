import React, { useEffect, useState } from 'react';
import { request } from '../../api/client';
import { formatPersianDate } from '../../utils/date';
import { useApp } from '../../context/AppContext';
import { ContentStatusBadge } from '../../utils/statusBadges';
import { TaskStatusBadge, ProjectStatusBadge } from '../common/PriorityPill';
import {
  Archive,
  RotateCcw,
  FolderKanban,
  CheckSquare,
  PenTool,
  HardDrive,
  CalendarDays,
  Lightbulb,
  LoaderCircle,
  Trash2
} from 'lucide-react';

type ArchivedAsset = { id: number; title: string; type: 'file' | 'content'; updated_at: string; owner?: { name: string }; latest_file?: { original_filename?: string } };
type ArchiveTab = 'contents' | 'projects' | 'tasks' | 'ideas' | 'meetings' | 'assets';

const TABS: { id: ArchiveTab; label: string; icon: React.ReactNode; permission: string }[] = [
  { id: 'contents', label: 'محتواها', icon: <PenTool className="w-4 h-4" />, permission: 'content.view' },
  { id: 'projects', label: 'پروژه‌ها', icon: <FolderKanban className="w-4 h-4" />, permission: 'projects.view' },
  { id: 'tasks', label: 'تسک‌ها', icon: <CheckSquare className="w-4 h-4" />, permission: 'tasks.view' },
  { id: 'ideas', label: 'ایده‌ها', icon: <Lightbulb className="w-4 h-4" />, permission: 'thinktank.view' },
  { id: 'meetings', label: 'جلسات', icon: <CalendarDays className="w-4 h-4" />, permission: 'meetings.view' },
  { id: 'assets', label: 'دارایی‌های دیجیتال', icon: <HardDrive className="w-4 h-4" />, permission: 'assets.view' },
];

export const ArchiveView: React.FC = () => {
  const {
    contents,
    projects,
    tasks,
    thinkTankMeetings,
    ideas,
    users,
    currentUser,
    setActiveView,
    setSelectedContentId,
    setSelectedProjectId,
    setSelectedTaskId,
    setDetailAssetId,
    hasPermission,
    unarchiveItem,
    updateIdea,
    updateThinkTankMeeting,
    forceDeleteContent,
    forceDeleteProject,
    deleteTask,
    deleteIdea,
    deleteThinkTankMeeting,
    notify
  } = useApp();
  const visibleTabs = TABS.filter(tab => hasPermission(tab.permission));
  const [activeTab, setActiveTab] = useState<ArchiveTab>(() => visibleTabs[0]?.id ?? 'contents');
  const [archivedAssets, setArchivedAssets] = useState<ArchivedAsset[]>([]);
  const [deletingKey, setDeletingKey] = useState('');
  const firstVisibleTab = visibleTabs[0]?.id;

  useEffect(() => {
    if (firstVisibleTab && !visibleTabs.some(tab => tab.id === activeTab)) setActiveTab(firstVisibleTab);
  }, [activeTab, firstVisibleTab, visibleTabs]);

  useEffect(() => {
    if (!hasPermission('assets.view')) return;
    void request<{ data: ArchivedAsset[] }>('/dam/library?status=archived&per_page=100').then(response => setArchivedAssets(response.data)).catch(() => setArchivedAssets([]));
  }, [hasPermission]);

  const restoreAsset = async (assetId: number) => {
    await request(`/dam/library/${assetId}/restore`, { method: 'POST' });
    setArchivedAssets(previous => previous.filter(asset => asset.id !== assetId));
  };
  const permanentlyDelete = async (key: string, title: string, action: () => Promise<boolean | void>) => {
    if (deletingKey || !window.confirm(`«${title}» برای همیشه حذف شود؟ این عملیات قابل بازگشت نیست.`)) return;
    setDeletingKey(key);
    try {
      const result = await action();
      if (result === false) return;
      notify({ type: 'success', title: 'حذف نهایی انجام شد', message: `«${title}» از بایگانی حذف شد.` });
    } catch (error) {
      notify({ type: 'error', title: 'حذف نهایی انجام نشد', message: error instanceof Error ? error.message : 'دوباره تلاش کنید.' });
    } finally {
      setDeletingKey('');
    }
  };

  const archivedContents = contents.filter(content => content.status === 'archived');
  const archivedProjects = projects.filter(project => project.status === 'archived');
  const archivedTasks = tasks.filter(task => task.status === 'archived');
  const archivedIdeas = ideas.filter(idea => idea.status === 'archived');
  const archivedMeetings = thinkTankMeetings.filter(meeting => meeting.status === 'archived');

  const counts: Record<ArchiveTab, number> = {
    contents: archivedContents.length,
    projects: archivedProjects.length,
    tasks: archivedTasks.length,
    ideas: archivedIdeas.length,
    meetings: archivedMeetings.length,
    assets: archivedAssets.length,
  };

  const userName = (id?: string) => users.find(u => u.id === id)?.name || 'نامشخص';

  return (
    <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-600 flex items-center justify-center text-white shadow-md shadow-slate-300">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">بایگانی</h1>
            <p className="text-sm text-slate-500 mt-1 font-medium">
              آیتم‌های بایگانی‌شده را بازیابی، بررسی یا با مجوز لازم حذف نهایی کنید
            </p>
          </div>
        </div>

      </div>

      <div className="flex items-center gap-2 flex-wrap p-1.5 bg-white rounded-2xl border border-slate-200 shadow-2xs w-fit">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
              activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {counts[tab.id]}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4 whitespace-nowrap">عنوان</th>
                <th className="p-4 whitespace-nowrap">وضعیت</th>
                <th className="p-4 whitespace-nowrap">مسئول</th>
                <th className="p-4 whitespace-nowrap">آخرین به‌روزرسانی</th>
                <th className="p-4 w-44 whitespace-nowrap">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeTab === 'contents' && archivedContents.map(content => (
                <tr key={content.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    <span
                      className="text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer"
                      onClick={() => { setSelectedContentId(content.id); setActiveView('content-detail'); }}
                    >
                      {content.title}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">{content.topic || 'بدون موضوع'}</p>
                  </td>
                  <td className="p-4"><ContentStatusBadge status={content.status} /></td>
                  <td className="p-4 text-xs font-medium text-slate-700">{userName(content.ownerId)}</td>
                  <td className="p-4 text-xs text-slate-500">{formatPersianDate(content.updatedAt)}</td>
                  <td className="p-4 text-left"><div className="flex items-center justify-end gap-1.5">
                    <button type="button" onClick={() => unarchiveItem('content', content.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"><RotateCcw className="h-4 w-4" /><span>بازیابی</span></button>
                    {hasPermission('content.force_delete') && <button type="button" disabled={Boolean(deletingKey)} onClick={() => void permanentlyDelete(`content:${content.id}`, content.title, () => forceDeleteContent(content.id))} aria-label={`حذف نهایی ${content.title}`} title="حذف نهایی" className="rounded-xl bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 disabled:opacity-50">{deletingKey === `content:${content.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>}
                  </div></td>
                </tr>
              ))}
              {activeTab === 'projects' && archivedProjects.map(project => (
                <tr key={project.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    <span
                      className="text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer"
                      onClick={() => { setSelectedProjectId(project.id); setActiveView('project-detail'); }}
                    >
                      {project.name}
                    </span>

                  </td>
                  <td className="p-4"><ProjectStatusBadge status={project.status} size="sm" /></td>
                  <td className="p-4 text-xs font-medium text-slate-700">{userName(project.projectManagerId)}</td>
                  <td className="p-4 text-xs text-slate-500">{formatPersianDate(project.deadline)}</td>
                  <td className="p-4 text-left"><div className="flex items-center justify-end gap-1.5">
                    <button type="button" onClick={() => unarchiveItem('project', project.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"><RotateCcw className="h-4 w-4" /><span>بازیابی</span></button>
                    {hasPermission('projects.delete') && <button type="button" disabled={Boolean(deletingKey)} onClick={() => void permanentlyDelete(`project:${project.id}`, project.name, () => forceDeleteProject(project.id))} aria-label={`حذف نهایی ${project.name}`} title="حذف نهایی" className="rounded-xl bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 disabled:opacity-50">{deletingKey === `project:${project.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>}
                  </div></td>
                </tr>
              ))}
              {activeTab === 'tasks' && archivedTasks.map(task => (
                <tr key={task.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    <span
                      className="text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer"
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      {task.title}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">{task.projectId || 'بدون پروژه'}</p>
                  </td>
                  <td className="p-4"><TaskStatusBadge status={task.status} size="sm" /></td>
                  <td className="p-4 text-xs font-medium text-slate-700">{userName(task.assigneeId)}</td>
                  <td className="p-4 text-xs text-slate-500">{formatPersianDate(task.updatedAt || task.deadline)}</td>
                  <td className="p-4 text-left"><div className="flex items-center justify-end gap-1.5">
                    <button type="button" onClick={() => unarchiveItem('task', task.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"><RotateCcw className="h-4 w-4" /><span>بازیابی</span></button>
                    {hasPermission('tasks.delete') && <button type="button" disabled={Boolean(deletingKey)} onClick={() => void permanentlyDelete(`task:${task.id}`, task.title, () => deleteTask(task.id))} aria-label={`حذف نهایی ${task.title}`} title="حذف نهایی" className="rounded-xl bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 disabled:opacity-50">{deletingKey === `task:${task.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>}
                  </div></td>
                </tr>
              ))}
              {activeTab === 'ideas' && archivedIdeas.map(idea => (
                <tr key={idea.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4"><span className="text-sm font-bold text-slate-900">{idea.title}</span><p className="mt-0.5 text-xs text-slate-500">{idea.code || 'ایده'}</p></td>
                  <td className="p-4"><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">بایگانی‌شده</span></td>
                  <td className="p-4 text-xs font-medium text-slate-700">{userName(idea.creatorId)}</td>
                  <td className="p-4 text-xs text-slate-500">{formatPersianDate(idea.updatedAt || idea.createdAt)}</td>
                  <td className="p-4 text-left"><div className="flex items-center justify-end gap-1.5">
                    {hasPermission('thinktank.edit_idea') && <button type="button" onClick={() => void updateIdea(idea.id, { status: 'draft' }).then(() => notify({ type: 'success', title: 'ایده بازیابی شد' }))} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"><RotateCcw className="h-4 w-4" />بازیابی</button>}
                    {hasPermission('thinktank.delete_idea') && <button type="button" disabled={Boolean(deletingKey)} onClick={() => void permanentlyDelete(`idea:${idea.id}`, idea.title, () => deleteIdea(idea.id))} aria-label={`حذف نهایی ${idea.title}`} title="حذف نهایی" className="rounded-xl bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 disabled:opacity-50">{deletingKey === `idea:${idea.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>}
                  </div></td>
                </tr>
              ))}
              {activeTab === 'meetings' && archivedMeetings.map(meeting => (
                <tr key={meeting.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4"><span className="text-sm font-bold text-slate-900">{meeting.title}</span><p className="mt-0.5 text-xs text-slate-500">{formatPersianDate(meeting.date)}، ساعت {meeting.time}</p></td>
                  <td className="p-4"><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">بایگانی‌شده</span></td>
                  <td className="p-4 text-xs font-medium text-slate-700">{userName(meeting.organizerId)}</td>
                  <td className="p-4 text-xs text-slate-500">{formatPersianDate(meeting.createdAt)}</td>
                  <td className="p-4 text-left"><div className="flex items-center justify-end gap-1.5">
                    {meeting.organizerId === currentUser.id && hasPermission('meetings.edit') && <button type="button" onClick={() => void updateThinkTankMeeting(meeting.id, { status: meeting.archivedFromStatus || 'completed', archivedFromStatus: null }).then(() => notify({ type: 'success', title: 'جلسه بازیابی شد' })).catch(error => notify({ type: 'error', title: 'بازیابی جلسه انجام نشد', message: error instanceof Error ? error.message : 'دوباره تلاش کنید.' }))} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"><RotateCcw className="h-4 w-4" />بازیابی</button>}
                    {hasPermission('meetings.delete') && <button type="button" disabled={Boolean(deletingKey)} onClick={() => void permanentlyDelete(`meeting:${meeting.id}`, meeting.title, () => deleteThinkTankMeeting(meeting.id))} aria-label={`حذف نهایی ${meeting.title}`} title="حذف نهایی" className="rounded-xl bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 disabled:opacity-50">{deletingKey === `meeting:${meeting.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>}
                  </div></td>
                </tr>
              ))}
              {activeTab === 'assets' && archivedAssets.map(asset => (
                <tr key={asset.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4"><button type="button" onClick={() => { setDetailAssetId(String(asset.id)); setActiveView('assets'); }} className="text-sm font-bold text-slate-900 hover:text-indigo-600">{asset.title}</button><p className="mt-0.5 text-xs text-slate-500">{asset.latest_file?.original_filename || (asset.type === 'file' ? 'فایل' : 'محتوای متنی')}</p></td>
                  <td className="p-4"><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">بایگانی‌شده</span></td>
                  <td className="p-4 text-xs font-medium text-slate-700">{asset.owner?.name || 'نامشخص'}</td>
                  <td className="p-4 text-xs text-slate-500">{formatPersianDate(asset.updated_at)}</td>
                  <td className="p-4 text-left"><div className="flex items-center justify-end gap-1.5">
                    {hasPermission('assets.restore') && <button type="button" onClick={() => void restoreAsset(asset.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"><RotateCcw className="h-4 w-4" />بازیابی</button>}
                    {hasPermission('assets.delete') && <button type="button" disabled={Boolean(deletingKey)} onClick={() => void permanentlyDelete(`asset:${asset.id}`, asset.title, async () => { await request(`/dam/library/${asset.id}/force`, { method: 'DELETE' }); setArchivedAssets(previous => previous.filter(item => item.id !== asset.id)); })} aria-label={`حذف نهایی ${asset.title}`} title="حذف نهایی" className="rounded-xl bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 disabled:opacity-50">{deletingKey === `asset:${asset.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>}
                  </div></td>
                </tr>
              ))}
              {counts[activeTab] === 0 && (
                <tr>
                  <td colSpan={5} className="p-10 text-center">
                    <Archive className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-500">موردی در بایگانی یافت نشد.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
