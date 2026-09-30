import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { PriorityPill, TaskStatusBadge, ProjectStatusBadge } from '../common/PriorityPill';
import { Avatar } from '../common/Avatar';
import { 
  Search, 
  FolderKanban, 
  CheckSquare, 
  Users2, 
  X, 
  ArrowLeft,
  Sparkles,
  Command,
  FolderOpen,
  FileText,
  Building2,
  Network
} from 'lucide-react';
import { request } from '../../api/client';

type SearchAsset = { id: number; type: 'file' | 'content'; title: string; latest_file?: { original_filename: string; extension?: string; file_size: number } };
type SearchAssetPage = { data: SearchAsset[] };

export const GlobalSearchModal: React.FC = () => {
  const { 
    isSearchOpen, 
    setIsSearchOpen, 
    tasks, 
    projects, 
    users,
    departments,
    contents,
    setSelectedTaskId, 
    setSelectedProjectId,
    setSelectedMemberId,
    setSelectedContentId,
    setDetailAssetId,
    setActiveView
  } = useApp();

  const [query, setQuery] = useState('');
  const [matchedAssets, setMatchedAssets] = useState<SearchAsset[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(!isSearchOpen);
      }
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, setIsSearchOpen]);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isSearchOpen]);

  const normalized = query.toLowerCase().trim();

  useEffect(() => {
    if (!isSearchOpen) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ per_page: '4' });
      if (normalized) params.set('search', normalized);
      request<SearchAssetPage>(`/dam/library?${params}`)
        .then(response => setMatchedAssets(response.data || []))
        .catch(() => setMatchedAssets([]));
    }, normalized ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [isSearchOpen, normalized]);

  if (!isSearchOpen) return null;

  const matchedTasks = tasks.filter(t => 
    !normalized || 
    t.title.toLowerCase().includes(normalized) ||
    t.description.toLowerCase().includes(normalized) ||
    t.tags.some(tag => tag.toLowerCase().includes(normalized))
  ).slice(0, 4);

  const matchedProjects = projects.filter(p =>
    !normalized ||
    p.name.toLowerCase().includes(normalized) ||
    p.description.toLowerCase().includes(normalized) ||
    p.tags.some(tag => tag.toLowerCase().includes(normalized)) ||
    p.key.toLowerCase().includes(normalized)
  ).slice(0, 3);

  const matchedUsers = users.filter(u =>
    !normalized ||
    u.name.toLowerCase().includes(normalized) ||
    (u.department || '').toLowerCase().includes(normalized) ||
    (u.title || '').toLowerCase().includes(normalized) ||
    (u.skills || []).some(s => s.toLowerCase().includes(normalized))
  ).slice(0, 3);

  const matchedContents = contents.filter(content =>
    !normalized || content.title.toLowerCase().includes(normalized) ||
    (content.topic || '').toLowerCase().includes(normalized) ||
    (content.description || '').toLowerCase().includes(normalized)
  ).slice(0, 4);

  const matchedDepartments = departments.filter(department =>
    !normalized || department.name.toLowerCase().includes(normalized) ||
    department.description.toLowerCase().includes(normalized)
  ).slice(0, 3);

  const handleSelectTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    setIsSearchOpen(false);
  };

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveView('project-detail');
    setIsSearchOpen(false);
  };

  const handleSelectAsset = (asset: SearchAsset) => {
    setDetailAssetId(String(asset.id));
    setActiveView('assets');
    setIsSearchOpen(false);
  };

  const handleSelectUser = (userId: string) => {
    setSelectedMemberId(userId);
    setActiveView('departments');
    setIsSearchOpen(false);
  };

  const handleSelectContent = (contentId: string) => {
    setSelectedContentId(contentId);
    setActiveView('content-detail');
    setIsSearchOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-right" dir="rtl">
        {/* Search Input Bar */}
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در پروژه‌ها، وظایف، محتوا، کاربران و دپارتمان‌ها..."
            className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-600 focus:outline-hidden"
          />
          {query && (
            <button 
              onClick={() => setQuery('')}
              className="p-1 text-slate-600 hover:text-slate-600 rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsSearchOpen(false)}
            className="text-xs font-semibold px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md transition-colors cursor-pointer"
          >
            ESC
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-5">
          {/* Digital Assets Results */}
          {matchedAssets.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 px-1">
                <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                <span>دارایی‌های دیجیتال ({matchedAssets.length})</span>
              </div>
              <div className="space-y-1">
                {matchedAssets.map(asset => (
                  <button
                    key={asset.id}
                    onClick={() => handleSelectAsset(asset)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-amber-50/60 hover:border-amber-200 border border-transparent transition-colors text-right group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-[10px] shrink-0 uppercase">
                        {asset.type === 'content' ? 'TXT' : asset.latest_file?.extension?.toUpperCase() || 'FILE'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {asset.title}
                        </div>
                        <p className="text-[11px] text-slate-600 truncate">{asset.type === 'content' ? 'محتوای متنی' : `${asset.latest_file?.original_filename || 'فایل'} • ${(asset.latest_file?.file_size || 0).toLocaleString('fa-IR')} بایت`}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {asset.type === 'content' ? 'متن' : 'فایل'}
                      </span>
                      <ArrowLeft className="w-4 h-4 text-slate-600 group-hover:text-amber-600 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Projects Results */}
          {matchedProjects.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 px-1">
                <FolderKanban className="w-3.5 h-3.5 text-indigo-500" />
                <span>پروژه‌ها ({matchedProjects.length})</span>
              </div>
              <div className="space-y-1">
                {matchedProjects.map(proj => (
                  <button
                    key={proj.id}
                    onClick={() => handleSelectProject(proj.id)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-indigo-50/50 hover:border-indigo-200 border border-transparent transition-colors text-right group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span 
                        className="w-3 h-3 rounded-xs shrink-0"
                        style={{ backgroundColor: proj.color }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-2">
                          <span>{proj.name}</span>
                          <span className="text-[10px] font-mono text-slate-600">[{proj.key}]</span>
                        </div>
                        <p className="text-[11px] text-slate-600 truncate">{proj.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ProjectStatusBadge status={proj.status} size="sm" />
                      <ArrowLeft className="w-4 h-4 text-slate-600 group-hover:text-indigo-600 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tasks Results */}
          {matchedTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 px-1">
                <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                <span>وظایف و تسک‌ها ({matchedTasks.length})</span>
              </div>
              <div className="space-y-1">
                {matchedTasks.map(task => {
                  const proj = projects.find(p => p.id === task.projectId);
                  return (
                    <button
                      key={task.id}
                      onClick={() => handleSelectTask(task.id)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 hover:border-slate-200 border border-transparent transition-colors text-right group cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 pl-3">
                        <div className="flex items-center gap-2 mb-0.5">
                          {proj && (
                            <span 
                              className="text-[10px] font-bold px-1.5 py-0.2 rounded-xs text-white"
                              style={{ backgroundColor: proj.color }}
                            >
                              {proj.key}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {task.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-600">
                          <span>مهلت: {task.deadline}</span>
                          {task.tags.map(tag => (
                            <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 rounded-sm">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityPill priority={task.priority} size="sm" />
                        <TaskStatusBadge status={task.status} size="sm" />
                        <ArrowLeft className="w-4 h-4 text-slate-600 group-hover:text-indigo-600 transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* People Results */}
          {matchedContents.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-2 px-1"><FileText className="w-3.5 h-3.5 text-rose-500" /><span>محتواها ({matchedContents.length})</span></div>
              <div className="space-y-1">{matchedContents.map(content => <button key={content.id} onClick={() => handleSelectContent(content.id)} className="w-full p-2.5 rounded-xl hover:bg-rose-50 border border-slate-100 text-right"><div className="text-xs font-bold text-slate-900">{content.title}</div><div className="text-[11px] text-slate-500">{content.topic || content.type}</div></button>)}</div>
            </div>
          )}

          {(matchedDepartments.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-2"><Building2 className="w-3.5 h-3.5 text-purple-600" />دپارتمان‌ها</div>{matchedDepartments.map(department => <button key={department.id} onClick={() => { setActiveView('departments'); setIsSearchOpen(false); }} className="w-full p-2 text-right rounded-xl hover:bg-purple-50 text-xs font-bold">{department.name}</button>)}</div>
            </div>
          )}

          {matchedUsers.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 px-1">
                <Users2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>کاربران ({matchedUsers.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {matchedUsers.map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user.id)}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 border border-slate-200/80 transition-colors text-right group cursor-pointer"
                  >
                    <Avatar user={user} size="md" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {user.name}
                      </div>
                      <div className="text-[11px] text-slate-600 truncate">
                        {user.title} • {user.department}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {matchedProjects.length === 0 && matchedTasks.length === 0 && matchedUsers.length === 0 && matchedAssets.length === 0 && matchedContents.length === 0 && matchedDepartments.length === 0 && (
            <div className="py-12 text-center">
              <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">نتیجه‌ای یافت نشد</p>
              <p className="text-xs text-slate-600 mt-1">کلماتی مانند «لوگو»، «کانبان»، «طراحی»، «علی» یا برچسب‌ها را جستجو کنید</p>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600 font-medium">
          <div className="flex items-center gap-3">
            <span>پیمایش: <kbd className="bg-white border px-1 rounded-sm">↑</kbd> <kbd className="bg-white border px-1 rounded-sm">↓</kbd></span>
            <span>انتخاب: <kbd className="bg-white border px-1 rounded-sm">Enter</kbd></span>
          </div>
          <span>بستن: <kbd className="bg-white border px-1 rounded-sm">ESC</kbd></span>
        </div>
      </div>
    </div>
  );
};
