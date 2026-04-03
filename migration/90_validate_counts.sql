SELECT 'ingest_backend_db' AS target_db, 'az_events' AS table_name,
  (SELECT COUNT(*) FROM didimdol_collection_db.az_events) AS source_count,
  (SELECT COUNT(*) FROM ingest_backend_db.az_events) AS target_count
UNION ALL
SELECT 'ingest_backend_db', 'sessions',
  (SELECT COUNT(*) FROM didimdol_collection_db.sessions),
  (SELECT COUNT(*) FROM ingest_backend_db.sessions)
UNION ALL
SELECT 'ingest_backend_db', 'steps',
  (SELECT COUNT(*) FROM didimdol_collection_db.steps),
  (SELECT COUNT(*) FROM ingest_backend_db.steps)
UNION ALL
SELECT 'ingest_backend_db', 'tasks',
  (SELECT COUNT(*) FROM didimdol_collection_db.tasks),
  (SELECT COUNT(*) FROM ingest_backend_db.tasks)
UNION ALL
SELECT 'ingest_backend_db', 'events',
  (SELECT COUNT(*) FROM didimdol_collection_db.events),
  (SELECT COUNT(*) FROM ingest_backend_db.events)
UNION ALL
SELECT 'ingest_backend_db', 'snapshots',
  (SELECT COUNT(*) FROM didimdol_collection_db.snapshots),
  (SELECT COUNT(*) FROM ingest_backend_db.snapshots)
UNION ALL
SELECT 'flows_ml_db', 'steps',
  (SELECT COUNT(*) FROM didimdol_collection_db.steps),
  (SELECT COUNT(*) FROM flows_ml_db.steps)
UNION ALL
SELECT 'flows_ml_db', 'actions',
  (SELECT COUNT(*) FROM didimdol_collection_db.actions),
  (SELECT COUNT(*) FROM flows_ml_db.actions)
UNION ALL
SELECT 'flows_ml_db', 'data_patterns',
  (SELECT COUNT(*) FROM didimdol_collection_db.data_patterns),
  (SELECT COUNT(*) FROM flows_ml_db.data_patterns)
UNION ALL
SELECT 'flows_ml_db', 'element_profiles',
  (SELECT COUNT(*) FROM didimdol_collection_db.element_profiles),
  (SELECT COUNT(*) FROM flows_ml_db.element_profiles)
UNION ALL
SELECT 'flows_ml_db', 'processes',
  (SELECT COUNT(*) FROM didimdol_collection_db.processes),
  (SELECT COUNT(*) FROM flows_ml_db.processes)
UNION ALL
SELECT 'flows_ml_db', 'flows',
  (SELECT COUNT(*) FROM didimdol_collection_db.flows),
  (SELECT COUNT(*) FROM flows_ml_db.flows)
UNION ALL
SELECT 'flows_ml_db', 'etl_state',
  (SELECT COUNT(*) FROM didimdol_collection_db.etl_state),
  (SELECT COUNT(*) FROM flows_ml_db.etl_state)
UNION ALL
SELECT 'flows_ml_db', 'event_log',
  (SELECT COUNT(*) FROM didimdol_collection_db.event_log),
  (SELECT COUNT(*) FROM flows_ml_db.event_log)
UNION ALL
SELECT 'flows_ml_db', 'cases',
  (SELECT COUNT(*) FROM didimdol_collection_db.cases),
  (SELECT COUNT(*) FROM flows_ml_db.cases)
UNION ALL
SELECT 'flows_ml_db', 'process_models',
  (SELECT COUNT(*) FROM didimdol_collection_db.process_models),
  (SELECT COUNT(*) FROM flows_ml_db.process_models)
UNION ALL
SELECT 'flows_ml_db', 'process_nodes',
  (SELECT COUNT(*) FROM didimdol_collection_db.process_nodes),
  (SELECT COUNT(*) FROM flows_ml_db.process_nodes)
UNION ALL
SELECT 'flows_ml_db', 'process_edges',
  (SELECT COUNT(*) FROM didimdol_collection_db.process_edges),
  (SELECT COUNT(*) FROM flows_ml_db.process_edges)
UNION ALL
SELECT 'flows_ml_db', 'anomalies',
  (SELECT COUNT(*) FROM didimdol_collection_db.anomalies),
  (SELECT COUNT(*) FROM flows_ml_db.anomalies)
UNION ALL
SELECT 'visualization_frontend_db', 'admin_users',
  (SELECT COUNT(*) FROM didimdol_collection_db.admin_users),
  (SELECT COUNT(*) FROM visualization_frontend_db.admin_users)
UNION ALL
SELECT 'visualization_frontend_db', 'process_visualizations',
  (SELECT COUNT(*) FROM didimdol_collection_db.process_visualizations),
  (SELECT COUNT(*) FROM visualization_frontend_db.process_visualizations)
UNION ALL
SELECT 'visualization_frontend_db', 'daily_statistics',
  (SELECT COUNT(*) FROM didimdol_collection_db.daily_statistics),
  (SELECT COUNT(*) FROM visualization_frontend_db.daily_statistics);

SELECT 'orphan_tasks' AS check_name, COUNT(*) AS issue_count
FROM ingest_backend_db.tasks t
LEFT JOIN ingest_backend_db.sessions s ON s.id = t.session_id
WHERE s.id IS NULL;

SELECT 'orphan_events_by_task' AS check_name, COUNT(*) AS issue_count
FROM ingest_backend_db.events e
LEFT JOIN ingest_backend_db.tasks t ON t.id = e.task_id
WHERE e.task_id IS NOT NULL AND t.id IS NULL;

SELECT 'orphan_snapshots' AS check_name, COUNT(*) AS issue_count
FROM ingest_backend_db.snapshots s
LEFT JOIN ingest_backend_db.events e ON e.id = s.event_id
WHERE e.id IS NULL;

SELECT 'orphan_cases_by_task' AS check_name, COUNT(*) AS issue_count
FROM flows_ml_db.cases c
LEFT JOIN ingest_backend_db.tasks t ON t.id = c.task_id
WHERE t.id IS NULL;
