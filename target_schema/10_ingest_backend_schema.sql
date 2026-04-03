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
  CONSTRAINT `fk_tasks_step_id` FOREIGN KEY (`step_id`) REFERENCES `steps` (`id`)
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
