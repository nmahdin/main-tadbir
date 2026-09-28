-- Manual shared-host deployment, after bale-phase1.mysql.sql / its migration.
-- BACK UP FIRST. Stop application traffic while changing schema and uploading code.
-- Execute once with phpMyAdmin on the intended DB (MySQL 8+ / compatible MariaDB).
-- Check table prefix/types/engine against the existing schema before running.
-- DDL may auto-commit. This is NOT an idempotent/restartable script.
-- Do not run this script if Laravel has already applied this migration.
-- No token, APP_KEY, queue worker, SSH or Cron is required by this SQL.

ALTER TABLE `bale_user_links`
  ADD COLUMN `notifications_enabled` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `domain_records`
  ADD COLUMN `notification_key` VARCHAR(64) NULL,
  ADD UNIQUE KEY `domain_records_notification_key_unique` (`notification_key`);

CREATE TABLE `dam_data_table_team` (
  `dam_data_table_id` BIGINT UNSIGNED NOT NULL,
  `team_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`dam_data_table_id`, `team_id`),
  CONSTRAINT `dam_data_table_team_dam_data_table_id_foreign` FOREIGN KEY (`dam_data_table_id`) REFERENCES `dam_data_tables` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dam_data_table_team_team_id_foreign` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bale_reminder_runs` (
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

-- Only after ALL preceding statements succeed:
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_09_28_110000_extend_bale_operations', COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`;

-- Emergency rollback: first restore the previous application release and take a backup.
-- This loses team mappings, notification preferences and reminder/idempotence metadata.
-- It does NOT delete tasks, table rows, meetings or existing internal notifications.
-- DROP TABLE `bale_reminder_runs`;
-- DROP TABLE `dam_data_table_team`;
-- ALTER TABLE `domain_records` DROP INDEX `domain_records_notification_key_unique`, DROP COLUMN `notification_key`;
-- ALTER TABLE `bale_user_links` DROP COLUMN `notifications_enabled`;
-- DELETE FROM `migrations` WHERE `migration` = '2026_09_28_110000_extend_bale_operations';
