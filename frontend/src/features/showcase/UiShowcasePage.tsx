import React, { useEffect, useState } from 'react';
import { Plus, Search, Settings2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Select, Skeleton, Table, TableCell, TableRow, Textarea } from '../../components/common/Primitives';
import { Alert, toast } from '../../components/common/Notifications';
import { DataTable, type DataTableState } from '../../components/common/DataTable';
import { initialDataTableState, filterRows, paginateRows, sortRows } from '../../components/common/dataTableLogic';

/**
 * DS-2 / DS-2.1 — development-only UI showcase (/_dev/ui-showcase).
 *
 * Interactive gallery of the design system with entirely fictional
 * data. It performs no network calls and reads no real account,
 * organization or workspace data. The route is registered only when
 * import.meta.env.DEV is true, so this page is excluded from
 * production bundles (verified by tests + build inspection).
 */

interface DemoProject {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'done';
  owner: string;
  progress: number;
}

const STATUS_LABEL: Record<DemoProject['status'], string> = { active: 'فعال', paused: 'متوقف', done: 'تمام‌شده' };
const STATUS_TONE: Record<DemoProject['status'], 'success' | 'warning' | 'neutral'> = { active: 'success', paused: 'warning', done: 'neutral' };

const DEMO_PROJECTS: DemoProject[] = [
  { id: 'p01', name: 'پروژهٔ نمونهٔ آلفا', status: 'active', owner: 'تیم آلفا', progress: 72 },
  { id: 'p02', name: 'پروژهٔ نمونهٔ بتا', status: 'paused', owner: 'تیم بتا', progress: 31 },
  { id: 'p03', name: 'بازطراحی صفحهٔ فرود نمونه', status: 'done', owner: 'تیم آلفا', progress: 100 },
  { id: 'p04', name: 'مهاجرت نمونهٔ داده‌ها', status: 'active', owner: 'تیم گاما', progress: 58 },
  { id: 'p05', name: 'مستندسازی نمونهٔ فرایندها', status: 'active', owner: 'تیم بتا', progress: 84 },
  { id: 'p06', name: 'پژوهش نمونهٔ کاربران', status: 'paused', owner: 'تیم دلتا', progress: 12 },
  { id: 'p07', name: 'نمونهٔ یکپارچه‌سازی تقویم', status: 'done', owner: 'تیم گاما', progress: 100 },
  { id: 'p08', name: 'داشبورد نمونهٔ گزارش', status: 'active', owner: 'تیم دلتا', progress: 45 },
  { id: 'p09', name: 'نمونهٔ اعلان‌های درون‌برنامه‌ای', status: 'active', owner: 'تیم آلفا', progress: 66 },
  { id: 'p10', name: 'بازبینی نمونهٔ دسترس‌پذیری', status: 'paused', owner: 'تیم بتا', progress: 20 },
  { id: 'p11', name: 'نمونهٔ بایگانی اسناد', status: 'done', owner: 'تیم گاما', progress: 100 },
  { id: 'p12', name: 'آموزش نمونهٔ کاربران تازه', status: 'active', owner: 'تیم دلتا', progress: 53 },
  { id: 'p13', name: 'نمونهٔ گزارش‌گیری ماهانه', status: 'active', owner: 'تیم آلفا', progress: 91 },
  { id: 'p14', name: 'پایش نمونهٔ کارایی', status: 'paused', owner: 'تیم گاما', progress: 37 },
];

const PROJECT_COLUMNS = [
  { key: 'name', header: 'نام پروژه', sortable: true },
  {
    key: 'status',
    header: 'وضعیت',
    filterOptions: [
      { value: 'active', label: 'فعال' },
      { value: 'paused', label: 'متوقف' },
      { value: 'done', label: 'تمام‌شده' },
    ],
    render: (row: DemoProject) => <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>,
  },
  { key: 'owner', header: 'تیم', sortable: true },
  {
    key: 'progress',
    header: 'پیشرفت',
    sortable: true,
    align: 'center' as const,
    render: (row: DemoProject) => <span>{row.progress.toLocaleString('fa-IR')}٪</span>,
  },
];

/** Simulated server page: same pure pipeline, sliced per contract. */
function fakeServerPage(state: DataTableState) {
  const filtered = filterRows(DEMO_PROJECTS, state, row => `${row.name} ${row.owner}`, (row, key) => String(row[key as keyof DemoProject] ?? ''));
  const sorted = sortRows(filtered, state.sort, (row, key) => row[key as keyof DemoProject]);
  const paged = paginateRows(sorted, state.page, state.pageSize);
  return { rows: paged.pageRows, total: filtered.length };
}

export function UiShowcasePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [kind, setKind] = useState('sandbox');
  const [projectChoice, setProjectChoice] = useState('');
  const [selectError, setSelectError] = useState<string | undefined>();
  const [submittedValue, setSubmittedValue] = useState<string | null>(null);
  const [alertVisible, setAlertVisible] = useState(true);

  const [serverState, setServerState] = useState<DataTableState>(() => initialDataTableState(5));
  const [serverRows, setServerRows] = useState<DemoProject[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverLoading, setServerLoading] = useState(false);

  useEffect(() => {
    setServerLoading(true);
    const timer = window.setTimeout(() => {
      const page = fakeServerPage(serverState);
      setServerRows(page.rows);
      setServerTotal(page.total);
      setServerLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [serverState]);

  const saveDemo = () => {
    setNameError(name.trim() ? undefined : 'نام نمایشی نمی‌تواند خالی باشد.');
  };

  return <main dir="rtl" className="min-h-screen bg-slate-50 p-4 text-right text-slate-900 sm:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="نمایشگاه سامانهٔ طراحی (DS-2.1)"
        description="محیط توسعه — داده‌ها کاملاً ساختگی‌اند و هیچ فراخوانی شبکه‌ای انجام نمی‌شود."
        actions={<Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" aria-hidden />اقدام اصلی نمونه</Button>}
      />

      <Card title="دکمه‌ها" description="هندسهٔ DS-2.1: استاندارد ۳۶px با شعاع ۱۶px؛ فشرده و بزرگ با توکن‌های صریح. ورودی‌ها ۴۰px می‌مانند.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">اصلی</Button>
          <Button variant="secondary">ثانویه</Button>
          <Button variant="ghost">شفاف</Button>
          <Button variant="success">موفقیت</Button>
          <Button variant="warning">هشدار</Button>
          <Button variant="danger">خطر</Button>
          <Button loading>در حال ذخیره</Button>
          <Button disabled>غیرفعال</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm">فشرده (۳۲px)</Button>
          <Button size="md">استاندارد (۳۶px)</Button>
          <Button size="lg">بزرگ (۴۴px)</Button>
          <Button variant="secondary"><Search className="h-4 w-4" aria-hidden />با آیکون (فاصله ۸px)</Button>
          <IconButton label="تنظیمات نمونه" variant="secondary"><Settings2 className="h-4 w-4" aria-hidden /></IconButton>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
          <div className="w-56">
            <FormField label="هم‌ترازی با ورودی (۴۰px)" htmlFor="demo-align">
              <Input id="demo-align" placeholder="ورودی ۴۰ پیکسلی" />
            </FormField>
          </div>
          <Button>اقدام هم‌ردیف</Button>
          <p className="w-full text-xs text-slate-500">در ردیف فرم، برچسب بالای ورودی است و دکمهٔ ۳۶px در کنار ورودی ۴۰px با تراز پایانی (items-end) قرار می‌گیرد؛ اختلاف ارتفاع عمدی و خواناست.</p>
        </div>
      </Card>

      <Card title="اعلان‌ها (Toast) و هشدار درون‌صفحه‌ای (Alert)" description="یک سرویس اعلان سراسری؛ خطاهای مهم تا بستن کاربر می‌مانند و اعلان‌های تکراری یکی می‌شوند.">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => toast.success('ذخیرهٔ نمونه انجام شد', { description: 'این پیام ساختگی است.' })}>موفقیت</Button>
          <Button variant="secondary" onClick={() => toast.error('انجام عملیات نمونه ناموفق بود', { description: 'این خطا تا وقتی خودتان ببندید می‌ماند.' })}>خطا (ماندگار)</Button>
          <Button variant="secondary" onClick={() => toast.warning('هشدار نمونه', { description: 'نیازمند توجه، اما مسدودکننده نیست.' })}>هشدار</Button>
          <Button variant="secondary" onClick={() => toast.info('اطلاع نمونه', { description: 'فقط برای آگاهی.' })}>اطلاع</Button>
          <Button variant="ghost" onClick={() => { toast.info('پیام تکراری نمونه'); toast.info('پیام تکراری نمونه'); toast.info('پیام تکراری نمونه'); }}>سه اعلان تکراری (یکی می‌شود)</Button>
        </div>
        <div className="mt-4 space-y-3">
          <Alert tone="success" title="هشدار درون‌صفحه‌ای موفق" description="پیام ماندگار داخل صفحه؛ برای نتیجهٔ بخشی که کاربر باید ببیند." />
          <Alert tone="warning" title="هشدار درون‌صفحه‌ای" description="وضعیتی که نیازمند توجه است ولی کار را متوقف نمی‌کند." />
          <Alert tone="info" title="اطلاع درون‌صفحه‌ای" description="راهنمای آرام و ثابت در کنار محتوا." />
          {alertVisible && <Alert tone="error" title="خطای درون‌صفحه‌ای قابل بستن" description="برای خطای ماندگارِ یک بخش از صفحه." onClose={() => setAlertVisible(false)} />}
        </div>
      </Card>

      <Card title="فرم و اعتبارسنجی" description="ارتفاع استاندارد ۴۰px، شعاع ۱۲px، وضعیت خطا و راهنما.">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); saveDemo(); }}>
          <FormField label="نام نمایشی" htmlFor="demo-name" required error={nameError}>
            <Input id="demo-name" value={name} invalid={Boolean(nameError)} onChange={event => setName(event.target.value)} placeholder="مثلاً تیم نمونه" />
          </FormField>
          <FormField label="گونهٔ محیط" htmlFor="demo-kind">
            <Select id="demo-kind" value={kind} onChange={event => setKind(event.target.value)}>
              <option value="sandbox">آزمایشی</option>
              <option value="pilot">پایلوت</option>
            </Select>
          </FormField>
          <FormField label="توضیح" htmlFor="demo-note">
            <Textarea id="demo-note" rows={3} placeholder="توضیح ساختگی…" />
          </FormField>
          <div className="space-y-3">
            <Checkbox label="گزینهٔ نمونهٔ فعال" description="توضیح کوتاه و آرام برای گزینه." defaultChecked />
            <Checkbox label="گزینهٔ غیرفعال" description="در این وضعیت قابل انتخاب نیست." disabled />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">بررسی اعتبارسنجی</Button>
            <Button variant="secondary" onClick={() => setConfirmOpen(true)}>گفت‌وگوی تأیید</Button>
          </div>
        </form>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Button variant="ghost" size="sm" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen(open => !open)}>
            {advancedOpen ? 'پنهان‌کردن گزینه‌های پیشرفته' : 'نمایش گزینه‌های پیشرفته'}
          </Button>
          {advancedOpen && <p className="mt-2 text-sm text-slate-500">افشای تدریجی: فیلترها و گزینه‌های پیشرفته فقط هنگام نیاز دیده می‌شوند (الگوی DS-1 برای UX-01).</p>}
        </div>
      </Card>

      <Card title="انتخاب‌گر سفارشی (Select)" description="منوی برندشده به‌جای کنترل خام مرورگر؛ صفحه‌کلید، جست‌وجو و حالت‌های غیرفعال/بارگذاری/خطا.">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={event => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const value = String(data.get('demo-project') ?? '');
            setSelectError(value ? undefined : 'یک پروژهٔ نمونه انتخاب کنید.');
            setSubmittedValue(value || null);
            if (value) toast.success('فرم نمونه ارسال شد', { description: 'مقدار از فرم خوانده شد؛ چیزی به سرور ارسال نشده است.' });
          }}
        >
          <FormField label="پروژهٔ نمونه (ارسال فرم)" htmlFor="demo-project" required error={selectError}>
            <Select
              id="demo-project"
              name="demo-project"
              searchable
              invalid={Boolean(selectError)}
              placeholder="یک پروژهٔ نمونه انتخاب کنید"
              value={projectChoice}
              onChange={event => { setProjectChoice(event.target.value); setSelectError(undefined); }}
            >
              <option value="">بدون انتخاب</option>
              {DEMO_PROJECTS.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </Select>
          </FormField>
          <FormField label="انتخاب غیرفعال" htmlFor="demo-select-disabled">
            <Select id="demo-select-disabled" disabled defaultValue="a">
              <option value="a">گزینهٔ نمونهٔ یک</option>
              <option value="b">گزینهٔ نمونهٔ دو</option>
            </Select>
          </FormField>
          <FormField label="در حال بارگذاری" htmlFor="demo-select-loading">
            <Select id="demo-select-loading" loading defaultValue="">
              <option value="">در حال دریافت گزینه‌ها…</option>
            </Select>
          </FormField>
          <FormField label="فهرست بلند با جست‌وجو" htmlFor="demo-select-search">
            <Select id="demo-select-search" searchable placeholder="جست‌وجو و انتخاب کنید">
              {DEMO_PROJECTS.map(project => <option key={project.id} value={project.id}>{project.name} — {project.owner}</option>)}
            </Select>
          </FormField>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit">ارسال فرم نمونه</Button>
            {submittedValue && <span className="text-xs font-bold text-slate-600">مقدار ارسال‌شده: {DEMO_PROJECTS.find(project => project.id === submittedValue)?.name}</span>}
          </div>
        </form>
        <p className="mt-3 text-xs leading-6 text-slate-500">با صفحه‌کلید امتحان کنید: Enter یا فاصله منو را باز می‌کند، جهت‌نماها حرکت می‌کنند، Enter انتخاب می‌کند و Escape می‌بندد و تمرکز را به کنترل برمی‌گرداند.</p>
      </Card>

      <Card title="جدول دادهٔ پیشرفته — حالت کاربر (Client)" description="جست‌وجو، فیلتر، مرتب‌سازی، صفحه‌بندی، انتخاب ردیف و نمایش/پنهان‌کردن ستون روی دادهٔ ساختگی پروژه‌ها.">
        <DataTable
          columns={PROJECT_COLUMNS}
          rows={DEMO_PROJECTS}
          rowKey="id"
          caption="فهرست ساختگی پروژه‌های نمونه"
          selectable
          bulkActions={selected => <Button size="sm" variant="ghost" onClick={() => toast.info('اقدام گروهی نمونه', { description: `${selected.size.toLocaleString('fa-IR')} ردیف ساختگی انتخاب شده است.` })}>اقدام گروهی نمونه</Button>}
          rowActions={row => <Button size="sm" variant="ghost" onClick={() => toast.info('ردیف نمونه', { description: row.name })}>جزئیات</Button>}
        />
      </Card>

      <Card title="جدول داده — حالت سرور (Server)" description="قرارداد صریح صفحه/مرتب‌سازی/فیلتر به بیرون گزارش می‌شود و فقط همان صفحه رندر می‌گردد؛ این‌جا سمت کاربر شبیه‌سازی شده و هیچ فراخوانی شبکه‌ای رخ نمی‌دهد.">
        <DataTable
          columns={PROJECT_COLUMNS}
          rows={serverRows}
          total={serverTotal}
          rowKey="id"
          mode="server"
          state={serverState}
          onStateChange={setServerState}
          loading={serverLoading}
          caption="نمایش سروری ساختگی پروژه‌ها"
        />
        <p className="mt-3 text-xs text-slate-500" dir="ltr">last server state: page={serverState.page} pageSize={serverState.pageSize} offset={(serverState.page - 1) * serverState.pageSize} sort={serverState.sort ? `${serverState.sort.key}:${serverState.sort.direction}` : 'none'} query="{serverState.query}"</p>
      </Card>

      <Card title="نشان‌ها و جدول ساده" description="رنگ‌های معنایی ثابت؛ برای چیدمان‌های ایستا همان Table سادهٔ DS-1 کافی است.">
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge tone="neutral">خنثی</Badge><Badge tone="primary">اصلی</Badge><Badge tone="success">موفق</Badge>
          <Badge tone="warning">هشدار</Badge><Badge tone="danger">خطا</Badge><Badge tone="info">اطلاع</Badge>
        </div>
        <Table columns={['نام ساختگی', 'نقش', 'وضعیت']} caption="جدول نمونهٔ ساختگی">
          <TableRow><TableCell>تیم آلفا</TableCell><TableCell>مالک</TableCell><TableCell><Badge tone="success">فعال</Badge></TableCell></TableRow>
          <TableRow><TableCell>تیم بتا</TableCell><TableCell>عضو</TableCell><TableCell><Badge tone="warning">در انتظار</Badge></TableCell></TableRow>
        </Table>
      </Card>

      <Card title="وضعیت‌ها" description="بارگذاری، خالی و خطا — بدون اغراق بصری.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200"><LoadingState /></div>
          <div className="rounded-xl border border-slate-200"><EmptyState title="هنوز موردی برای نمایش نیست." /></div>
          <div className="rounded-xl border border-slate-200"><ErrorState title="نمایش نمونهٔ خطا (ساختگی)" onRetry={() => undefined} /></div>
        </div>
        <div className="mt-4 space-y-2"><Skeleton /><Skeleton /></div>
      </Card>

      <Card title="پاسخ‌گویی و RTL" description="همین صفحه را در عرض‌های مختلف بررسی کنید؛ چیدمان راست‌به‌چپ در همهٔ اندازه‌ها حفظ می‌شود.">
        <p className="text-sm leading-7 text-slate-600">متن نمونهٔ فارسی برای سنجش خوانایی با قلم وزیرمتن: «تدبیر، برای تیم‌های کوچک طراحی شده است؛ آرام، ساده و خوش‌آمدگو.» تمرکز صفحه‌کلید را با Tab بررسی کنید — حلقهٔ تمرکز روی همهٔ کنترل‌ها دیده می‌شود.</p>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="پنجرهٔ نمونه" description="تعامل صفحه‌کلید: Escape می‌بندد و Tab داخل پنجره می‌ماند.">
        <div className="space-y-4 p-5">
          <p className="text-sm text-slate-600">این پنجره با همان مؤلفهٔ Modal سامانه ساخته شده است.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>انصراف</Button>
            <Button loading={busy} onClick={() => { setBusy(true); window.setTimeout(() => { setBusy(false); setModalOpen(false); }, 600); }}>ذخیرهٔ نمونه</Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => setConfirmOpen(false)} title="آیا از انجام این اقدام ساختگی مطمئن هستید؟" />
    </div>
  </main>;
}
