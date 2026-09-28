-- MANUAL INSTALL ONLY: MySQL/MariaDB, existing Tadbir schema already migrated.
-- Back up the database first. Run in maintenance mode through phpMyAdmin.
-- Do NOT import if the Laravel migration below was already applied.
-- Intentionally no IF NOT EXISTS: an existing/partial schema must be inspected, not hidden.
-- Tested via Laravel migration on SQLite; this manual SQL still needs validation on target MySQL.

CREATE TABLE `bale_user_links` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `bale_user_id` varchar(32) NOT NULL,
  `chat_id` varchar(32) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bale_user_links_user_id_unique` (`user_id`),
  UNIQUE KEY `bale_user_links_bale_user_id_unique` (`bale_user_id`),
  CONSTRAINT `bale_user_links_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bale_link_codes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `code_hash` varchar(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bale_link_codes_user_id_unique` (`user_id`),
  UNIQUE KEY `bale_link_codes_code_hash_unique` (`code_hash`),
  KEY `bale_link_codes_expires_at_index` (`expires_at`),
  CONSTRAINT `bale_link_codes_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bale_inbox` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `bot_id` varchar(32) NOT NULL,
  `update_id` bigint unsigned NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'processed',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bale_inbox_bot_id_update_id_unique` (`bot_id`, `update_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bale_outbox` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `deduplication_key` varchar(160) NOT NULL,
  `bot_id` varchar(32) NOT NULL,
  `link_id` bigint unsigned DEFAULT NULL,
  `requires_link` tinyint(1) NOT NULL DEFAULT 1,
  `chat_id` varchar(32) NOT NULL,
  `payload` text NOT NULL,
  `subject_type` varchar(30) DEFAULT NULL,
  `subject_id` bigint unsigned DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `attempts` smallint unsigned NOT NULL DEFAULT 0,
  `available_at` timestamp NOT NULL,
  `error_code` varchar(40) DEFAULT NULL,
  `remote_message_id` varchar(40) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bale_outbox_deduplication_key_unique` (`deduplication_key`),
  KEY `bale_outbox_status_available_at_index` (`status`, `available_at`),
  CONSTRAINT `bale_outbox_link_id_foreign` FOREIGN KEY (`link_id`) REFERENCES `bale_user_links` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bale_conversations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `link_id` bigint unsigned NOT NULL,
  `step` varchar(40) NOT NULL,
  `nonce` varchar(32) NOT NULL,
  `data` text NOT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bale_conversations_link_id_unique` (`link_id`),
  KEY `bale_conversations_expires_at_index` (`expires_at`),
  CONSTRAINT `bale_conversations_link_id_foreign` FOREIGN KEY (`link_id`) REFERENCES `bale_user_links` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Run this final statement ONLY after verifying ALL FIVE tables were created successfully.
-- MySQL DDL is not transactionally rolled back if an earlier statement fails.
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_09_28_100000_create_bale_transport_tables', COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`;
