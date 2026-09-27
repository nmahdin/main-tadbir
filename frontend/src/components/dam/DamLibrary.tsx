import React, { useEffect, useState } from 'react';
import { request, ApiResponse, apiConfig } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { LoaderCircle, Upload, FileText, Download } from 'lucide-react';

type Entry = {
  id: number; type: 'file' | 'content'; title: string; description?: string;
  confidentiality: string; status: string; created_at: string;
  latest_file?: { original_filename: string; file_size: number };
  content_item?: { content_body: string };
};
type Page = { data: Entry[]; last_page: number };
type Context = { project_id?: number; task_id?: number; department_id?: number };

/** Shared entry point; passing context pre-fills a project's or task's relationships. */
export const DamLibrary: React.FC<{ context?: Context; initialType?: 'all' | 'file' | 'content' }> = ({ context, initialType = 'all' }) => {
  const { hasPermission } = useApp();
  const [type, setType] = useState<'all' | 'file' | 'content'>(initialType);
  const [items, setItems] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [description, setDescription] = useState('');
  const [confidentiality, setConfidentiality] = useState('internal');
  const [files, setFiles] = useState<File[]>([]);
  const [folders, setFolders] = useState<{ id: number; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [folderId, setFolderId] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [tags, setTags] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [selected, setSelected] = useState<(Entry & { versions?: { id: number; version_number: number; change_description?: string }[] }) | null>(null);
  const [existing, setExisting] = useState<Entry[]>([]);
  const [showExisting, setShowExisting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState('');
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [confidentialityFilter, setConfidentialityFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ search: query, page: String(page) });
    if (type !== 'all') params.set('type', type);
    if (statusFilter) params.set('status', statusFilter);
    if (confidentialityFilter) params.set('confidentiality', confidentialityFilter);
    if (context?.project_id) params.set('project_id', String(context.project_id));
    if (context?.task_id) params.set('task_id', String(context.task_id));
    if (context?.department_id) params.set('department_id', String(context.department_id));
    request<Page>(`/dam/library?${params}`).then(response => {
      setItems(response.data); setLastPage(response.last_page || 1); setError('');
    }).catch(e => setError(e.message || 'دریافت فهرست ناموفق بود.')).finally(() => setLoading(false));
  }, [type, query, page, context?.project_id, context?.task_id, context?.department_id, statusFilter, confidentialityFilter, refresh]);

  useEffect(() => {
    Promise.all([request<{ data: { id: number; name: string }[] }>('/dam/library/folders'), request<{ data: { id: number; name: string }[] }>('/dam/library/categories')])
      .then(([f, c]) => { setFolders(f.data); setCategories(c.data); }).catch(() => {});
  }, []);

  async function createFolder() {
    if (!newFolderName.trim()) return;
    try {
      const response = await request<ApiResponse<{ id: number; name: string }>>('/dam/library/folders', { method: 'POST', body: { name: newFolderName.trim() } });
      setFolders(prev => [...prev, response.data]); setFolderId(String(response.data.id)); setNewFolderName('');
    } catch (err) { setError(err instanceof Error ? err.message : 'ساخت پوشه ناموفق بود.'); }
  }

  async function loadExisting() {
    setShowExisting(true);
    try {
      const response = await request<Page>('/dam/library');
      setExisting(response.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'دریافت مخزن ناموفق بود.'); }
  }

  async function attachExisting(asset: Entry) {
    const related_type = context?.task_id ? 'task' : context?.project_id ? 'project' : 'department';
    const related_id = context?.task_id || context?.project_id || context?.department_id;
    if (!related_id) return;
    try {
      await request(`/dam/library/${asset.id}/relations`, { method: 'POST', body: { related_type, related_id } });
      setResults([`«${asset.title}» بدون آپلود مجدد متصل شد.`]);
      setShowExisting(false); setRefresh(n => n + 1);
    } catch (err) { setError(err instanceof Error ? err.message : 'اتصال ناموفق بود.'); }
  }

  function upload(form: FormData, file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${apiConfig.baseUrl}/dam/library`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Accept', 'application/json');
      const csrf = document.cookie.split('; ').find(cookie => cookie.startsWith('XSRF-TOKEN='));
      if (csrf) xhr.setRequestHeader('X-XSRF-TOKEN', decodeURIComponent(csrf.slice('XSRF-TOKEN='.length)));
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) setProgress(prev => ({ ...prev, [file.name]: Math.round(event.loaded * 100 / event.total) }));
      };
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error((() => { try { return JSON.parse(xhr.responseText).message; } catch { return 'بارگذاری ناموفق بود.'; } })()));
      xhr.onerror = () => reject(new Error('ارتباط با سرور قطع شد.'));
      xhr.send(form);
    });
  }

  async function updateStatus(value: string) {
    if (!selected) return;
    try {
      const response = await request<ApiResponse<typeof selected>>(`/dam/library/${selected.id}`, { method: 'PATCH', body: { status: value } });
      setSelected({ ...selected, ...response.data }); setRefresh(n => n + 1);
    } catch (err) { setError(err instanceof Error ? err.message : 'تغییر وضعیت ناموفق بود.'); }
  }

  async function revise(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const form = new FormData();
      if (selected.type === 'file' && revisionFile) form.append('file', revisionFile);
      if (selected.type === 'content') form.append('body', revision);
      await request(`/dam/library/${selected.id}/versions`, { method: 'POST', body: form });
      const response = await request<ApiResponse<typeof selected>>(`/dam/library/${selected.id}`);
      setSelected(response.data); setEditing(false); setRevisionFile(null); setRefresh(n => n + 1);
    } catch (err) { setError(err instanceof Error ? err.message : 'ایجاد نسخه ناموفق بود.'); }
    finally { setBusy(false); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setResults([]);
    try {
      if (type === 'content') {
        await request<ApiResponse<Entry>>('/dam/library', { method: 'POST', body: { title, body, description, confidentiality, tags: tags.split(',').map(t => t.trim()).filter(Boolean), folder_id: folderId || null, category_id: categoryId || null, ...context } });
        setBody(''); setTitle(''); setResults(['محتوا با موفقیت ثبت شد.']);
      } else {
        const outcomes: string[] = [];
        const failed: File[] = [];
        for (const file of files) {
          const form = new FormData();
          form.append('file', file);
          form.append('title', title || file.name);
          form.append('description', description);
          form.append('confidentiality', confidentiality);
          if (folderId) form.append('folder_id', folderId);
          if (categoryId) form.append('category_id', categoryId);
          tags.split(',').map(t => t.trim()).filter(Boolean).forEach((tag, i) => form.append(`tags[${i}]`, tag));
          Object.entries(context || {}).forEach(([key, value]) => { if (value) form.append(key, String(value)); });
          try {
            await upload(form, file);
            outcomes.push(`${file.name}: ثبت شد`);
          } catch (err) {
            failed.push(file);
            setProgress(prev => ({ ...prev, [file.name]: 0 }));
            outcomes.push(`${file.name}: خطا — ${err instanceof Error ? err.message : 'نامشخص'}`);
          }
          setResults([...outcomes]);
        }
        setFiles(failed); // Failed entries stay queued for retry; successful files are not re-uploaded.
      }
      setRefresh(n => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت ناموفق بود.');
    } finally { setBusy(false); }
  }

  return <section dir="rtl" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap gap-2 border-b pb-3">
      {(['all', 'file', 'content'] as const).map(tab => <button key={tab} type="button" onClick={() => { setType(tab); setPage(1); setSelected(null); }} className={`rounded-xl px-4 py-2 text-sm font-bold ${type === tab ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{tab === 'all' ? 'همه دارایی‌ها' : tab === 'file' ? 'فایل‌ها' : 'دیتابیس اطلاعات'}</button>)}
    </div>
    {type !== 'all' && hasPermission('assets.upload') && <form onSubmit={save} className="space-y-3 rounded-xl bg-slate-50 p-4">
      <h3 className="text-sm font-bold">{type === 'file' ? 'ثبت فایل در مخزن مرکزی' : 'ثبت اطلاعات در دیتابیس'}</h3>
      <input aria-label="عنوان" value={title} onChange={e => setTitle(e.target.value)} placeholder={type === 'file' ? 'عنوان (اختیاری؛ پیش‌فرض نام فایل)' : 'عنوان محتوا'} required={type === 'content'} className="w-full rounded-lg border p-2 text-sm" />
      <textarea aria-label={type === 'file' ? 'توضیحات' : 'متن محتوا'} required={type === 'content'} value={type === 'file' ? description : body} onChange={e => type === 'file' ? setDescription(e.target.value) : setBody(e.target.value)} placeholder={type === 'file' ? 'توضیحات' : 'متن روایت، یادداشت یا مستندات'} className="min-h-24 w-full rounded-lg border p-2 text-sm" />
      <input aria-label="برچسب‌ها" value={tags} onChange={e => setTags(e.target.value)} placeholder="برچسب‌ها (با ویرگول جدا کنید)" className="w-full rounded-lg border p-2 text-sm" />
      <select aria-label="محرمانگی" value={confidentiality} onChange={e => setConfidentiality(e.target.value)} className="rounded-lg border p-2 text-sm"><option value="public">عمومی</option><option value="internal">داخلی</option><option value="confidential">محرمانه</option></select>
      <div className="flex flex-wrap gap-2">
        <select aria-label="پوشه" value={folderId} onChange={e => setFolderId(e.target.value)} className="rounded-lg border p-2 text-sm"><option value="">بدون پوشه</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <select aria-label="دسته‌بندی" value={categoryId} onChange={e => setCategoryId(e.target.value)} className="rounded-lg border p-2 text-sm"><option value="">بدون دسته‌بندی</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input aria-label="نام پوشه جدید" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="نام پوشه جدید" className="rounded-lg border p-2 text-sm" />
        <button type="button" onClick={createFolder} className="rounded-lg border border-indigo-300 px-3 text-sm text-indigo-700">ساخت پوشه</button>
      </div>
      {type === 'file' && <div><input aria-label="انتخاب فایل‌ها" type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []))} className="block w-full text-sm" />
        {files.map((file, i) => <div key={`${file.name}-${i}`} className="mt-2 text-xs">{file.name} — {progress[file.name] ?? 0}٪<progress value={progress[file.name] ?? 0} max={100} className="block w-full" /></div>)}
      </div>}
      <button disabled={busy || (type === 'file' && !files.length)} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{busy ? 'در حال ثبت…' : 'ثبت دارایی'}</button>
      {results.map((r, i) => <p key={i} role="status" className="text-sm">{r}</p>)}
    </form>}
    {(context?.project_id || context?.task_id || context?.department_id) && hasPermission('assets.edit_info') && <div className="space-y-2">
      <button onClick={loadExisting} className="rounded-lg border border-indigo-300 px-3 py-2 text-sm text-indigo-700">انتخاب دارایی موجود از مخزن</button>
      {showExisting && <div className="max-h-44 overflow-y-auto rounded-lg border p-2">{existing.map(asset => <button key={asset.id} onClick={() => attachExisting(asset)} className="block w-full border-b p-2 text-right text-sm hover:bg-indigo-50">{asset.title} — اتصال بدون کپی</button>)}</div>}
    </div>}
    <div className="flex flex-wrap gap-2">
      <select aria-label="فیلتر وضعیت" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-lg border p-2 text-sm">
        <option value="">همه وضعیت‌ها</option><option value="draft">پیش‌نویس</option><option value="review">در حال بررسی</option><option value="approved">تأییدشده</option><option value="published">منتشرشده</option><option value="archived">بایگانی‌شده</option><option value="rejected">ردشده</option>
      </select>
      <select aria-label="فیلتر محرمانگی" value={confidentialityFilter} onChange={e => { setConfidentialityFilter(e.target.value); setPage(1); }} className="rounded-lg border p-2 text-sm">
        <option value="">همه سطوح</option><option value="public">عمومی</option><option value="internal">داخلی</option><option value="confidential">محرمانه</option>
      </select>
    </div>
    <input aria-label="جست‌وجو" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="جست‌وجوی عنوان، توضیحات و متن محتوا" className="w-full rounded-lg border p-2 text-sm" />
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading && <p className="text-sm">در حال دریافت دارایی‌ها…</p>}
    <div className="space-y-2">{items.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"><button onClick={async () => { try { const r = await request<ApiResponse<Entry>>(`/dam/library/${item.id}`); setSelected(r.data); } catch (e) { setError(e instanceof Error ? e.message : 'دریافت جزئیات ناموفق بود.'); } }} className="flex items-center gap-2 font-bold text-indigo-700"><FileText className="h-4 w-4" />{item.title}</button><span>{item.latest_file ? `${item.latest_file.file_size} بایت` : 'متن'}</span>{item.type === 'file' && hasPermission('assets.download') && <a href={`${apiConfig.baseUrl}/dam/library/${item.id}/download`} className="flex items-center gap-1 text-indigo-600"><Download className="h-4 w-4" /> دانلود</a>}</div>)}</div>
    {!loading && !items.length && <p className="text-sm text-slate-500">موردی یافت نشد.</p>}
    {selected && <article className="space-y-2 rounded-xl border border-indigo-200 p-4 text-sm"><h3 className="font-bold">{selected.title}</h3><p>{selected.description}</p><p className="whitespace-pre-wrap">{selected.content_item?.content_body}</p>
      {hasPermission(selected.type === 'file' ? 'assets.create_version' : 'assets.edit_info') && <div>
        <button onClick={() => { setEditing(!editing); setRevision(selected.content_item?.content_body || ''); }} className="text-indigo-600">ایجاد نسخه جدید</button>
        {editing && <form onSubmit={revise} className="mt-2 flex flex-col gap-2">
          {selected.type === 'file' ? <input type="file" required onChange={e => setRevisionFile(e.target.files?.[0] || null)} />
            : <textarea required value={revision} onChange={e => setRevision(e.target.value)} className="min-h-28 rounded-lg border p-2" />}
          <button disabled={busy} className="rounded-lg bg-indigo-600 p-2 text-white disabled:opacity-50">ذخیره نسخه</button>
        </form>}
      </div>}
      <div className="flex flex-wrap items-center gap-2"><span>وضعیت:</span>
        {hasPermission('assets.manage_access') ? <select aria-label="تغییر وضعیت" value={selected.status || 'draft'} onChange={e => updateStatus(e.target.value)} className="rounded-lg border p-1">
          {([['draft','پیش‌نویس'],['review','در حال بررسی'],['approved','تأییدشده'],['published','منتشرشده'],['archived','بایگانی‌شده'],['rejected','ردشده']] as const).map(([key,label]) => <option value={key} key={key}>{label}</option>)}
        </select> : <span>{selected.status || 'draft'}</span>}
      </div>
      <h4 className="font-bold">تاریخچه نسخه‌ها</h4>
      {selected.versions?.map(v => <div key={v.id} className="flex gap-3"><span>نسخه {v.version_number} — {v.change_description || 'ثبت اولیه'}</span>
        {hasPermission('assets.restore') && <button onClick={async () => {
          if (!confirm(`نسخه ${v.version_number} بازیابی شود؟`)) return;
          try {
            await request(`/dam/library/${selected.id}/versions/${v.version_number}/restore`, { method: 'POST' });
            const response = await request<ApiResponse<typeof selected>>(`/dam/library/${selected.id}`);
            setSelected(response.data); setRefresh(n => n + 1);
          } catch (err) { setError(err instanceof Error ? err.message : 'بازیابی ناموفق بود.'); }
        }} className="text-indigo-600">بازیابی</button>}
      </div>)}
      <button onClick={() => setSelected(null)} className="mt-2 text-indigo-600">بستن</button></article>}
    <div className="flex gap-3 text-sm"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>قبلی</button><span>{page} / {lastPage}</span><button disabled={page >= lastPage} onClick={() => setPage(p => p + 1)}>بعدی</button></div>
  </section>;
};
