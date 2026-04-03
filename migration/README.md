migration

- Purpose: copy data from `didimdol_collection_db` into split target databases
- Source DB: `didimdol_collection_db`
- Target DBs:
  - `ingest_backend_db`
  - `flows_ml_db`
  - `visualization_frontend_db`
- Assumption: target schema from `target_schema/init-all-databases.sql` is already applied
- Important:
  - run `10_precheck.sql` first
  - `events` maps missing workflow-related columns to NULL
  - `steps` is copied into both `ingest_backend_db.steps` and `flows_ml_db.steps`
