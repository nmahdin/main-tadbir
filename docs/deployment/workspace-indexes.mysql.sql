-- ایندکس‌های عملکردیِ گزارش‌ها و فهرست‌ها — MySQL / MariaDB
--
-- این فایل اختیاری است. اگر هاست شما اجازهٔ `php artisan migrate` نمی‌دهد،
-- می‌توانید همین دستورها را در phpMyAdmin (تب SQL) روی همان پایگاه‌داده اجرا
-- کنید. معادل دقیق آن دو مسیر دیگر است:
--   • تنظیمات ← نگهداری ← «ایندکس‌های عملکرد» ← «ساخت ایندکس‌های ناقص»
--   • `php artisan migrate`
--
-- نکته‌ها:
--   • هیچ داده‌ای خوانده، تغییر یا حذف نمی‌شود؛ فقط ساختار جست‌وجو ساخته می‌شود.
--   • اگر ایندکسی از قبل وجود داشته باشد، MySQL خطای «Duplicate key name» می‌دهد
--     و بقیهٔ دستورها اجرا نمی‌شوند. برای همین هر دستور جدا و با بررسی وجود
--     ایندکس در `information_schema` پیچیده شده است؛ اجرای دوباره بی‌خطر است.
--   • اگر میزبان MySQL 5.7 یا MariaDB قدیمی است و `ADD INDEX` زمان می‌برد،
--     اجرا را در ساعات کم‌بار انجام دهید.
--   • اگر فضای دیسک یا مجوز ALTER ندارید، این ایندکس‌ها را اجرا نکنید؛ سامانه
--     بدون آن‌ها هم کامل کار می‌کند و فقط فهرست‌ها/گزارش‌ها کندتر می‌شوند.

SET @schema := DATABASE();

-- contents(status, deadline)
SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = @schema AND table_name = 'contents' AND index_name = 'contents_status_deadline_index'),
  'SELECT ''contents_status_deadline_index already exists'' AS result',
  'ALTER TABLE `contents` ADD INDEX `contents_status_deadline_index` (`status`, `deadline`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- contents(type, status)
SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = @schema AND table_name = 'contents' AND index_name = 'contents_type_status_index'),
  'SELECT ''contents_type_status_index already exists'' AS result',
  'ALTER TABLE `contents` ADD INDEX `contents_type_status_index` (`type`, `status`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- contents(deadline)
SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = @schema AND table_name = 'contents' AND index_name = 'contents_deadline_index'),
  'SELECT ''contents_deadline_index already exists'' AS result',
  'ALTER TABLE `contents` ADD INDEX `contents_deadline_index` (`deadline`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tasks(status, deadline)
SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = @schema AND table_name = 'tasks' AND index_name = 'tasks_status_deadline_index'),
  'SELECT ''tasks_status_deadline_index already exists'' AS result',
  'ALTER TABLE `tasks` ADD INDEX `tasks_status_deadline_index` (`status`, `deadline`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tasks(assignee_id, status)
SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = @schema AND table_name = 'tasks' AND index_name = 'tasks_assignee_status_index'),
  'SELECT ''tasks_assignee_status_index already exists'' AS result',
  'ALTER TABLE `tasks` ADD INDEX `tasks_assignee_status_index` (`assignee_id`, `status`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tasks(project_id, status)
SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = @schema AND table_name = 'tasks' AND index_name = 'tasks_project_status_index'),
  'SELECT ''tasks_project_status_index already exists'' AS result',
  'ALTER TABLE `tasks` ADD INDEX `tasks_project_status_index` (`project_id`, `status`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tasks(deadline)
SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = @schema AND table_name = 'tasks' AND index_name = 'tasks_deadline_index'),
  'SELECT ''tasks_deadline_index already exists'' AS result',
  'ALTER TABLE `tasks` ADD INDEX `tasks_deadline_index` (`deadline`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- workspace_records(kind, status)
SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = @schema AND table_name = 'workspace_records' AND index_name = 'workspace_records_kind_status_index'),
  'SELECT ''workspace_records_kind_status_index already exists'' AS result',
  'ALTER TABLE `workspace_records` ADD INDEX `workspace_records_kind_status_index` (`kind`, `status`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- بررسی نهایی: ایندکس‌های ساخته‌شده
SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns
FROM information_schema.statistics
WHERE table_schema = @schema
  AND index_name IN (
    'contents_status_deadline_index', 'contents_type_status_index', 'contents_deadline_index',
    'tasks_status_deadline_index', 'tasks_assignee_status_index', 'tasks_project_status_index', 'tasks_deadline_index',
    'workspace_records_kind_status_index'
  )
GROUP BY table_name, index_name
ORDER BY table_name, index_name;
