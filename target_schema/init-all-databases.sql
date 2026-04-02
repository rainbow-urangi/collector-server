CREATE DATABASE IF NOT EXISTS ingest_backend_db CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE DATABASE IF NOT EXISTS flows_ml_db CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE DATABASE IF NOT EXISTS visualization_frontend_db CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE USER IF NOT EXISTS 'backend_admin'@'%' IDENTIFIED BY 'Back@end#01!';
CREATE USER IF NOT EXISTS 'flows_admin'@'%' IDENTIFIED BY 'Fl@ows#01!';
CREATE USER IF NOT EXISTS 'frontend_admin'@'%' IDENTIFIED BY 'Front@end#01!';
CREATE USER IF NOT EXISTS 'Rainbow_admin'@'%' IDENTIFIED BY 'Rain@bow01!';

GRANT SELECT, INSERT, UPDATE ON ingest_backend_db.* TO 'backend_admin'@'%';

GRANT SELECT ON ingest_backend_db.* TO 'flows_admin'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON flows_ml_db.* TO 'flows_admin'@'%';

GRANT SELECT ON ingest_backend_db.* TO 'frontend_admin'@'%';
GRANT SELECT ON flows_ml_db.* TO 'frontend_admin'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON visualization_frontend_db.* TO 'frontend_admin'@'%';

GRANT ALL PRIVILEGES ON ingest_backend_db.* TO 'Rainbow_admin'@'%';
GRANT ALL PRIVILEGES ON flows_ml_db.* TO 'Rainbow_admin'@'%';
GRANT ALL PRIVILEGES ON visualization_frontend_db.* TO 'Rainbow_admin'@'%';

FLUSH PRIVILEGES;

USE ingest_backend_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `snapshots`;
DROP TABLE IF EXISTS `events`;
DROP TABLE IF EXISTS `tasks`;
DROP TABLE IF EXISTS `steps`;
DROP TABLE IF EXISTS `sessions`;
DROP TABLE IF EXISTS `az_events`;

CREATE TABLE `az_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT '내부 이벤트 PK (AUTO_INCREMENT)',
  `AZ_api_url` varchar(2048) DEFAULT NULL COMMENT '같은 탭에서 직전/동시 감지된 요청 URL (입력/클릭과 매핑)',
  `AZ_api_method` varchar(16) DEFAULT NULL COMMENT '요청 메서드(GET/POST 등)',
  `AZ_api_status` smallint(5) unsigned DEFAULT NULL COMMENT '응답 상태코드(예: 200, 500) — webRequest.onCompleted',
  `AZ_api_path` varchar(512) DEFAULT NULL COMMENT '분석/대기용 Path만 추출(예: /c4web/getTABLEList)',
  `AZ_ip_address` varchar(64) DEFAULT NULL COMMENT 'IP(확장에서는 불가: (unavailable-in-extension))',
  `AZ_url` varchar(2048) NOT NULL COMMENT '이벤트가 발생한 페이지 URL',
  `AZ_login_id` varchar(128) DEFAULT NULL COMMENT '확장 옵션 loginId(없으면 unknown)',
  `AZ_event_time` datetime(6) NOT NULL COMMENT 'UTC 기준 이벤트 시각(마이크로초)',
  `AZ_element_uid` varchar(256) DEFAULT NULL COMMENT '안정 식별자(id/name/aria/data-testid/href → 없으면 css/xpath/해시)',
  `AZ_element_type` varchar(32) DEFAULT NULL COMMENT '요소/이벤트 타입(text/password/select/textarea/menu/state 등)',
  `AZ_element_label` varchar(255) DEFAULT NULL COMMENT '라벨/텍스트(연결 label/aria/placeholder/인접셀 등에서 추출)',
  `AZ_data` mediumtext DEFAULT NULL COMMENT '입력 최종값(비밀번호 안보임 처리), 메뉴 요약(href, trail 등)',
  `AZ_frame_path` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'iframe 체인)',
  `AZ_shadow_path` longtext DEFAULT NULL COMMENT 'shadow DOM host 체인(빈 문자열 허용; JSON이 아닐 수도 있음)',
  `AZ_form_selector` varchar(512) DEFAULT NULL COMMENT '가까운 form 컨테이너 셀렉터(스코프 좁히기용)',
  `AZ_locators_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '재생 보조 로케이터: a11y, testids, attrs, bounds',
  `AZ_nav_root` varchar(512) DEFAULT NULL COMMENT '메뉴 루트(nav/aside) 셀렉터',
  `AZ_menu_li_trail` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '정규화된 메뉴 텍스트 경로(예: ["판매관리","주문 등록"])',
  `AZ_post_hints` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '후행 신호(title/modal/alert) — 의미 변화만 기록',
  `AZ_event_action` varchar(32) DEFAULT NULL COMMENT '원액션: menu_click/event/change/page_view/route_change/post_state 등',
  `AZ_event_subtype` varchar(32) DEFAULT NULL COMMENT '세부타입: keydown/input/spa/state 등',
  `AZ_page_title` text DEFAULT NULL COMMENT 'document.title',
  `AZ_referrer` text DEFAULT NULL COMMENT 'document.referrer',
  `AZ_viewport_w` int(10) unsigned DEFAULT NULL COMMENT 'viewport width',
  `AZ_viewport_h` int(10) unsigned DEFAULT NULL COMMENT 'viewport height',
  `AZ_url_host` varchar(255) DEFAULT NULL COMMENT '호스트(예: app.example.com)',
  `AZ_url_path` text DEFAULT NULL COMMENT '경로(예: /orders/new)',
  `AZ_api_host` varchar(255) DEFAULT NULL COMMENT '최근 매핑된 요청의 호스트',
  `AZ_api_latency_ms` int(10) unsigned DEFAULT NULL COMMENT '최근 요청 지연 추정(ms)',
  `AZ_session_install_id` varchar(128) DEFAULT NULL COMMENT '설치 ID(UUID)',
  `AZ_session_browser_id` varchar(128) DEFAULT NULL COMMENT '브라우저 세션 ID',
  `AZ_session_tab_id` int(10) unsigned DEFAULT NULL COMMENT '탭 ID',
  `AZ_session_page_id` varchar(128) DEFAULT NULL COMMENT '페이지 세션 ID',
  `AZ_selector_css` text DEFAULT NULL COMMENT '요소 CSS 셀렉터',
  `AZ_selector_xpath` longtext DEFAULT NULL COMMENT '요소 XPath',
  `AZ_element_tag` varchar(32) DEFAULT NULL COMMENT '태그명(예: INPUT/BUTTON)',
  `AZ_a11y_role` varchar(64) DEFAULT NULL COMMENT 'ARIA role',
  `AZ_aria_label` text DEFAULT NULL COMMENT 'aria-label',
  `AZ_aria_labelledby` varchar(512) DEFAULT NULL COMMENT 'aria-labelledby',
  `AZ_form_name` varchar(255) DEFAULT NULL COMMENT 'form name',
  `AZ_form_action` text DEFAULT NULL COMMENT 'form action(URL/경로)',
  `AZ_data_testid` varchar(255) DEFAULT NULL COMMENT 'data-testid/data-qa/data-cy 등',
  `AZ_input_length` int(10) unsigned DEFAULT NULL COMMENT '입력 길이(문자수)',
  `AZ_is_sensitive` tinyint(1) unsigned DEFAULT NULL COMMENT '민감 여부 1/0',
  `AZ_key` varchar(32) DEFAULT NULL COMMENT '키 이름(Enter/Tab/ArrowLeft 등)',
  `AZ_key_mods` varchar(32) DEFAULT NULL COMMENT '수정키 조합(ctrl/alt/shift)',
  `AZ_menu_section` varchar(255) DEFAULT NULL COMMENT '정규화된 메뉴 섹션',
  `AZ_menu_item` varchar(255) DEFAULT NULL COMMENT '정규화된 메뉴 아이템',
  `AZ_route_from` text DEFAULT NULL COMMENT 'SPA 이동 전 URL',
  `AZ_route_to` text DEFAULT NULL COMMENT 'SPA 이동 후 URL',
  PRIMARY KEY (`id`),
  KEY `idx_event_time` (`AZ_event_time`),
  KEY `idx_url_time` (`AZ_url`(255),`AZ_event_time`),
  KEY `idx_api_path` (`AZ_api_path`),
  KEY `idx_element_type` (`AZ_element_type`),
  KEY `idx_login_id` (`AZ_login_id`),
  KEY `idx_event_action` (`AZ_event_action`),
  KEY `idx_url_host_time` (`AZ_url_host`,`AZ_event_time`),
  KEY `idx_api_host` (`AZ_api_host`),
  KEY `idx_session_page` (`AZ_session_page_id`),
  KEY `idx_session_tab` (`AZ_session_tab_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `sessions` (
  `id` varchar(128) NOT NULL COMMENT '세션 고유 ID',
  `user_id` varchar(128) NOT NULL COMMENT '사용자 식별자',
  `tenant_id` varchar(128) DEFAULT NULL COMMENT '테넌트 식별자',
  `start_time` datetime(6) NOT NULL COMMENT '세션 시작 시각',
  `end_time` datetime(6) DEFAULT NULL COMMENT '세션 종료 시각',
  `user_agent` text DEFAULT NULL COMMENT '브라우저 및 OS 정보',
  `browser_id` varchar(128) DEFAULT NULL COMMENT '브라우저 식별자',
  `viewport_size` varchar(64) DEFAULT NULL COMMENT '뷰포트 문자열',
  `viewport_width` int(10) unsigned DEFAULT NULL,
  `viewport_height` int(10) unsigned DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_start_time` (`start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `steps` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `match_pattern` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`match_pattern`)),
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ix_steps_id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE `tasks` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `session_id` varchar(128) NOT NULL COMMENT '세션 ID',
  `task_name` varchar(255) NOT NULL COMMENT '과업 이름',
  `status` enum('IN_PROGRESS','COMPLETED','ABANDONED','VIEW_ONLY') NOT NULL DEFAULT 'IN_PROGRESS',
  `start_time` datetime(6) NOT NULL,
  `end_time` datetime(6) DEFAULT NULL,
  `duration_ms` int(10) unsigned DEFAULT NULL,
  `step_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_tasks_session_id` (`session_id`),
  KEY `fk_tasks_step_id` (`step_id`),
  CONSTRAINT `fk_tasks_session_id` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tasks_step_id` FOREIGN KEY (`step_id`) REFERENCES `steps` (`id`),
  UNIQUE KEY `uq_tasks_session_task_name` (`session_id`,`task_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` varchar(64) DEFAULT NULL,
  `session_id` varchar(128) DEFAULT NULL,
  `task_id` bigint(20) unsigned DEFAULT NULL,
  `workflow_index` int(11) DEFAULT NULL,
  `step_duration_ms` int(10) unsigned DEFAULT NULL,
  `workflow_key` varchar(128) DEFAULT NULL,
  `workflow_outcome` varchar(20) DEFAULT NULL,
  `event_time` datetime(6) NOT NULL,
  `event_type` enum('DOM_EVENT','API_REQUEST','PAGE_VIEW') NOT NULL,
  `page_url` varchar(2048) NOT NULL,
  `target_selector` text DEFAULT NULL,
  `locators_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`locators_json`)),
  `data_testid` varchar(255) DEFAULT NULL,
  `element_tag` varchar(32) DEFAULT NULL,
  `selector_xpath` longtext DEFAULT NULL,
  `interaction_type` varchar(32) DEFAULT NULL,
  `input_data` text DEFAULT NULL,
  `api_path` varchar(2048) DEFAULT NULL,
  `api_method` varchar(16) DEFAULT NULL,
  `api_status_code` smallint(5) unsigned DEFAULT NULL,
  `page_title` text DEFAULT NULL,
  `element_text` text DEFAULT NULL,
  `associated_label` text DEFAULT NULL,
  `api_latency_ms` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_events_event_id` (`event_id`),
  KEY `idx_task_id_event_time` (`task_id`,`event_time`),
  KEY `idx_session_id` (`session_id`),
  KEY `idx_workflow_key` (`workflow_key`),
  CONSTRAINT `fk_events_task_id` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `snapshots` (
  `event_id` bigint(20) unsigned NOT NULL,
  `dom_before` mediumtext DEFAULT NULL,
  `dom_after` mediumtext DEFAULT NULL,
  `api_response_body` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`api_response_body`)),
  PRIMARY KEY (`event_id`),
  CONSTRAINT `fk_snapshots_event_id` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS = 1;

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
