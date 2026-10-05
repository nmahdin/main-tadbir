import React, { useMemo, useState } from 'react';
import { ChevronLeft, Folder, FolderPlus, HardDrive, X } from 'lucide-react';
import { Button, Input } from '../common/Primitives';

export type RepositoryFolder = {
  id: number;
  name: string;
  parent_id: number | null;
  management_type?: 'system' | 'user';
};

/** Shared repository-root browser used by every DAM transfer operation. */
export function FolderBrowserModal({
  folders,
  initialFolderId = null,
  blockedIds = [],
  title = 'انتخاب پوشه مقصد',
  busy = false,
  onCreate,
  onSelect,
  onClose,
}: {
  folders: RepositoryFolder[];
  initialFolderId?: number | null;
  blockedIds?: number[];
  title?: string;
  busy?: boolean;
  onCreate: (name: string, parentId: number | null) => Promise<RepositoryFolder>;
  onSelect: (folderId: number | null) => void | Promise<void>;
  onClose: () => void;
}) {
  const [currentId, setCurrentId] = useState<number | null>(initialFolderId);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);
  const blocked = useMemo(() => new Set(blockedIds), [blockedIds]);
  const children = folders.filter(folder => folder.parent_id === currentId && !blocked.has(folder.id));
  const path = useMemo(() => {
    const result: RepositoryFolder[] = [];
    let cursor = currentId ? folders.find(folder => folder.id === currentId) : undefined;
    let guard = 0;
    while (cursor && guard++ < 100) {
      result.unshift(cursor);
      cursor = cursor.parent_id ? folders.find(folder => folder.id === cursor!.parent_id) : undefined;
    }
    return result;
  }, [currentId, folders]);
  const create = async () => {
    const name = newFolderName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const created = await onCreate(name, currentId);
      setCurrentId(created.id);
      setNewFolderName('');
      setNewFolderOpen(false);
    } finally { setCreating(false); }
  };

  return <div className="fixed inset-0 z-[88] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" dir="rtl">
    <section role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[82dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div><h2 className="text-sm font-black text-slate-900">{title}</h2><p className="mt-1 text-[10px] text-slate-500">از ریشه مخزن حرکت کنید، پوشه بسازید و مقصد را تأیید کنید.</p></div>
        <button type="button" onClick={onClose} disabled={busy || creating} className="rounded-lg p-2 text-slate-400 hover:bg-slate-200"><X className="h-4 w-4" /></button>
      </header>
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 bg-white px-4 py-2 text-[11px]">
        <button type="button" onClick={() => setCurrentId(null)} className="flex shrink-0 items-center gap-1 font-bold text-indigo-700"><HardDrive className="h-4 w-4" />ریشه مخزن</button>
        {path.map(folder => <React.Fragment key={folder.id}><ChevronLeft className="h-3.5 w-3.5 shrink-0 text-slate-300" /><button type="button" onClick={() => setCurrentId(folder.id)} className="max-w-36 shrink-0 truncate font-bold text-slate-600 hover:text-indigo-700">{folder.name}</button></React.Fragment>)}
      </div>
      <div className="min-h-64 flex-1 overflow-y-auto bg-slate-50/50 p-3">
        <button type="button" onDoubleClick={() => setCurrentId(path[path.length - 2]?.id || null)} onClick={() => setCurrentId(path[path.length - 2]?.id || null)} disabled={currentId === null} className="mb-2 flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right text-xs font-bold text-slate-600 disabled:hidden"><Folder className="h-5 w-5 text-slate-400" />.. <span className="font-normal text-slate-400">پوشه بالاتر</span></button>
        <div className="grid gap-2 sm:grid-cols-2">{children.map(folder => <button type="button" key={folder.id} onDoubleClick={() => setCurrentId(folder.id)} onClick={() => setCurrentId(folder.id)} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-right transition hover:border-amber-300 hover:shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500"><Folder className="h-5 w-5" /></span><span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">{folder.name}</span></button>)}</div>
        {!children.length && <p className="py-16 text-center text-xs text-slate-400">این پوشه زیرپوشه‌ای ندارد.</p>}
      </div>
      {newFolderOpen && <div className="flex gap-2 border-t border-slate-100 px-4 py-3"><Input autoFocus value={newFolderName} onChange={event => setNewFolderName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void create(); } }} placeholder="نام پوشه جدید" maxLength={255} /><Button type="button" loading={creating} disabled={!newFolderName.trim()} onClick={() => void create()}>ساخت</Button></div>}
      <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
        <button type="button" onClick={() => setNewFolderOpen(open => !open)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50"><FolderPlus className="h-4 w-4" />پوشه جدید</button>
        <div className="flex gap-2"><Button type="button" variant="secondary" disabled={busy || creating} onClick={onClose}>انصراف</Button><Button type="button" loading={busy} disabled={creating || (currentId !== null && blocked.has(currentId))} onClick={() => void onSelect(currentId)}>انتخاب این پوشه</Button></div>
      </footer>
    </section>
  </div>;
}
