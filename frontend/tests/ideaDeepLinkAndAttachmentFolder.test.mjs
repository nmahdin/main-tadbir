import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readIdeaLink } from '../src/utils/taskDeepLink.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

/**
 * دو درخواست این دور:
 * ۱) اعلان «ایده جدید» در بات بله دو دکمهٔ مستقیم دارد: باز کردن همان ایده و
 *    رفتن به کادر «نظر دادن» — هر دو در مینی‌اپ.
 * ۲) ضمیمه‌ای که از مخزن به یک محتوا/ایده/جلسه/وظیفه وصل می‌شود می‌تواند به
 *    همان پوشهٔ پیش‌فرضِ آن بخش منتقل شود.
 */
test('پیوند ایده: پارامتر idea و comment درست خوانده می‌شود', () => {
  assert.deepEqual(readIdeaLink('?idea=12'), { id: '12', comment: false });
  assert.deepEqual(readIdeaLink('?idea=12&comment=1'), { id: '12', comment: true });
  // مقادیر نامعتبر یا تکراری هرگز مودال را باز نمی‌کنند.
  assert.equal(readIdeaLink(''), null);
  assert.equal(readIdeaLink('?idea=0'), null);
  assert.equal(readIdeaLink('?idea=abc'), null);
  assert.equal(readIdeaLink('?idea=1&idea=2'), null);
  // فقط مقدار `comment=1` حالت «نظر دادن» را فعال می‌کند.
  assert.deepEqual(readIdeaLink('?idea=12&comment=0'), { id: '12', comment: false });
});

test('پیوند ایده: بات دکمه‌های «باز کردن ایده» و «نظر دادن» می‌سازد', async () => {
  const [links, delivery, text] = await Promise.all([
    source('../../backend/app/Bot/Bale/Support/PanelLinks.php'),
    source('../../backend/app/Bot/Bale/Notifications/NotificationDelivery.php'),
    source('../../backend/app/Bot/Bale/Support/NotificationText.php'),
  ]);

  assert.match(links, /public function ideaButtons\(\?BaleUserLink \$link, int \$ideaId\): array/);
  assert.match(links, /'💡 باز کردن ایده', 'mini_app', 'idea:'\.\$ideaId/);
  assert.match(links, /'💬 نظر دادن', 'mini_app', 'idea:'\.\$ideaId\.':comment'/);
  assert.match(links, /'\?idea='\.\$match\[1\]\.\(\(\$match\[2\] \?\? ''\) === ':comment' \? '&comment=1' : ''\)/);

  // اعلان ایده همین دکمه‌ها را با اعلان می‌فرستد.
  assert.match(delivery, /app\(PanelLinks::class\)->ideaButtons\(\$link, \(int\) \$record->payload\['linkIdeaId'\]\)/);
  // آیکن پیام ایده، زنگ عمومی نیست.
  assert.match(text, /if \(! empty\(\$p\['linkIdeaId'\]\)\) \{\s*\$icon = '💡';/);
});

test('ضمیمه‌ها: انتخاب فایل از مخزن می‌تواند به پوشهٔ این بخش منتقل شود', async () => {
  const [composer, controller, routes, service] = await Promise.all([
    source('../src/components/common/AttachmentComposer.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/DamAssetController.php'),
    source('../../backend/routes/api.php'),
    source('../../backend/app/Services/DamService.php'),
  ]);

  // گزینهٔ کاربر و ارسال زمینهٔ مقصد به سرور
  assert.match(composer, /moveToContextFolder\?: boolean;/);
  assert.match(composer, /import \{ contextFolderPayload \} from '..\/..\/utils\/attachmentContext';/);
  assert.match(composer, /انتقال دارایی‌های انتخاب‌شده به پوشهٔ این بخش/);
  assert.match(composer, /`\/dam\/library\/\$\{asset\.id\}\/context-folder`/);
  assert.match(composer, /const contextFolder = value\.moveToContextFolder \? contextFolderPayload\(relations\) : null;/);
  assert.match(composer, /ATTACHMENT_FOLDER_MOVE_EVENT/);

  // سرور مقصد را با همان قاعدهٔ آپلود تازه تعیین می‌کند.
  assert.match(controller, /public function contextFolder\(Request \$request, DamAsset \$asset, DamService \$service\)/);
  assert.match(controller, /app\(DamFolderStorage::class\)->moveAsset\(\$asset, \$folder->id\)/);
  assert.match(controller, /'assets\.move'/);
  assert.match(routes, /dam\/library\/\{asset\}\/context-folder/);
  assert.match(service, /public function contextFolder\(array \$context, User \$actor\): \?DamFolder/);
});

test('ضمیمه‌ها: مقصدِ انتقال از همان زمینهٔ فرم ساخته می‌شود', async () => {
  const { contextFolderPayload } = await import('../src/utils/attachmentContext.ts');
  assert.deepEqual(contextFolderPayload({ contentId: '7', contentBucket: 'outputs' }), { content_id: 7, content_bucket: 'outputs' });
  assert.deepEqual(contextFolderPayload({ ideaId: '4' }), { idea_id: 4 });
  assert.deepEqual(contextFolderPayload({ meetingId: '9' }), { meeting_id: 9 });
  // بدون زمینهٔ عددی، انتقال معنا ندارد.
  assert.equal(contextFolderPayload({ contentBucket: 'outputs' }), null);
  assert.equal(contextFolderPayload({}), null);
  assert.equal(contextFolderPayload({ taskId: 'x' }), null);
});
