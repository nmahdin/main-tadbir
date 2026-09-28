-- Department-only structure, MySQL 8+ / compatible MariaDB, via phpMyAdmin.
-- BACK UP database + application/private storage first. Stop OLD application traffic.
-- Requires the existing departments/users/teams/team_user and Bale operations schema.
-- Select the correct database in phpMyAdmin. No credentials/tokens in this script.
-- DDL auto-commits. Re-running adds only missing structure; it does NOT convert data.
-- Check that existing tables use InnoDB / BIGINT UNSIGNED identifiers.

SET @department_ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'departments' AND COLUMN_NAME = 'legacy_team_id'),
  'SELECT 1', 'ALTER TABLE `departments` ADD COLUMN `legacy_team_id` BIGINT UNSIGNED NULL');
PREPARE department_stmt FROM @department_ddl;
EXECUTE department_stmt;
DEALLOCATE PREPARE department_stmt;

SET @department_ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'departments' AND INDEX_NAME = 'departments_legacy_team_id_unique'),
  'SELECT 1', 'ALTER TABLE `departments` ADD UNIQUE INDEX `departments_legacy_team_id_unique` (`legacy_team_id`)');
PREPARE department_stmt FROM @department_ddl;
EXECUTE department_stmt;
DEALLOCATE PREPARE department_stmt;

CREATE TABLE IF NOT EXISTS `department_user` (
  `department_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role` VARCHAR(100) NOT NULL DEFAULT 'member',
  `joined_at` TIMESTAMP NULL,
  PRIMARY KEY (`department_id`, `user_id`),
  CONSTRAINT `department_user_department_id_foreign` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `department_user_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `dam_data_table_department` (
  `dam_data_table_id` BIGINT UNSIGNED NOT NULL,
  `department_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`dam_data_table_id`, `department_id`),
  CONSTRAINT `dam_data_table_department_dam_data_table_id_foreign` FOREIGN KEY (`dam_data_table_id`) REFERENCES `dam_data_tables` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dam_data_table_department_department_id_foreign` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Register a pending upgrade once. INSERT IGNORE preserves completed/checkpointed runs.
INSERT IGNORE INTO `system_settings` (`key`, `value`, `created_at`, `updated_at`)
VALUES ('department_consolidation_private', '{"phase":"teams","after":0}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Do not insert department_consolidation_private=done manually.
-- Finish the controlled conversion through the active administrator's Department page.
-- The Laravel migration is also idempotent for this structure if a CLI is added later.
