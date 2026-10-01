-- Manual shared-host deployment for one-time Bale mini-app panel sessions.
-- BACK UP FIRST and test on a separate copy. MySQL 8+ / compatible MariaDB only.
-- Execute once only when Laravel cannot run migrations.
-- Do not run if migration 2026_09_30_000002_create_bale_panel_sessions_table is already applied.
-- DDL may auto-commit; this script is not restartable after a partial failure.

CREATE TABLE `bale_panel_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `link_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bale_panel_sessions_link_id_unique` (`link_id`),
  UNIQUE KEY `bale_panel_sessions_token_hash_unique` (`token_hash`),
  KEY `bale_panel_sessions_user_id_index` (`user_id`),
  KEY `bale_panel_sessions_expires_at_index` (`expires_at`),
  CONSTRAINT `bale_panel_sessions_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bale_panel_sessions_link_id_foreign` FOREIGN KEY (`link_id`) REFERENCES `bale_user_links` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Only after CREATE TABLE and both foreign keys succeed:
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_09_30_000002_create_bale_panel_sessions_table', COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`;

-- Emergency rollback after restoring code and taking a backup:
-- DROP TABLE `bale_panel_sessions`;
-- DELETE FROM `migrations` WHERE `migration` = '2026_09_30_000002_create_bale_panel_sessions_table';
