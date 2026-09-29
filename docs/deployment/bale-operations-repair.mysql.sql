-- REPAIR ONLY: partial installation of 2026_09_28_110000_extend_bale_operations.
-- Back up the selected database FIRST; stop traffic, then use phpMyAdmin SQL tab.
-- Prerequisites: phase 1 Bale + existing users, teams, workspace_records, DAM tables.
-- No DROP, no preference reset, no credentials. DDL auto-commits; keep the backup.
-- MySQL 8+/compatible MariaDB, InnoDB, unsigned BIGINT parent IDs, no table prefix.
-- Existing tables are NOT modified/replaced by CREATE IF NOT EXISTS. If they have
-- unexpected definitions, STOP and compare with the Laravel migration manually.
SELECT DATABASE() AS selected_database;

SET @repair = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'bale_user_links' AND column_name = 'notifications_enabled'),
  'SELECT ''notifications_enabled already exists'' AS result',
  'ALTER TABLE `bale_user_links` ADD COLUMN `notifications_enabled` TINYINT(1) NOT NULL DEFAULT 1');
PREPARE stmt FROM @repair; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @repair = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'domain_records' AND column_name = 'notification_key'),
  'SELECT ''notification_key already exists'' AS result',
  'ALTER TABLE `domain_records` ADD COLUMN `notification_key` VARCHAR(64) NULL');
PREPARE stmt FROM @repair; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @repair = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'domain_records' AND index_name = 'domain_records_notification_key_unique'),
  'SELECT ''notification unique index already exists'' AS result',
  'ALTER TABLE `domain_records` ADD UNIQUE KEY `domain_records_notification_key_unique` (`notification_key`)');
PREPARE stmt FROM @repair; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `dam_data_table_team` (
  `dam_data_table_id` BIGINT UNSIGNED NOT NULL,
  `team_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`dam_data_table_id`, `team_id`),
  CONSTRAINT `dam_data_table_team_dam_data_table_id_foreign` FOREIGN KEY (`dam_data_table_id`) REFERENCES `dam_data_tables` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dam_data_table_team_team_id_foreign` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bale_reminder_runs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `meeting_id` BIGINT UNSIGNED NOT NULL,
  `actor_id` BIGINT UNSIGNED NULL,
  `request_key` VARCHAR(64) NOT NULL,
  `snapshot` VARCHAR(64) NOT NULL,
  `notification_ids` JSON NOT NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bale_reminder_runs_request_key_unique` (`request_key`),
  CONSTRAINT `bale_reminder_runs_meeting_id_foreign` FOREIGN KEY (`meeting_id`) REFERENCES `workspace_records` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bale_reminder_runs_actor_id_foreign` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Inspect these results before marking the migration below. All four statements
-- must succeed and the definitions must match the migration/original SQL.
SHOW CREATE TABLE `bale_reminder_runs`;
SHOW CREATE TABLE `dam_data_table_team`;
SHOW COLUMNS FROM `bale_user_links` LIKE 'notifications_enabled';
SHOW INDEX FROM `domain_records` WHERE Key_name = 'domain_records_notification_key_unique';

-- ONLY AFTER verification, run the following separately (uncomment it).
-- Do not mark a migration complete if any preceding statement failed.
-- INSERT INTO `migrations` (`migration`, `batch`)
-- SELECT '2026_09_28_110000_extend_bale_operations', COALESCE(MAX(`batch`), 0) + 1
-- FROM `migrations`
-- HAVING NOT EXISTS (SELECT 1 FROM `migrations` WHERE `migration` = '2026_09_28_110000_extend_bale_operations');
