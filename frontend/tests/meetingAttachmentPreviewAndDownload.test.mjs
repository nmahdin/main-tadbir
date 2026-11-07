import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const row = readFileSync(new URL('../src/components/thought-room/MeetingAttachmentRow.tsx', import.meta.url), 'utf8');
const meetings = readFileSync(new URL('../src/components/thought-room/ThinkTankMeetingsTab.tsx', import.meta.url), 'utf8');
const minutes = readFileSync(new URL('../src/components/thought-room/MeetingMinutesModal.tsx', import.meta.url), 'utf8');
const createMeeting = readFileSync(new URL('../src/components/thought-room/CreateMeetingModal.tsx', import.meta.url), 'utf8');
const quickPreview = readFileSync(new URL('../src/components/dam/DamAssetQuickPreview.tsx', import.meta.url), 'utf8');
const types = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
const textActions = readFileSync(new URL('../src/components/common/TextAssetActions.tsx', import.meta.url), 'utf8');
const textDownload = readFileSync(new URL('../src/utils/textAssetDownload.ts', import.meta.url), 'utf8');

/**
 * پیوست‌های جلسه مثل پیوست‌های عمومی سامانه: دکمهٔ پیش‌نمایش، و دانلودِ متفاوت
 * برای فایل و متن (متن‌ها با انتخاب قالب TXT / Word / PDF).
 */
test('meeting attachments store the DAM asset identity they came from', () => {
  assert.match(types, /export interface MeetingAttachment \{[\s\S]*?assetId\?: number;[\s\S]*?assetType\?: 'file' \| 'content' \| 'data_table';/);
  // هر دو مسیر ثبت جلسه، شناسه و نوع دارایی را ذخیره می‌کنند.
  for (const file of [minutes, createMeeting]) {
    assert.match(file, /assetId: attachment\.assetId,/);
    assert.match(file, /assetType: attachment\.type,/);
  }
});

test('legacy attachment ids resolve their DAM asset without confusing a timestamp for one', () => {
  assert.match(row, /\/\^matt-\(\\d\+\)-\\d\+\(\?:-\\d\+\)\?\$\/\.exec\(attachment\.id\)/);
  const legacy = /^matt-(\d+)-\d+(?:-\d+)?$/.exec('matt-482-1761000000000-0');
  assert.equal(legacy?.[1], '482');
  // شناسهٔ قدیمیِ `matt-<timestamp>` دارایی مخزن ندارد.
  assert.equal(/^matt-(\d+)-\d+(?:-\d+)?$/.exec('matt-1761000000000'), null);
});

test('the row offers the same quick preview as the rest of the system', () => {
  assert.match(row, /import \{ DamAssetQuickPreview \} from '\.\.\/dam\/DamAssetQuickPreview';/);
  assert.match(row, /title="پیش‌نمایش"/);
  assert.match(row, /<DamAssetQuickPreview/);
  assert.match(row, /hint="این پیش‌نمایش همان نسخهٔ ثبت‌شده در مخزن مرکزی است/);
  // پیش‌نمایش سریع می‌پذیرد که توضیح پایین را صداکننده تعیین کند.
  assert.match(quickPreview, /hint\?: string;/);
  assert.match(quickPreview, /\{hint \|\| 'این پیش‌نمایش فقط برای بررسی پیش از اتصال است/);
});

test('files and texts get different download affordances', () => {
  // فایل: لینک مستقیم دانلود مخزن.
  assert.match(row, /const downloadHref = assetId \? `\$\{apiConfig\.baseUrl\}\/dam\/library\/\$\{assetId\}\/download` : legacyUrl;/);
  assert.match(row, /title="دانلود فایل"/);
  // متن: همان فهرست قالب‌های سیستم (TXT / Word / PDF).
  assert.match(row, /import \{ TextAssetActions \} from '\.\.\/common\/TextAssetActions';/);
  assert.match(row, /<TextAssetActions title=\{attachment\.name\} html=\{textHtml\} onView=\{\(\) => setPreviewOpen\(true\)\} canDownload showView=\{false\} \/>/);
  assert.match(textActions, /TEXT_ASSET_FORMATS[\s\S]*?'txt'[\s\S]*?'doc'[\s\S]*?'pdf'/);
  assert.match(textDownload, /export type TextAssetFormat = 'txt' \| 'doc' \| 'pdf';/);
  // متن‌ها لینک دانلود مستقیم نمی‌گیرند و فایل‌ها منوی قالب ندارند.
  assert.match(row, /\{canDownload && isText && \(/);
  assert.match(row, /\{canDownload && !isText && downloadHref && \(/);
});

test('both meeting surfaces render the shared attachment row', () => {
  assert.match(meetings, /import \{ MeetingAttachmentRow \} from '\.\/MeetingAttachmentRow';/);
  assert.match(minutes, /import \{ MeetingAttachmentRow \} from '\.\/MeetingAttachmentRow';/);
  assert.match(minutes, /<MeetingAttachmentRow[\s\S]*?attachment=\{att\}[\s\S]*?onRemove=\{\(\) => removeMeetingAttachment\(meeting\.id, att\.id\)\}/);
});
