"use strict";

const crypto = require("crypto");

const safe = (s) => (typeof s === "string" && s.trim() ? s.trim() : null);

function isKnownUserId(v) {
  const s = safe(v);
  if (!s || s.toLowerCase() === "unknown") return false;
  if (/[\r\n\t]/.test(s)) return false;
  if (/^\d{4}[-./]\d{2}[-./]\d{2}$/.test(s)) return false;
  if (/^\d{4}[-./]\d{2}[-./]\d{2}\s*-\s*\d{4}[-./]\d{2}[-./]\d{2}$/.test(s)) return false;
  return true;
}

function normalizeLoginId(v) {
  const s = safe(v);
  if (!isKnownUserId(s)) return null;
  return s.normalize("NFKC").trim().toLowerCase();
}

function normalizeIp(v) {
  const s = safe(v);
  if (!s) return null;
  return s.replace(/^::ffff:/i, "");
}

function hmacId(secret, scope, tenantId, value) {
  const tenant = safe(tenantId) || "__NO_TENANT__";
  const raw = safe(value);
  if (!raw) return null;

  return `${crypto
    .createHmac("sha256", secret)
    .update(`${scope}:${tenant}:${raw}`)
    .digest("hex")}`;
}

function computeIdentity(row, secret) {
  const tenantId = safe(row?._tenant_id) || "__NO_TENANT__";
  const loginId = normalizeLoginId(row?.AZ_login_id);
  if (!loginId) return null;

  const installId = safe(row?.AZ_session_install_id);
  const browserId = safe(row?.AZ_session_browser_id);
  const ip = normalizeIp(row?.AZ_ip_address);

  const deviceSeed = installId
    ? `install:${installId}`
    : browserId
      ? `browser:${browserId}`
      : ip
        ? `ip:${ip}`
        : null;

  if (!deviceSeed) return null;

  return {
    tenantId,
    accountId: hmacId(secret, "account", tenantId, loginId),
    actorId: hmacId(secret, "actor", tenantId, `${loginId}:${deviceSeed}`),
    deviceHash: hmacId(secret, "device", tenantId, deviceSeed),
    ipHash: ip ? hmacId(secret, "ip", tenantId, ip) : null,
    identityBasis: deviceSeed.startsWith("ip:") ? "login_ip" : "login_device",
  };
}

function applyIdentity(row, secret) {
  const identity = computeIdentity(row, secret);

  row._account_id = identity?.accountId || null;
  row._actor_id = identity?.actorId || null;
  row._device_hash = identity?.deviceHash || null;
  row._ip_hash = identity?.ipHash || null;
  row._identity_basis = identity?.identityBasis || null;

  // 기존 세션 처리 흐름을 유지하기 위해 AZ_login_id 의미만 actor_id로 바꾼다.
  row.AZ_login_id = identity?.actorId || "unknown";
  return row;
}

async function upsertIdentitySeeds(conn, rows, logger = console) {
  const dedup = new Map();

  for (const r of rows) {
    const tenantId = safe(r._tenant_id) || "__NO_TENANT__";
    const actorId = safe(r._actor_id);
    if (!actorId) continue;

    const key = `${tenantId}::${actorId}`;
    const cur = dedup.get(key) || {
      tenantId,
      actorId,
      accountId: null,
      deviceHash: null,
      ipHash: null,
      identityBasis: null,
    };

    cur.accountId = cur.accountId || safe(r._account_id);
    cur.deviceHash = cur.deviceHash || safe(r._device_hash);
    cur.ipHash = cur.ipHash || safe(r._ip_hash);
    cur.identityBasis = cur.identityBasis || safe(r._identity_basis) || "login_ip";

    dedup.set(key, cur);
  }

  if (!dedup.size) return;

  const placeholders = [];
  const values = [];

  for (const item of dedup.values()) {
    placeholders.push("(?, ?, ?, ?, ?, ?)");
    values.push(
      item.tenantId,
      item.actorId,
      item.accountId,
      item.deviceHash,
      item.ipHash,
      item.identityBasis
    );
  }

  try {
    await conn.query(
      `INSERT INTO identity_actor_map
          (tenant_id, actor_id, account_id, device_hash, ip_hash, identity_basis)
        VALUES ${placeholders.join(",")}
        ON DUPLICATE KEY UPDATE
          last_seen_at = CURRENT_TIMESTAMP(6),
          account_id = COALESCE(VALUES(account_id), identity_actor_map.account_id),
          device_hash = COALESCE(VALUES(device_hash), identity_actor_map.device_hash),
          ip_hash = COALESCE(VALUES(ip_hash), identity_actor_map.ip_hash),
          identity_basis = COALESCE(VALUES(identity_basis), identity_actor_map.identity_basis)`,
      values
    );
  } catch (err) {
    if (err && (err.errno === 1146 || err.code === "ER_NO_SUCH_TABLE")) {
      if (typeof logger.warn === "function") {
        logger.warn({ err }, "identity_tables_missing_skip");
      }
      return;
    }
    throw err;
  }
}

function tenantLockName(tenantId) {
  const digest = crypto.createHash("sha1").update(String(tenantId)).digest("hex");
  return `identity_alias_${digest}`;
}

async function withTenantLock(conn, tenantId, fn) {
  const lockName = tenantLockName(tenantId);
  const rows = await conn.query(`SELECT GET_LOCK(?, 5) AS locked`, [lockName]);
  if (!Number(rows?.[0]?.locked)) {
    throw new Error(`failed_to_acquire_identity_lock:${tenantId}`);
  }

  try {
    return await fn();
  } finally {
    try {
      await conn.query(`SELECT RELEASE_LOCK(?) AS released`, [lockName]);
    } catch (_) {
      // lock release failure is non-fatal here
    }
  }
}

async function allocatePendingForTenant(pool, tenantId, limit = 200) {
  const conn = await pool.getConnection();

  try {
    return await withTenantLock(conn, tenantId, async () => {
      await conn.beginTransaction();

      try {
        await conn.query(
          `INSERT INTO identity_tenant_counter (tenant_id, last_user_no)
           VALUES (?, 0)
           ON DUPLICATE KEY UPDATE tenant_id = tenant_id`,
          [tenantId]
        );

        const counterRows = await conn.query(
          `SELECT last_user_no
             FROM identity_tenant_counter
            WHERE tenant_id = ?
            FOR UPDATE`,
          [tenantId]
        );

        let nextUserNo = Number(counterRows?.[0]?.last_user_no || 0);

        const pendingRows = await conn.query(
          `SELECT id
             FROM identity_actor_map
            WHERE tenant_id = ?
              AND tenant_user_no IS NULL
            ORDER BY id
            LIMIT ?
            FOR UPDATE`,
          [tenantId, limit]
        );

        if (!pendingRows.length) {
          await conn.rollback();
          return 0;
        }

        const cases = [];
        const caseParams = [];
        const ids = [];

        for (const row of pendingRows) {
          nextUserNo += 1;
          cases.push("WHEN ? THEN ?");
          caseParams.push(row.id, nextUserNo);
          ids.push(row.id);
        }

        await conn.query(
          `UPDATE identity_actor_map
              SET tenant_user_no = CASE id ${cases.join(" ")} END
            WHERE id IN (${ids.map(() => "?").join(",")})
              AND tenant_user_no IS NULL`,
          [...caseParams, ...ids]
        );

        await conn.query(
          `UPDATE identity_tenant_counter
              SET last_user_no = ?, updated_at = CURRENT_TIMESTAMP(6)
            WHERE tenant_id = ?`,
          [nextUserNo, tenantId]
        );

        await conn.commit();
        return pendingRows.length;
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    });
  } finally {
    conn.release();
  }
}

async function runIdentityAllocatorOnce(pool, logger = console, opts = {}) {
  const tenantScanLimit = Number(opts.tenantScanLimit || 20);
  const batchLimit = Number(opts.batchLimit || 200);

  const conn = await pool.getConnection();
  try {
    const tenants = await conn.query(
      `SELECT tenant_id
         FROM identity_actor_map
        WHERE tenant_user_no IS NULL
        GROUP BY tenant_id
        ORDER BY MIN(id)
        LIMIT ?`,
      [tenantScanLimit]
    );

    for (const row of tenants) {
      const tenantId = safe(row.tenant_id) || "__NO_TENANT__";
      await allocatePendingForTenant(pool, tenantId, batchLimit);
    }
  } catch (err) {
    if (err && (err.errno === 1146 || err.code === "ER_NO_SUCH_TABLE")) {
      if (typeof logger.warn === "function") {
        logger.warn({ err }, "identity_allocator_tables_missing_skip");
      }
      return;
    }
    throw err;
  } finally {
    conn.release();
  }
}

function startIdentityAllocator(pool, logger = console, opts = {}) {
  const intervalMs = Number(opts.intervalMs || 3000);
  const tenantScanLimit = Number(opts.tenantScanLimit || 20);
  const batchLimit = Number(opts.batchLimit || 200);

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runIdentityAllocatorOnce(pool, logger, {
        tenantScanLimit,
        batchLimit,
      });
    } catch (err) {
      if (typeof logger.error === "function") {
        logger.error({ err }, "identity_allocator_failed");
      }
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  if (typeof timer.unref === "function") timer.unref();
  void tick();

  return () => clearInterval(timer);
}

module.exports = {
  applyIdentity,
  upsertIdentitySeeds,
  runIdentityAllocatorOnce,
  startIdentityAllocator,
};
