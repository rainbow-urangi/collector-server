USE visualization_frontend_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

INSERT INTO visualization_frontend_db.admin_users (
  id, email, password_hash, role, invited_at, created_at
)
SELECT
  id, email, password_hash, role, invited_at, created_at
FROM didimdol_collection_db.admin_users
ON DUPLICATE KEY UPDATE
  email = VALUES(email),
  password_hash = VALUES(password_hash),
  role = VALUES(role),
  invited_at = VALUES(invited_at),
  created_at = VALUES(created_at);

INSERT INTO visualization_frontend_db.process_visualizations (
  process_id, chart_config, source_signature, last_synced_at
)
SELECT
  process_id, chart_config, source_signature, last_synced_at
FROM didimdol_collection_db.process_visualizations
ON DUPLICATE KEY UPDATE
  chart_config = VALUES(chart_config),
  source_signature = VALUES(source_signature),
  last_synced_at = VALUES(last_synced_at);

INSERT INTO visualization_frontend_db.daily_statistics (
  date, active_users, total_sessions, total_events, avg_session_duration, avg_events_per_session,
  top_processes, task_completion_rate, new_processes, new_steps, new_users, new_urls, analyzed_at
)
SELECT
  date, active_users, total_sessions, total_events, avg_session_duration, avg_events_per_session,
  top_processes, task_completion_rate, new_processes, new_steps, new_users, new_urls, analyzed_at
FROM didimdol_collection_db.daily_statistics
ON DUPLICATE KEY UPDATE
  active_users = VALUES(active_users),
  total_sessions = VALUES(total_sessions),
  total_events = VALUES(total_events),
  avg_session_duration = VALUES(avg_session_duration),
  avg_events_per_session = VALUES(avg_events_per_session),
  top_processes = VALUES(top_processes),
  task_completion_rate = VALUES(task_completion_rate),
  new_processes = VALUES(new_processes),
  new_steps = VALUES(new_steps),
  new_users = VALUES(new_users),
  new_urls = VALUES(new_urls),
  analyzed_at = VALUES(analyzed_at);

SET FOREIGN_KEY_CHECKS = 1;
