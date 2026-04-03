USE ingest_backend_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

INSERT INTO ingest_backend_db.az_events (
  id, AZ_api_url, AZ_api_method, AZ_api_status, AZ_api_path, AZ_ip_address, AZ_url, AZ_login_id,
  AZ_event_time, AZ_element_uid, AZ_element_type, AZ_element_label, AZ_data, AZ_frame_path, AZ_shadow_path,
  AZ_form_selector, AZ_locators_json, AZ_nav_root, AZ_menu_li_trail, AZ_post_hints, AZ_event_action,
  AZ_event_subtype, AZ_page_title, AZ_referrer, AZ_viewport_w, AZ_viewport_h, AZ_url_host, AZ_url_path,
  AZ_api_host, AZ_api_latency_ms, AZ_session_install_id, AZ_session_browser_id, AZ_session_tab_id,
  AZ_session_page_id, AZ_selector_css, AZ_selector_xpath, AZ_element_tag, AZ_a11y_role, AZ_aria_label,
  AZ_aria_labelledby, AZ_form_name, AZ_form_action, AZ_data_testid, AZ_input_length, AZ_is_sensitive,
  AZ_key, AZ_key_mods, AZ_menu_section, AZ_menu_item, AZ_route_from, AZ_route_to
)
SELECT
  id, AZ_api_url, AZ_api_method, AZ_api_status, AZ_api_path, AZ_ip_address, AZ_url, AZ_login_id,
  AZ_event_time, AZ_element_uid, AZ_element_type, AZ_element_label, AZ_data, AZ_frame_path, AZ_shadow_path,
  AZ_form_selector, AZ_locators_json, AZ_nav_root, AZ_menu_li_trail, AZ_post_hints, AZ_event_action,
  AZ_event_subtype, AZ_page_title, AZ_referrer, AZ_viewport_w, AZ_viewport_h, AZ_url_host, AZ_url_path,
  AZ_api_host, AZ_api_latency_ms, AZ_session_install_id, AZ_session_browser_id, AZ_session_tab_id,
  AZ_session_page_id, AZ_selector_css, AZ_selector_xpath, AZ_element_tag, AZ_a11y_role, AZ_aria_label,
  AZ_aria_labelledby, AZ_form_name, AZ_form_action, AZ_data_testid, AZ_input_length, AZ_is_sensitive,
  AZ_key, AZ_key_mods, AZ_menu_section, AZ_menu_item, AZ_route_from, AZ_route_to
FROM didimdol_collection_db.az_events
ON DUPLICATE KEY UPDATE
  AZ_api_url = VALUES(AZ_api_url),
  AZ_api_method = VALUES(AZ_api_method),
  AZ_api_status = VALUES(AZ_api_status),
  AZ_api_path = VALUES(AZ_api_path),
  AZ_ip_address = VALUES(AZ_ip_address),
  AZ_url = VALUES(AZ_url),
  AZ_login_id = VALUES(AZ_login_id),
  AZ_event_time = VALUES(AZ_event_time),
  AZ_element_uid = VALUES(AZ_element_uid),
  AZ_element_type = VALUES(AZ_element_type),
  AZ_element_label = VALUES(AZ_element_label),
  AZ_data = VALUES(AZ_data),
  AZ_frame_path = VALUES(AZ_frame_path),
  AZ_shadow_path = VALUES(AZ_shadow_path),
  AZ_form_selector = VALUES(AZ_form_selector),
  AZ_locators_json = VALUES(AZ_locators_json),
  AZ_nav_root = VALUES(AZ_nav_root),
  AZ_menu_li_trail = VALUES(AZ_menu_li_trail),
  AZ_post_hints = VALUES(AZ_post_hints),
  AZ_event_action = VALUES(AZ_event_action),
  AZ_event_subtype = VALUES(AZ_event_subtype),
  AZ_page_title = VALUES(AZ_page_title),
  AZ_referrer = VALUES(AZ_referrer),
  AZ_viewport_w = VALUES(AZ_viewport_w),
  AZ_viewport_h = VALUES(AZ_viewport_h),
  AZ_url_host = VALUES(AZ_url_host),
  AZ_url_path = VALUES(AZ_url_path),
  AZ_api_host = VALUES(AZ_api_host),
  AZ_api_latency_ms = VALUES(AZ_api_latency_ms),
  AZ_session_install_id = VALUES(AZ_session_install_id),
  AZ_session_browser_id = VALUES(AZ_session_browser_id),
  AZ_session_tab_id = VALUES(AZ_session_tab_id),
  AZ_session_page_id = VALUES(AZ_session_page_id),
  AZ_selector_css = VALUES(AZ_selector_css),
  AZ_selector_xpath = VALUES(AZ_selector_xpath),
  AZ_element_tag = VALUES(AZ_element_tag),
  AZ_a11y_role = VALUES(AZ_a11y_role),
  AZ_aria_label = VALUES(AZ_aria_label),
  AZ_aria_labelledby = VALUES(AZ_aria_labelledby),
  AZ_form_name = VALUES(AZ_form_name),
  AZ_form_action = VALUES(AZ_form_action),
  AZ_data_testid = VALUES(AZ_data_testid),
  AZ_input_length = VALUES(AZ_input_length),
  AZ_is_sensitive = VALUES(AZ_is_sensitive),
  AZ_key = VALUES(AZ_key),
  AZ_key_mods = VALUES(AZ_key_mods),
  AZ_menu_section = VALUES(AZ_menu_section),
  AZ_menu_item = VALUES(AZ_menu_item),
  AZ_route_from = VALUES(AZ_route_from),
  AZ_route_to = VALUES(AZ_route_to);

INSERT INTO ingest_backend_db.sessions (
  id, user_id, tenant_id, start_time, end_time, user_agent, browser_id, viewport_size,
  viewport_width, viewport_height, ip_address
)
SELECT
  id, user_id, tenant_id, start_time, end_time, user_agent, browser_id, viewport_size,
  viewport_width, viewport_height, ip_address
FROM didimdol_collection_db.sessions
ON DUPLICATE KEY UPDATE
  user_id = VALUES(user_id),
  tenant_id = VALUES(tenant_id),
  start_time = VALUES(start_time),
  end_time = VALUES(end_time),
  user_agent = VALUES(user_agent),
  browser_id = VALUES(browser_id),
  viewport_size = VALUES(viewport_size),
  viewport_width = VALUES(viewport_width),
  viewport_height = VALUES(viewport_height),
  ip_address = VALUES(ip_address);

INSERT INTO ingest_backend_db.steps (
  id, name, description, match_pattern, created_at
)
SELECT
  id, name, description, match_pattern, created_at
FROM didimdol_collection_db.steps
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  match_pattern = VALUES(match_pattern),
  created_at = VALUES(created_at);

INSERT INTO ingest_backend_db.tasks (
  id, session_id, task_name, status, start_time, end_time, duration_ms, step_id
)
SELECT
  id, session_id, task_name, status, start_time, end_time, duration_ms, step_id
FROM didimdol_collection_db.tasks
ON DUPLICATE KEY UPDATE
  session_id = VALUES(session_id),
  task_name = VALUES(task_name),
  status = VALUES(status),
  start_time = VALUES(start_time),
  end_time = VALUES(end_time),
  duration_ms = VALUES(duration_ms),
  step_id = VALUES(step_id);

INSERT INTO ingest_backend_db.events (
  id, event_id, session_id, task_id, workflow_index, step_duration_ms, workflow_key, workflow_outcome,
  event_time, event_type, page_url, target_selector, locators_json, data_testid, element_tag,
  selector_xpath, interaction_type, input_data, api_path, api_method, api_status_code,
  page_title, element_text, associated_label, api_latency_ms
)
SELECT
  id,
  event_id,
  session_id,
  task_id,
  NULL AS workflow_index,
  NULL AS step_duration_ms,
  NULL AS workflow_key,
  NULL AS workflow_outcome,
  event_time,
  event_type,
  page_url,
  target_selector,
  locators_json,
  data_testid,
  element_tag,
  selector_xpath,
  interaction_type,
  input_data,
  api_path,
  api_method,
  api_status_code,
  page_title,
  element_text,
  associated_label,
  NULL AS api_latency_ms
FROM didimdol_collection_db.events
ON DUPLICATE KEY UPDATE
  session_id = VALUES(session_id),
  task_id = VALUES(task_id),
  workflow_index = VALUES(workflow_index),
  step_duration_ms = VALUES(step_duration_ms),
  workflow_key = VALUES(workflow_key),
  workflow_outcome = VALUES(workflow_outcome),
  event_time = VALUES(event_time),
  event_type = VALUES(event_type),
  page_url = VALUES(page_url),
  target_selector = VALUES(target_selector),
  locators_json = VALUES(locators_json),
  data_testid = VALUES(data_testid),
  element_tag = VALUES(element_tag),
  selector_xpath = VALUES(selector_xpath),
  interaction_type = VALUES(interaction_type),
  input_data = VALUES(input_data),
  api_path = VALUES(api_path),
  api_method = VALUES(api_method),
  api_status_code = VALUES(api_status_code),
  page_title = VALUES(page_title),
  element_text = VALUES(element_text),
  associated_label = VALUES(associated_label),
  api_latency_ms = VALUES(api_latency_ms);

INSERT INTO ingest_backend_db.snapshots (
  event_id, dom_before, dom_after, api_response_body
)
SELECT
  event_id, dom_before, dom_after, api_response_body
FROM didimdol_collection_db.snapshots
ON DUPLICATE KEY UPDATE
  dom_before = VALUES(dom_before),
  dom_after = VALUES(dom_after),
  api_response_body = VALUES(api_response_body);

SET FOREIGN_KEY_CHECKS = 1;
