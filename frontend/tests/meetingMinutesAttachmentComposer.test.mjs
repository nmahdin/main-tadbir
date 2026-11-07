import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync(new URL('../src/components/thought-room/MeetingMinutesModal.tsx', import.meta.url), 'utf8');
const composer = readFileSync(new URL('../src/components/common/AttachmentComposer.tsx', import.meta.url), 'utf8');
const row = readFileSync(new URL('../src/components/thought-room/MeetingAttachmentRow.tsx', import.meta.url), 'utf8');

/**
 * بخش ضمیمه‌های مدال «ثبت صورت‌جلسه» باید با همان قالب کلی ضمیمه‌های سامانه
 * کار کند، نه با دکمهٔ اختصاصی «افزودن فایل».
 */
test('the minutes modal uses the shared attachment composer', () => {
  assert.match(modal, /import \{[^}]*AttachmentComposer[^}]*\} from '\.\.\/common\/AttachmentComposer';/);
  assert.match(modal, /<AttachmentComposer/);
  assert.match(modal, /value=\{attachmentDraft\}/);
  assert.match(modal, /onChange=\{setAttachmentDraft\}/);
  assert.match(modal, /title="ضمیمه‌های صورت‌جلسه"/);
  assert.match(modal, /defaultFolderLabel=\{`جلسات \/ \$\{meeting\.title\} \/ فایل`\}/);
  // مسیر مشترک ثبت: پیش‌نویس → مخزن → چسباندن به جلسه
  assert.match(modal, /persistAttachmentDraft\(attachmentDraft, \{ meetingId: meeting\.id \}, meeting\.title\)/);
  assert.match(modal, /await appendMeetingAttachments\(meeting\.id, metadata\)/);
  // قالب سفارشی قبلی (input file + دکمهٔ آپلود) نباید باقی بماند
  assert.doesNotMatch(modal, /type="file"/);
  assert.doesNotMatch(modal, /attachmentInputRef/);
  assert.doesNotMatch(modal, /uploadingAttachment/);
  assert.doesNotMatch(modal, /addMeetingAttachment\(/);
});

test('the composer keeps every attachment mode of the global template', () => {
  for (const mode of ['file', 'text', 'library', 'table']) {
    assert.match(composer, new RegExp(`id: '${mode}' as Mode`), `attachment mode ${mode} must stay available`);
  }
  assert.match(composer, /انتخاب از مخزن/);
  assert.match(composer, /جدول اطلاعات/);
  assert.match(composer, /یادداشت متنی/);
});

test('already-saved meeting attachments stay manageable from the same section', () => {
  assert.match(modal, /پیوست‌های ثبت‌شدهٔ جلسه/);
  assert.match(modal, /onRemove=\{\(\) => removeMeetingAttachment\(meeting\.id, att\.id\)\}/);
  assert.match(row, /title="حذف پیوست"/);
  assert.match(modal, /attachmentDraftCount\(attachmentDraft\)/);
});

test('a failed attachment save does not drop the minutes', () => {
  assert.match(modal, /صورت‌جلسه ثبت شد، اما ثبت ضمیمه‌ها کامل نشد/);
  assert.match(modal, /if \(attachmentDraftCount\(attachmentDraft\) > 0\) \{/);
  assert.match(modal, /disabled=\{saving \|\| attachmentSaving\}/);
});
