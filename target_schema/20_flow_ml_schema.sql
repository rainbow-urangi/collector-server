USE flows_ml_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `anomalies`;
DROP TABLE IF EXISTS `process_edges`;
DROP TABLE IF EXISTS `process_nodes`;
DROP TABLE IF EXISTS `process_models`;
DROP TABLE IF EXISTS `cases`;
DROP TABLE IF EXISTS `event_log`;
DROP TABLE IF EXISTS `etl_state`;
DROP TABLE IF EXISTS `flows`;
DROP TABLE IF EXISTS `actions`;
DROP TABLE IF EXISTS `processes`;
DROP TABLE IF EXISTS `element_profiles`;
DROP TABLE IF EXISTS `data_patterns`;
DROP TABLE IF EXISTS `steps`;

CREATE TABLE `steps` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `match_pattern` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`match_pattern`)),
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ix_steps_id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE `actions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `step_id` int(11) NOT NULL,
  `step_order` int(11) NOT NULL,
  `action_type` varchar(50) NOT NULL,
  `target_selector` text DEFAULT NULL,
  `description` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `element_text` text DEFAULT NULL,
  `associated_label` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `step_id` (`step_id`),
  KEY `ix_actions_id` (`id`),
  CONSTRAINT `actions_ibfk_1` FOREIGN KEY (`step_id`) REFERENCES `steps` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE `data_patterns` (
  `id` varchar(64) NOT NULL,
  `selector` text NOT NULL,
  `patterns_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`patterns_json`)),
  `last_analyzed` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `element_profiles` (
  `id` varchar(64) NOT NULL,
  `selector` text NOT NULL,
  `constraints_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`constraints_json`)),
  `last_analyzed` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `processes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `business_name` varchar(255) DEFAULT NULL,
  `ai_summary` text DEFAULT NULL,
  `naming_source` varchar(50) DEFAULT 'RULE',
  PRIMARY KEY (`id`),
  KEY `ix_processes_id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE `flows` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `process_id` int(11) NOT NULL,
  `step_id` int(11) NOT NULL,
  `step_order` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `process_id` (`process_id`),
  KEY `step_id` (`step_id`),
  KEY `ix_flows_id` (`id`),
  CONSTRAINT `flows_ibfk_1` FOREIGN KEY (`process_id`) REFERENCES `processes` (`id`),
  CONSTRAINT `flows_ibfk_2` FOREIGN KEY (`step_id`) REFERENCES `steps` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE `etl_state` (
  `pipeline_name` varchar(64) NOT NULL,
  `tenant_id` varchar(128) NOT NULL DEFAULT '__ALL__',
  `last_event_pk` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  PRIMARY KEY (`pipeline_name`,`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `event_log` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `source_event_pk` bigint(20) unsigned NOT NULL COMMENT 'events.id',
  `case_id` bigint(20) unsigned NOT NULL COMMENT 'task_id (case_id=task_id)',
  `tenant_id` varchar(128) DEFAULT NULL,
  `user_id` varchar(128) NOT NULL,
  `session_id` varchar(128) NOT NULL,
  `task_id` bigint(20) unsigned NOT NULL,
  `ts` datetime(6) NOT NULL,
  `activity` varchar(512) NOT NULL,
  `activity_l1` varchar(128) DEFAULT NULL,
  `activity_l2` varchar(128) DEFAULT NULL,
  `activity_rule_version` varchar(32) NOT NULL,
  `event_type` varchar(32) NOT NULL,
  `interaction_type` varchar(32) DEFAULT NULL,
  `page_url` varchar(2048) NOT NULL,
  `page_title` text DEFAULT NULL,
  `api_path` varchar(2048) DEFAULT NULL,
  `api_method` varchar(16) DEFAULT NULL,
  `api_status_code` smallint(5) unsigned DEFAULT NULL,
  `element_tag` varchar(32) DEFAULT NULL,
  `data_testid` varchar(255) DEFAULT NULL,
  `target_selector` text DEFAULT NULL,
  `associated_label` text DEFAULT NULL,
  `element_text` text DEFAULT NULL,
  `attrs_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (`attrs_json` is null or json_valid(`attrs_json`)),
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_source_event_pk` (`source_event_pk`),
  KEY `idx_case_ts` (`case_id`,`ts`),
  KEY `idx_tenant_ts` (`tenant_id`,`ts`),
  KEY `idx_user_ts` (`user_id`,`ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `cases` (
  `case_id` bigint(20) unsigned NOT NULL COMMENT 'case_id = task_id',
  `tenant_id` varchar(128) DEFAULT NULL COMMENT '고객사/팀 식별자',
  `user_id` varchar(128) NOT NULL COMMENT '사용자 식별자 (로그인 ID)',
  `session_id` varchar(128) NOT NULL COMMENT '세션 ID',
  `task_id` bigint(20) unsigned NOT NULL COMMENT 'tasks.id',
  `start_time` datetime(6) NOT NULL COMMENT '케이스 시작 시각 (UTC)',
  `end_time` datetime(6) DEFAULT NULL COMMENT '케이스 종료 시각 (UTC)',
  `duration_ms` int(10) unsigned DEFAULT NULL COMMENT '케이스 소요시간(ms) (tasks.duration_ms)',
  `event_count` int(10) unsigned NOT NULL DEFAULT 0 COMMENT 'event_log 기준 이벤트 수',
  `unique_activities` int(10) unsigned NOT NULL DEFAULT 0 COMMENT '케이스 내 고유 activity 수',
  `unique_pages` int(10) unsigned NOT NULL DEFAULT 0 COMMENT '케이스 내 고유 page_url 수',
  `api_error_count` int(10) unsigned NOT NULL DEFAULT 0 COMMENT 'api_status_code>=400 카운트',
  `activity_rule_version` varchar(32) NOT NULL COMMENT 'activity 생성 규칙 버전',
  `computed_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6) COMMENT '집계 갱신 시각',
  PRIMARY KEY (`case_id`),
  KEY `idx_cases_tenant_start` (`tenant_id`,`start_time`),
  KEY `idx_cases_user_start` (`user_id`,`start_time`),
  KEY `idx_cases_session` (`session_id`),
  KEY `idx_cases_task` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='프로세스 마이닝/시각화를 위한 케이스(task) 단위 메타 집계';

CREATE TABLE `process_models` (
  `model_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(128) DEFAULT NULL,
  `model_name` varchar(128) NOT NULL,
  `method` varchar(64) NOT NULL,
  `params_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (`params_json` is null or json_valid(`params_json`)),
  `activity_rule_version` varchar(32) NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  PRIMARY KEY (`model_id`),
  KEY `idx_tenant_created` (`tenant_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `process_nodes` (
  `model_id` bigint(20) unsigned NOT NULL,
  `activity_hash` binary(16) NOT NULL,
  `activity` varchar(512) NOT NULL,
  `freq` int(10) unsigned NOT NULL,
  PRIMARY KEY (`model_id`,`activity_hash`),
  KEY `idx_model_freq` (`model_id`,`freq`),
  CONSTRAINT `fk_nodes_model` FOREIGN KEY (`model_id`) REFERENCES `process_models` (`model_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `process_edges` (
  `model_id` bigint(20) unsigned NOT NULL,
  `from_hash` binary(16) NOT NULL,
  `to_hash` binary(16) NOT NULL,
  `from_activity` varchar(512) NOT NULL,
  `to_activity` varchar(512) NOT NULL,
  `freq` int(10) unsigned NOT NULL,
  `prob` double NOT NULL,
  PRIMARY KEY (`model_id`,`from_hash`,`to_hash`),
  KEY `idx_model_from` (`model_id`,`from_hash`),
  CONSTRAINT `fk_edges_model` FOREIGN KEY (`model_id`) REFERENCES `process_models` (`model_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `anomalies` (
  `model_id` bigint(20) unsigned NOT NULL,
  `case_id` bigint(20) unsigned NOT NULL,
  `score` double NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  PRIMARY KEY (`model_id`,`case_id`),
  KEY `idx_model_score` (`model_id`,`score`),
  CONSTRAINT `fk_anom_model` FOREIGN KEY (`model_id`) REFERENCES `process_models` (`model_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS = 1;
