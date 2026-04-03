-- duplicate_task_keys is informational.
-- Source data contains repeated (session_id, task_name) pairs, and target schema now preserves them.
-- Treat orphan/missing reference checks as the migration blocker conditions.

SELECT 'duplicate_task_keys' AS check_name, COUNT(*) AS issue_count
FROM (
  SELECT session_id, task_name
  FROM didimdol_collection_db.tasks
  GROUP BY session_id, task_name
  HAVING COUNT(*) > 1
) t;

SELECT 'duplicate_event_ids' AS check_name, COUNT(*) AS issue_count
FROM (
  SELECT event_id
  FROM didimdol_collection_db.events
  WHERE event_id IS NOT NULL
  GROUP BY event_id
  HAVING COUNT(*) > 1
) e;

SELECT 'missing_task_sessions' AS check_name, COUNT(*) AS issue_count
FROM didimdol_collection_db.tasks t
LEFT JOIN didimdol_collection_db.sessions s ON s.id = t.session_id
WHERE s.id IS NULL;

SELECT 'missing_event_tasks' AS check_name, COUNT(*) AS issue_count
FROM didimdol_collection_db.events e
LEFT JOIN didimdol_collection_db.tasks t ON t.id = e.task_id
WHERE e.task_id IS NOT NULL AND t.id IS NULL;

SELECT 'missing_snapshot_events' AS check_name, COUNT(*) AS issue_count
FROM didimdol_collection_db.snapshots s
LEFT JOIN didimdol_collection_db.events e ON e.id = s.event_id
WHERE e.id IS NULL;

SELECT 'source_table_counts' AS section, 'az_events' AS table_name, COUNT(*) AS row_count FROM didimdol_collection_db.az_events
UNION ALL
SELECT 'source_table_counts', 'sessions', COUNT(*) FROM didimdol_collection_db.sessions
UNION ALL
SELECT 'source_table_counts', 'steps', COUNT(*) FROM didimdol_collection_db.steps
UNION ALL
SELECT 'source_table_counts', 'tasks', COUNT(*) FROM didimdol_collection_db.tasks
UNION ALL
SELECT 'source_table_counts', 'events', COUNT(*) FROM didimdol_collection_db.events
UNION ALL
SELECT 'source_table_counts', 'snapshots', COUNT(*) FROM didimdol_collection_db.snapshots
UNION ALL
SELECT 'source_table_counts', 'event_log', COUNT(*) FROM didimdol_collection_db.event_log
UNION ALL
SELECT 'source_table_counts', 'cases', COUNT(*) FROM didimdol_collection_db.cases
UNION ALL
SELECT 'source_table_counts', 'etl_state', COUNT(*) FROM didimdol_collection_db.etl_state
UNION ALL
SELECT 'source_table_counts', 'data_patterns', COUNT(*) FROM didimdol_collection_db.data_patterns
UNION ALL
SELECT 'source_table_counts', 'element_profiles', COUNT(*) FROM didimdol_collection_db.element_profiles
UNION ALL
SELECT 'source_table_counts', 'actions', COUNT(*) FROM didimdol_collection_db.actions
UNION ALL
SELECT 'source_table_counts', 'processes', COUNT(*) FROM didimdol_collection_db.processes
UNION ALL
SELECT 'source_table_counts', 'flows', COUNT(*) FROM didimdol_collection_db.flows
UNION ALL
SELECT 'source_table_counts', 'process_models', COUNT(*) FROM didimdol_collection_db.process_models
UNION ALL
SELECT 'source_table_counts', 'process_nodes', COUNT(*) FROM didimdol_collection_db.process_nodes
UNION ALL
SELECT 'source_table_counts', 'process_edges', COUNT(*) FROM didimdol_collection_db.process_edges
UNION ALL
SELECT 'source_table_counts', 'anomalies', COUNT(*) FROM didimdol_collection_db.anomalies
UNION ALL
SELECT 'source_table_counts', 'admin_users', COUNT(*) FROM didimdol_collection_db.admin_users
UNION ALL
SELECT 'source_table_counts', 'process_visualizations', COUNT(*) FROM didimdol_collection_db.process_visualizations
UNION ALL
SELECT 'source_table_counts', 'daily_statistics', COUNT(*) FROM didimdol_collection_db.daily_statistics;
