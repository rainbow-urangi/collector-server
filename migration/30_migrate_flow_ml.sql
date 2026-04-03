USE flows_ml_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

INSERT INTO flows_ml_db.steps (
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

INSERT INTO flows_ml_db.actions (
  id, step_id, step_order, action_type, target_selector, description, created_at, element_text, associated_label
)
SELECT
  id, step_id, step_order, action_type, target_selector, description, created_at, element_text, associated_label
FROM didimdol_collection_db.actions
ON DUPLICATE KEY UPDATE
  step_id = VALUES(step_id),
  step_order = VALUES(step_order),
  action_type = VALUES(action_type),
  target_selector = VALUES(target_selector),
  description = VALUES(description),
  created_at = VALUES(created_at),
  element_text = VALUES(element_text),
  associated_label = VALUES(associated_label);

INSERT INTO flows_ml_db.data_patterns (
  id, selector, patterns_json, last_analyzed
)
SELECT
  id, selector, patterns_json, last_analyzed
FROM didimdol_collection_db.data_patterns
ON DUPLICATE KEY UPDATE
  selector = VALUES(selector),
  patterns_json = VALUES(patterns_json),
  last_analyzed = VALUES(last_analyzed);

INSERT INTO flows_ml_db.element_profiles (
  id, selector, constraints_json, last_analyzed
)
SELECT
  id, selector, constraints_json, last_analyzed
FROM didimdol_collection_db.element_profiles
ON DUPLICATE KEY UPDATE
  selector = VALUES(selector),
  constraints_json = VALUES(constraints_json),
  last_analyzed = VALUES(last_analyzed);

INSERT INTO flows_ml_db.processes (
  id, name, description, created_at, business_name, ai_summary, naming_source
)
SELECT
  id, name, description, created_at, business_name, ai_summary, naming_source
FROM didimdol_collection_db.processes
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  created_at = VALUES(created_at),
  business_name = VALUES(business_name),
  ai_summary = VALUES(ai_summary),
  naming_source = VALUES(naming_source);

INSERT INTO flows_ml_db.flows (
  id, process_id, step_id, step_order
)
SELECT
  id, process_id, step_id, step_order
FROM didimdol_collection_db.flows
ON DUPLICATE KEY UPDATE
  process_id = VALUES(process_id),
  step_id = VALUES(step_id),
  step_order = VALUES(step_order);

INSERT INTO flows_ml_db.etl_state (
  pipeline_name, tenant_id, last_event_pk, updated_at
)
SELECT
  pipeline_name, tenant_id, last_event_pk, updated_at
FROM didimdol_collection_db.etl_state
ON DUPLICATE KEY UPDATE
  last_event_pk = VALUES(last_event_pk),
  updated_at = VALUES(updated_at);

INSERT INTO flows_ml_db.event_log (
  id, source_event_pk, case_id, tenant_id, user_id, session_id, task_id, ts, activity,
  activity_l1, activity_l2, activity_rule_version, event_type, interaction_type, page_url,
  page_title, api_path, api_method, api_status_code, element_tag, data_testid,
  target_selector, associated_label, element_text, attrs_json, created_at
)
SELECT
  id, source_event_pk, case_id, tenant_id, user_id, session_id, task_id, ts, activity,
  activity_l1, activity_l2, activity_rule_version, event_type, interaction_type, page_url,
  page_title, api_path, api_method, api_status_code, element_tag, data_testid,
  target_selector, associated_label, element_text, attrs_json, created_at
FROM didimdol_collection_db.event_log
ON DUPLICATE KEY UPDATE
  source_event_pk = VALUES(source_event_pk),
  case_id = VALUES(case_id),
  tenant_id = VALUES(tenant_id),
  user_id = VALUES(user_id),
  session_id = VALUES(session_id),
  task_id = VALUES(task_id),
  ts = VALUES(ts),
  activity = VALUES(activity),
  activity_l1 = VALUES(activity_l1),
  activity_l2 = VALUES(activity_l2),
  activity_rule_version = VALUES(activity_rule_version),
  event_type = VALUES(event_type),
  interaction_type = VALUES(interaction_type),
  page_url = VALUES(page_url),
  page_title = VALUES(page_title),
  api_path = VALUES(api_path),
  api_method = VALUES(api_method),
  api_status_code = VALUES(api_status_code),
  element_tag = VALUES(element_tag),
  data_testid = VALUES(data_testid),
  target_selector = VALUES(target_selector),
  associated_label = VALUES(associated_label),
  element_text = VALUES(element_text),
  attrs_json = VALUES(attrs_json),
  created_at = VALUES(created_at);

INSERT INTO flows_ml_db.cases (
  case_id, tenant_id, user_id, session_id, task_id, start_time, end_time, duration_ms,
  event_count, unique_activities, unique_pages, api_error_count, activity_rule_version, computed_at
)
SELECT
  case_id, tenant_id, user_id, session_id, task_id, start_time, end_time, duration_ms,
  event_count, unique_activities, unique_pages, api_error_count, activity_rule_version, computed_at
FROM didimdol_collection_db.cases
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  user_id = VALUES(user_id),
  session_id = VALUES(session_id),
  task_id = VALUES(task_id),
  start_time = VALUES(start_time),
  end_time = VALUES(end_time),
  duration_ms = VALUES(duration_ms),
  event_count = VALUES(event_count),
  unique_activities = VALUES(unique_activities),
  unique_pages = VALUES(unique_pages),
  api_error_count = VALUES(api_error_count),
  activity_rule_version = VALUES(activity_rule_version),
  computed_at = VALUES(computed_at);

INSERT INTO flows_ml_db.process_models (
  model_id, tenant_id, model_name, method, params_json, activity_rule_version, created_at
)
SELECT
  model_id, tenant_id, model_name, method, params_json, activity_rule_version, created_at
FROM didimdol_collection_db.process_models
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  model_name = VALUES(model_name),
  method = VALUES(method),
  params_json = VALUES(params_json),
  activity_rule_version = VALUES(activity_rule_version),
  created_at = VALUES(created_at);

INSERT INTO flows_ml_db.process_nodes (
  model_id, activity_hash, activity, freq
)
SELECT
  model_id, activity_hash, activity, freq
FROM didimdol_collection_db.process_nodes
ON DUPLICATE KEY UPDATE
  activity = VALUES(activity),
  freq = VALUES(freq);

INSERT INTO flows_ml_db.process_edges (
  model_id, from_hash, to_hash, from_activity, to_activity, freq, prob
)
SELECT
  model_id, from_hash, to_hash, from_activity, to_activity, freq, prob
FROM didimdol_collection_db.process_edges
ON DUPLICATE KEY UPDATE
  from_activity = VALUES(from_activity),
  to_activity = VALUES(to_activity),
  freq = VALUES(freq),
  prob = VALUES(prob);

INSERT INTO flows_ml_db.anomalies (
  model_id, case_id, score, reason, created_at
)
SELECT
  model_id, case_id, score, reason, created_at
FROM didimdol_collection_db.anomalies
ON DUPLICATE KEY UPDATE
  score = VALUES(score),
  reason = VALUES(reason),
  created_at = VALUES(created_at);

SET FOREIGN_KEY_CHECKS = 1;
