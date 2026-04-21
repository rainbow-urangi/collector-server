CREATE TABLE IF NOT EXISTS identity_tenant_counter (
  tenant_id VARCHAR(128) NOT NULL,
  last_user_no INT UNSIGNED NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS identity_actor_map (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id VARCHAR(128) NOT NULL,
  tenant_user_no INT UNSIGNED NULL,
  actor_id VARCHAR(67) NOT NULL,
  account_id VARCHAR(67) NOT NULL,
  device_hash VARCHAR(67) DEFAULT NULL,
  ip_hash VARCHAR(67) DEFAULT NULL,
  identity_basis ENUM('login_device', 'login_ip') NOT NULL,
  first_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  last_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_actor (tenant_id, actor_id),
  UNIQUE KEY uk_tenant_user_no (tenant_id, tenant_user_no),
  KEY idx_tenant_account (tenant_id, account_id),
  KEY idx_pending_alias (tenant_user_no, tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;