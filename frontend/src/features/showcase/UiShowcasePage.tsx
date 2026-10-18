import React, { useState } from 'react';
import { Plus, Search, Settings2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Select, Skeleton, Table, TableCell, TableRow, Textarea } from '../../components/common/Primitives';

/**
 * DS-2 — development-only UI showcase (/_dev/ui-showcase).
 *
 * Interactive gallery of the DS-1 design system with entirely
 * fictional data. It performs no API calls and reads no user,
 * Organization, Workspace or secret data. The route is registered
 * only when import.meta.env.DEV is true, so this page is excluded
 * from production bundles (verified by tests + build inspection).
 */
export function UiShowcasePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const saveDemo = () => {
    setNameError(name.trim() ? undefined : 'نام نمایشی نمی‌تواند خالی باشد.');
  };

  return <main dir="rtl" className="min-h-screen bg-slate-50 p-4 text-right text-slate-900 sm:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="نمایشگاه سامانهٔ طراحی (DS-2)"
        description="محیط توسعه — داده‌ها کاملاً ساختگی‌اند و هیچ فراخوانی شبکه‌ای انجام نمی‌شود."
        actions={<Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" aria-hidden />اقدام اصلی نمونه</Button>}
      />

      <Card title="دکمه‌ها" description="گونه‌ها و اندازه‌های استاندارد؛ در هر ناحیه فقط یک اقدام اصلی.">
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
          <Button size="sm">کوچک</Button>
          <Button size="md">استاندارد (۴۰px)</Button>
          <Button size="lg">بزرگ</Button>
          <Button variant="secondary"><Search className="h-4 w-4" aria-hidden />با آیکون (فاصله ۸px)</Button>
          <IconButton label="تنظیمات نمونه" variant="secondary"><Settings2 className="h-4 w-4" aria-hidden /></IconButton>
        </div>
      </Card>

      <Card title="فرم و اعتبارسنجی" description="ارتفاع استاندارد ۴۰px، شعاع ۱۲px، وضعیت خطا و راهنما.">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); saveDemo(); }}>
          <FormField label="نام نمایشی" htmlFor="demo-name" required error={nameError}>
            <Input id="demo-name" value={name} invalid={Boolean(nameError)} onChange={event => setName(event.target.value)} placeholder="مثلاً تیم نمونه" />
          </FormField>
          <FormField label="گونهٔ محیط" htmlFor="demo-kind">
            <Select id="demo-kind" defaultValue="sandbox">
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

      <Card title="نشان‌ها و جدول" description="رنگ‌های معنایی ثابت؛ داده‌ها ساختگی‌اند.">
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
