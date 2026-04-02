target_schema

- Baseline: didimdol_collection_test_db schema
- Added from didimdol_collection_db: cases table
- Split target:
  - 00_master.sql
  - 10_ingest_backend_schema.sql
  - 20_flow_ml_schema.sql
  - 30_visualization_frontend_schema.sql
  - 99_bootstrap.sql
- Note: collector-server/ci/init-mariadb.sql remains a smoke-test schema and is not replaced by these files
