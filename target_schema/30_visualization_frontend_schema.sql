USE visualization_frontend_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `daily_statistics`;
DROP TABLE IF EXISTS `process_visualizations`;
DROP TABLE IF EXISTS `admin_users`;

CREATE TABLE `admin_users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `role` enum('ADMIN','VIEWER') DEFAULT 'VIEWER',
  `invited_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `process_visualizations` (
  `process_id` int(11) NOT NULL,
  `chart_config` longtext DEFAULT NULL,
  `source_signature` varchar(64) DEFAULT NULL,
  `last_synced_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`process_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE `daily_statistics` (
  `date` datetime NOT NULL,
  `active_users` int(11) DEFAULT NULL,
  `total_sessions` int(11) DEFAULT NULL,
  `total_events` int(11) DEFAULT NULL,
  `avg_session_duration` int(11) DEFAULT NULL,
  `avg_events_per_session` int(11) DEFAULT NULL,
  `top_processes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`top_processes`)),
  `task_completion_rate` int(11) DEFAULT NULL,
  `new_processes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_processes`)),
  `new_steps` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_steps`)),
  `new_users` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_users`)),
  `new_urls` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_urls`)),
  `analyzed_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;
