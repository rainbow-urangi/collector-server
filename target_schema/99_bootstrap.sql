-- Run from repository root.
-- Example:
-- mysql -u root -p < prod_db/target_schema/99_bootstrap.sql

SOURCE ./prod_db/target_schema/00_master.sql;
SOURCE ./prod_db/target_schema/10_ingest_backend_schema.sql;
SOURCE ./prod_db/target_schema/20_flow_ml_schema.sql;
SOURCE ./prod_db/target_schema/30_visualization_frontend_schema.sql;
