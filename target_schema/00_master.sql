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
