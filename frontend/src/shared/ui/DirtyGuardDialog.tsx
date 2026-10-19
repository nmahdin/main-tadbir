import { Button, Modal } from './Primitives';

/**
 * UX-02-3-FINAL (F04): dirty-exit confirmation for long forms.
 * Leaving with unsaved input never happens silently: the user can
 * keep the draft and continue later, go back to editing, or drop
 * the draft and leave.
 */
export function DirtyGuardDialog({
  open,
  onStay,
  onSaveAndLeave,
  onDiscardAndLeave,
}: {
  open: boolean;
  onStay: () => void;
  onSaveAndLeave: () => void;
  onDiscardAndLeave: () => void;
}) {
  return (
    <Modal open={open} onClose={onStay} title="تغییرات ذخیره‌نشده">
      <div className="space-y-4 p-5">
        <p className="text-sm leading-6 text-slate-600">
          این فرم تغییرات ذخیره‌نشده دارد. پیش‌نویس در همین دستگاه و برای حساب شما نگه داشته می‌شود تا بعداً ادامه دهید، یا می‌توانید آن را حذف کنید.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onStay}>ادامهٔ ویرایش</Button>
          <Button variant="secondary" onClick={onDiscardAndLeave}>حذف پیش‌نویس و خروج</Button>
          <Button onClick={onSaveAndLeave}>ذخیره و ادامه</Button>
        </div>
      </div>
    </Modal>
  );
}
