import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const meetings = readFileSync(new URL('../src/components/thought-room/ThinkTankMeetingsTab.tsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../src/components/common/RichTextEditor.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

/**
 * صفحهٔ جلسات باید پیوست‌های هر جلسه را داخل باکس همان جلسه نشان دهد، و
 * انتخابگرهای نوار ابزار ویرایشگر متن باید عرض متناسب داشته باشند (نه
 * تمام‌عرض و زیر هم).
 */
test('a meeting box shows its attachments even when the meeting is collapsed', () => {
  assert.match(meetings, /\(meeting\.attachments \|\| \[\]\)\.length > 0 && \(/);
  assert.match(meetings, /title="پیوست‌های این جلسه"/);
  assert.match(meetings, /setExpandedMeetingId\(meeting\.id\)/);
  assert.match(meetings, /ضمیمه/);
});

test('expanded meeting card lists each attachment through the shared row', () => {
  assert.match(meetings, /پیوست‌های جلسه \(/);
  assert.match(meetings, /\(meeting\.attachments \|\| \[\]\)\.map\(att => \(/);
  assert.match(meetings, /<MeetingAttachmentRow key=\{att\.id\} attachment=\{att\} \/>/);
  // پیوست‌ها فقط وقتی نمایش داده می‌شوند که وجود داشته باشند؛ باکس خالی ساخته نمی‌شود.
  assert.doesNotMatch(meetings, /meeting\.attachments\.map/);
});

test('the rich text toolbar selects use compact, content-sized widths', () => {
  assert.match(editor, /className="rich-text-toolbar flex flex-wrap/);
  assert.match(editor, /className="rt-toolbar-style"/);
  assert.match(editor, /className="rt-toolbar-size"/);
  assert.match(editor, /className="rt-toolbar-font"/);
  // قاعدهٔ عمومی `.ui-input` تمام‌عرض است و باید داخل نوار ابزار خنثی شود.
  assert.match(css, /\.rich-text-toolbar \.ui-input \{[^}]*width: auto;/);
  assert.match(css, /\.rich-text-toolbar \.ui-input \{[^}]*height: 2rem;/);
  assert.match(css, /\.rich-text-toolbar \.rt-toolbar-style \{ width: 8\.25rem; \}/);
  assert.match(css, /\.rich-text-toolbar \.rt-toolbar-size \{ width: 6\.5rem; \}/);
  assert.match(css, /\.rich-text-toolbar \.rt-toolbar-font \{ width: 7rem; \}/);
});
