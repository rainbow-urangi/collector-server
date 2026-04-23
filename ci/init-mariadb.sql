CREATE DATABASE IF NOT EXISTS ingest_backend_db CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

USE ingest_backend_db;

DROP TABLE IF EXISTS `events`;
DROP TABLE IF EXISTS `tasks`;
DROP TABLE IF EXISTS `steps`;
DROP TABLE IF EXISTS `sessions`;

CREATE TABLE `sessions` (
  `id` varchar(128) NOT NULL,
  `user_id` varchar(128) NOT NULL,
  `tenant_id` varchar(128) DEFAULT NULL,
  `start_time` datetime(6) NOT NULL,
  `end_time` datetime(6) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `browser_id` varchar(128) DEFAULT NULL,
  `viewport_size` varchar(64) DEFAULT NULL,
  `viewport_width` int unsigned DEFAULT NULL,
  `viewport_height` int unsigned DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_start_time` (`start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `steps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `match_pattern` longtext DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `tasks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `session_id` varchar(128) NOT NULL,
  `task_name` varchar(255) NOT NULL,
  `status` enum('IN_PROGRESS','COMPLETED','ABANDONED','VIEW_ONLY') NOT NULL DEFAULT 'IN_PROGRESS',
  `start_time` datetime(6) NOT NULL,
  `end_time` datetime(6) DEFAULT NULL,
  `duration_ms` int unsigned DEFAULT NULL,
  `step_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tasks_session_task_name` (`session_id`, `task_name`),
  KEY `fk_tasks_session_id` (`session_id`),
  KEY `fk_tasks_step_id` (`step_id`),
  CONSTRAINT `fk_tasks_session_id` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tasks_step_id` FOREIGN KEY (`step_id`) REFERENCES `steps` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_id` varchar(64) DEFAULT NULL,
  `session_id` varchar(128) DEFAULT NULL,
  `task_id` bigint unsigned DEFAULT NULL,
  `workflow_index` int DEFAULT NULL,
  `step_duration_ms` int unsigned DEFAULT NULL,
  `workflow_key` varchar(128) DEFAULT NULL,
  `workflow_outcome` varchar(20) DEFAULT NULL,
  `event_time` datetime(6) NOT NULL,
  `event_type` enum('DOM_EVENT','API_REQUEST','PAGE_VIEW') NOT NULL,
  `page_url` varchar(2048) NOT NULL,
  `target_selector` text DEFAULT NULL,
  `locators_json` longtext DEFAULT NULL,
  `data_testid` varchar(255) DEFAULT NULL,
  `element_tag` varchar(32) DEFAULT NULL,
  `selector_xpath` longtext DEFAULT NULL,
  `interaction_type` varchar(32) DEFAULT NULL,
  `input_data` text DEFAULT NULL,
  `api_path` varchar(2048) DEFAULT NULL,
  `api_method` varchar(16) DEFAULT NULL,
  `api_status_code` smallint unsigned DEFAULT NULL,
  `page_title` text DEFAULT NULL,
  `element_text` text DEFAULT NULL,
  `associated_label` text DEFAULT NULL,
  `api_latency_ms` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_events_event_id` (`event_id`),
  KEY `idx_task_id_event_time` (`task_id`, `event_time`),
  KEY `idx_session_id` (`session_id`),
  KEY `idx_workflow_key` (`workflow_key`),
  CONSTRAINT `fk_events_task_id` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
