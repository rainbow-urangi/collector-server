// server.js — Direct ingest to 4 tables + compat dual-write to az_events (no event_id)
"use strict";
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const pino = require("pino");
const mariadb = require("mariadb");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const crypto = require("crypto");

const app = express();
const log = pino({ level: "info" });

app.set("trust proxy", process.env.TRUST_PROXY === "1");
app.use(helmet());
const corsOptions = {
  origin: (origin, cb) => cb(null, true), // 초기 수집 단계: 모든 Origin 허용
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-api-key"],
  maxAge: 86400,
};
app.use(cors(corsOptions));
app.options("/ingest/batch", cors(corsOptions));
app.use(express.json({ limit: "32mb" })); // 스냅샷 포함 대용량 본문 허용

// ───────────────────── DB Pool ─────────────────────
const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
});

// ───────────────────── 보안/리밋 ─────────────────────
const limiter = new RateLimiterMemory({ points: 200, duration: 60 });
function requireApiKey(req, res, next) {
  const k = req.get("x-api-key");
  if (!k || k !== process.env.API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}
app.use(async (req, res, next) => {
  try {
    await limiter.consume(req.ip);
    next();
  } catch {
    res.status(429).json({ error: "rate_limited" });
  }
});

// ───────────────────── 유틸 ─────────────────────
const TASK_NAME = process.env.TASK_NAME || "SessionFlow";
const SAFE = (s) => (typeof s === "string" && s.trim() ? s.trim() : null);
const toUInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};
const safeJSON = (v) => {
  try {
    return typeof v === "string" ? JSON.parse(v) : v || null;
  } catch {
    return null;
  }
};
const hostOf = (u) => { try { return new URL(u).host; } catch { return null; } };
const pathOf = (u) => { try { return new URL(u).pathname || "/"; } catch { return null; } };
const isKnownUserId = (v) => { const s = SAFE(v); return !!(s && s.toLowerCase() !== "unknown"); };
const betterUserId = (prev, next) => {
  const p = SAFE(prev), n = SAFE(next);
  if (!n || n.toLowerCase() === "unknown") return p || null;
  if (!p || p.toLowerCase() === "unknown") return n;
  return p;
};
const parseTenantId = (req, row) =>
  SAFE(row?.AZ_tenant_id) ||
  SAFE(req.get("x-az-tenant")) ||
  SAFE(req.get("x-tenant-id")) ||
  SAFE(req.get("x-tenant")) ||
  null;

// 길이 클램프 & 정규화
const MAXLEN = {
  api_path: Number(process.env.API_PATH_MAX || 1024), // 필요시 .env로 조절
  page_url: 2048,
  target_selector: 2048,
};
function clampStr(s, n) { if (s == null) return null; s = String(s); return s.length > n ? s.slice(0, n) : s; }
function normalizeApiPath(v) {
  if (!v) return null;
  try { if (typeof v === "string" && v.startsWith("http")) return clampStr(new URL(v).pathname || "/", MAXLEN.api_path); }
  catch {}
  const onlyPath = String(v).split("?")[0].split("#")[0] || "/";
  return clampStr(onlyPath, MAXLEN.api_path);
}
function toApiStatus(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).match(/\d+/);
  if (!m) return null;
  const i = parseInt(m[0], 10);
  if (!Number.isFinite(i) || i < 0 || i > 65535) return null;
  return i;
}

// 한 행 보강
function enrichRow(row, clientIp, tenantId) {
  const r = { ...row };

  // 서버 관측 IP
  if (!r.AZ_ip_address || r.AZ_ip_address === "(unavailable-in-extension)") r.AZ_ip_address = clientIp || null;

  // 테넌트
  r._tenant_id = r._tenant_id ?? tenantId ?? null;

  // URL 파생
  r.AZ_url_host = r.AZ_url_host || hostOf(r.AZ_url);
  r.AZ_url_path = r.AZ_url_path || pathOf(r.AZ_url);
  r.AZ_api_host = r.AZ_api_host || hostOf(r.AZ_api_url);

  // locators_json → session/env/a11y
  const L = safeJSON(r.AZ_locators_json);
  if (L?.session) {
    r.AZ_session_install_id  = r.AZ_session_install_id  ?? L.session.install_id ?? null;
    r.AZ_session_browser_id  = r.AZ_session_browser_id  ?? L.session.browser_session_id ?? null;
    r.AZ_session_tab_id      = r.AZ_session_tab_id      ?? toUInt(L.session.tab_id);
    r.AZ_session_page_id     = r.AZ_session_page_id     ?? L.session.page_session_id ?? null;
  }
  if (L?.env) {
    r.AZ_viewport_w = r.AZ_viewport_w ?? toUInt(L.env.vw);
    r.AZ_viewport_h = r.AZ_viewport_h ?? toUInt(L.env.vh);
  }
  if (L?.a11y) {
    r.AZ_a11y_role       = r.AZ_a11y_role       ?? L.a11y.role ?? null;
    r.AZ_aria_label      = r.AZ_aria_label      ?? L.a11y.ariaLabel ?? null;
    r.AZ_aria_labelledby = r.AZ_aria_labelledby ?? L.a11y.ariaLabelledby ?? null;
  }

  // 이벤트 의미 기본치
  if (!r.AZ_event_action) {
    if (r.AZ_element_type === "menu") r.AZ_event_action = "menu_click";
    else if (r.AZ_element_type === "event") r.AZ_event_action = "event";
    else if (r.AZ_element_type === "state") r.AZ_event_action = "post_state";
    else r.AZ_event_action = "change";
  }

  // 메뉴 trail → section/item
  const trail = safeJSON(r.AZ_menu_li_trail);
  if (Array.isArray(trail) && trail.length) {
    r.AZ_menu_section = r.AZ_menu_section ?? String(trail[0]).slice(0, 255);
    if (trail.length >= 2) r.AZ_menu_item = r.AZ_menu_item ?? String(trail[1]).slice(0, 255);
  }

  // 입력 길이
  if (r.AZ_input_length == null && typeof r.AZ_data === "string" &&
      !["event", "menu", "state"].includes(r.AZ_element_type || "")) {
    r.AZ_input_length = r.AZ_data.length;
  }

  // 스냅샷(3경로 수용: AZ_snapshot_* / snapshot.* / AZ_dom_*)
  const snap = (r.snapshot && typeof r.snapshot === "object") ? r.snapshot : null;
  r._snap_dom_before = r.AZ_snapshot_dom_before ?? r.AZ_dom_before ?? snap?.dom_before ?? null;
  r._snap_dom_after  = r.AZ_snapshot_dom_after  ?? r.AZ_dom_after  ?? snap?.dom_after  ?? null;
  r._snap_api_body   = r.AZ_snapshot_api_response_body ?? r.AZ_api_response_body ?? snap?.api_response_body ?? null;

  r.AZ_api_status = toApiStatus(r.AZ_api_status);
  return r;
}

// events INSERT 튜플
function toEventTuple(r, taskId) {
  const event_type =
    r.AZ_event_action === "page_view" || r.AZ_element_type === "page"
      ? "PAGE_VIEW" : "DOM_EVENT";

  // 의미 보존(특히 submit)
  let interaction_type = "change";
  if (r.AZ_event_action === "menu_click") interaction_type = "menu_click";
  else if (r.AZ_element_type === "menu") interaction_type = "click";
  else if (r.AZ_event_action === "submit") interaction_type = "submit";
  else if (r.AZ_event_action === "event") interaction_type = r.AZ_event_subtype || "event";
  else if (r.AZ_event_action === "route_change") interaction_type = "spa";
  else if (r.AZ_event_action === "post_state") interaction_type = "state";

  const input_data = ["event","menu","state"].includes(r.AZ_element_type || "") ? null : r.AZ_data;

  // api_path는 항상 pathname만 사용(우선: AZ_api_path → AZ_api_url)
  let api_path_raw = r.AZ_api_path ?? null;
  if (!api_path_raw) api_path_raw = r.AZ_api_url ? pathOf(r.AZ_api_url) : null;
  else api_path_raw = normalizeApiPath(api_path_raw);
  const api_path = normalizeApiPath(api_path_raw);

  return [
    taskId,
    r.AZ_event_time,
    event_type,
    clampStr(r.AZ_url, MAXLEN.page_url),
    clampStr(r.AZ_element_uid, MAXLEN.target_selector),
    interaction_type,
    input_data,
    api_path,
    r.AZ_api_method || null,
    toApiStatus(r.AZ_api_status),
  ];
}

// 세션 upsert용 집계
function batchAggregateSessions(rows) {
  const map = new Map(); // sid -> {user_id, tenant_id, start, end, ua, viewport, ip}
  for (const r of rows) {
    const sid = SAFE(r.AZ_session_page_id);
    if (!sid) continue;

    const cur = map.get(sid) || {
      user_id: SAFE(r.AZ_login_id) || "unknown",
      tenant_id: r._tenant_id || null,
      start: r.AZ_event_time,
      end: r.AZ_event_time,
      ua: null, viewport: null, ip: null,
    };

    if (r.AZ_event_time < cur.start) cur.start = r.AZ_event_time;
    if (r.AZ_event_time > cur.end)   cur.end   = r.AZ_event_time;

    cur.user_id   = betterUserId(cur.user_id, r.AZ_login_id);
    cur.tenant_id = cur.tenant_id || r._tenant_id || null;

    if (!cur.ua) {
      const L = safeJSON(r.AZ_locators_json);
      const ua = SAFE(L?.env?.ua); if (ua) cur.ua = ua;
    }
    if (!cur.viewport && (r.AZ_viewport_w || r.AZ_viewport_h)) {
      const w = toUInt(r.AZ_viewport_w), h = toUInt(r.AZ_viewport_h);
      if (w && h) cur.viewport = `${w}x${h}`;
    }
    if (!cur.ip && SAFE(r.AZ_ip_address)) cur.ip = r.AZ_ip_address;

    map.set(sid, cur);
  }
  return map;
}

async function ensureTasks(conn, sessionIds) {
  if (!sessionIds.length) return;
  const placeholders = sessionIds.map(() => "(?, ?, 'IN_PROGRESS', ?, NULL, NULL)").join(",");
  const now = new Date();
  const params = [];
  for (const sid of sessionIds) params.push(sid, TASK_NAME, now);
  await conn.query(
    `INSERT INTO tasks (session_id, task_name, status, start_time, end_time, duration_ms)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE task_name=task_name`,
    params
  );
}

// 세션ID 해석/생성
async function resolveOrCreateSession(conn, r) {
  if (SAFE(r.AZ_session_page_id)) return r.AZ_session_page_id;         // 1) page_session_id
  const L = safeJSON(r.AZ_locators_json);                               // 2) locators_json
  const sid2 = SAFE(L?.session?.page_session_id);
  if (sid2) { r.AZ_session_page_id = sid2; return sid2; }

  if (isKnownUserId(r.AZ_login_id)) {                                   // 3) 사용자/시간 귀속
    const [row] = await conn.query(
      `SELECT id FROM sessions
       WHERE user_id = ? AND start_time <= ? AND (end_time IS NULL OR end_time >= ?)
       ORDER BY end_time DESC LIMIT 1`,
      [ r.AZ_login_id.trim(), r.AZ_event_time, r.AZ_event_time ]
    );
    if (row?.id) return row.id;
  }

  // 4) 신규 세션 생성
  const newSid = crypto.randomUUID();
  const ua = SAFE(safeJSON(r.AZ_locators_json)?.env?.ua) || null;
  const w = toUInt(r.AZ_viewport_w), h = toUInt(r.AZ_viewport_h);
  const viewport = (w && h) ? `${w}x${h}` : null;
  const userId = isKnownUserId(r.AZ_login_id) ? r.AZ_login_id.trim() : "unknown";

  await conn.query(
    `INSERT INTO sessions (id, user_id, tenant_id, start_time, end_time, user_agent, viewport_size, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [ newSid, userId, r._tenant_id || null, r.AZ_event_time, r.AZ_event_time, ua, viewport, SAFE(r.AZ_ip_address) || null ]
  );
  return newSid;
}

// ───────────────────── az_events 호환 쓰기(컬럼 = DB 제공 목록 그대로) ─────────────────────
const AZ_WIDE_COLS = [
  "AZ_api_url","AZ_api_method","AZ_api_status","AZ_api_path",
  "AZ_ip_address","AZ_url","AZ_login_id","AZ_event_time",
  "AZ_element_uid","AZ_element_type","AZ_element_label","AZ_data",
  "AZ_frame_path","AZ_shadow_path","AZ_form_selector","AZ_locators_json",
  "AZ_nav_root","AZ_menu_li_trail","AZ_post_hints",
  "AZ_event_action","AZ_event_subtype","AZ_page_title","AZ_referrer",
  "AZ_viewport_w","AZ_viewport_h","AZ_url_host","AZ_url_path",
  "AZ_api_host","AZ_api_latency_ms",
  "AZ_session_install_id","AZ_session_browser_id","AZ_session_tab_id","AZ_session_page_id",
  "AZ_selector_css","AZ_selector_xpath","AZ_element_tag","AZ_a11y_role","AZ_aria_label","AZ_aria_labelledby",
  "AZ_form_name","AZ_form_action","AZ_data_testid","AZ_input_length","AZ_is_sensitive",
  "AZ_key","AZ_key_mods","AZ_menu_section","AZ_menu_item","AZ_route_from","AZ_route_to"
];

async function insertAzWide(conn, r) {
  const cols = [...AZ_WIDE_COLS];
  const qs = cols.map(() => "?").join(",");
  const vals = cols.map(k => (r[k] ?? null));
  await conn.query(`INSERT INTO az_events (${cols.join(",")}) VALUES (${qs})`, vals);
}

// ───────────────────── 한 배치 처리 ─────────────────────
async function processBatch(rows, clientIp, tenantId) {
  if (!rows.length) return { inserted: 0, snapshots: 0 };

  // 0) 보강
  const norm = rows.map((r) => enrichRow(r, clientIp, tenantId));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) 세션 upsert (세션ID 있는 것만)
    const sessAgg = batchAggregateSessions(norm);
    if (sessAgg.size) {
      const values = []; const ph = [];
      for (const [sid, s] of sessAgg.entries()) {
        ph.push("(?, ?, ?, ?, ?, ?, ?, ?)");
        values.push(sid, s.user_id, s.tenant_id, s.start, s.end, s.ua, s.viewport, s.ip);
      }
      await conn.query(
        `INSERT INTO sessions (id, user_id, tenant_id, start_time, end_time, user_agent, viewport_size, ip_address)
         VALUES ${ph.join(",")}
         ON DUPLICATE KEY UPDATE
           start_time    = LEAST(start_time, VALUES(start_time)),
           end_time      = GREATEST(COALESCE(end_time, '1000-01-01'), VALUES(end_time)),
           user_agent    = COALESCE(sessions.user_agent, VALUES(user_agent)),
           viewport_size = COALESCE(sessions.viewport_size, VALUES(viewport_size)),
           ip_address    = COALESCE(sessions.ip_address, VALUES(ip_address)),
           tenant_id     = COALESCE(sessions.tenant_id, VALUES(tenant_id)),
           user_id       = CASE
                             WHEN (sessions.user_id IS NULL OR sessions.user_id='' OR LOWER(sessions.user_id)='unknown')
                                  AND (VALUES(user_id) IS NOT NULL AND VALUES(user_id)<>'' AND LOWER(VALUES(user_id))<>'unknown')
                             THEN VALUES(user_id)
                             ELSE sessions.user_id
                           END`,
        values
      );
    }

    // 2) 태스크 보장
    await ensureTasks(conn, Array.from(sessAgg.keys()));

    // 3) 각 행 처리
    const taskIdCache = new Map(); // sid -> taskId
    const perTaskMin = new Map(), perTaskMax = new Map();
    let totalEvents = 0, totalSnaps = 0;

    for (const r of norm) {
      // 세션ID
      const sid = await resolveOrCreateSession(conn, r);

      // 로그인ID 승격(최후 보루)
      if (isKnownUserId(r.AZ_login_id)) {
        await conn.query(
          `UPDATE sessions
             SET user_id = ?
           WHERE id = ?
             AND (user_id IS NULL OR user_id='' OR LOWER(user_id)='unknown')`,
          [ r.AZ_login_id.trim(), sid ]
        );
      }

      // 태스크 확보
      let taskId = taskIdCache.get(sid);
      if (!taskId) {
        const [row] = await conn.query(
          `SELECT id FROM tasks WHERE session_id=? AND task_name=? LIMIT 1`,
          [ sid, TASK_NAME ]
        );
        if (row?.id) taskId = row.id;
        else {
          const res = await conn.query(
            `INSERT INTO tasks (session_id, task_name, status, start_time)
             VALUES (?, ?, 'IN_PROGRESS', ?)`,
            [ sid, TASK_NAME, r.AZ_event_time ]
          );
          taskId = res.insertId;
        }
        taskIdCache.set(sid, taskId);
      }

      // 이벤트 삽입
      const evtTuple = toEventTuple(r, taskId);
      const evtRes = await conn.query(
        `INSERT INTO events
           (task_id, event_time, event_type, page_url, target_selector, interaction_type, input_data,
            api_path, api_method, api_status_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        evtTuple
      );
      totalEvents++;
      const eventId = evtRes.insertId;

      // ★ az_events(와이드)에도 동시 삽입 (event_id 사용하지 않음)
      try { await insertAzWide(conn, r); }
      catch (e) { log.warn({ err: e }, "az_events insert failed"); }

      // 스냅샷 동시 삽입(존재 시)
      if (r._snap_dom_before || r._snap_dom_after || r._snap_api_body) {
        let apiBody = r._snap_api_body;
        if (typeof apiBody === "string") { try { apiBody = JSON.parse(apiBody); } catch {} }
        await conn.query(
          `INSERT INTO snapshots (event_id, dom_before, dom_after, api_response_body)
           VALUES (?, ?, ?, ?)`,
          [ eventId, r._snap_dom_before || null, r._snap_dom_after || null, apiBody ?? null ]
        );
        totalSnaps++;
      }

      // 태스크 시간 범위 누적
      const tMin = perTaskMin.get(taskId);
      const tMax = perTaskMax.get(taskId);
      if (!tMin || r.AZ_event_time < tMin) perTaskMin.set(taskId, r.AZ_event_time);
      if (!tMax || r.AZ_event_time > tMax) perTaskMax.set(taskId, r.AZ_event_time);

      // 세션 start/end 보정
      await conn.query(
        `UPDATE sessions SET
           start_time = LEAST(start_time, ?),
           end_time   = GREATEST(COALESCE(end_time, ?), ?)
         WHERE id=?`,
        [ r.AZ_event_time, r.AZ_event_time, r.AZ_event_time, sid ]
      );
    }

    // 4) 태스크 시간/상태 보정 + duration_ms
    for (const [taskId, maxT] of perTaskMax.entries()) {
      const minT = perTaskMin.get(taskId) || maxT;
      await conn.query(
        `UPDATE tasks
           SET start_time = LEAST(COALESCE(start_time, ?), ?),
               end_time   = GREATEST(COALESCE(end_time, ?), ?),
               status     = 'COMPLETED',
               duration_ms= TIMESTAMPDIFF(MICROSECOND, start_time, end_time)/1000
         WHERE id=?`,
        [ minT, minT, maxT, maxT, taskId ]
      );
    }

    await conn.commit();
    return { inserted: totalEvents, snapshots: totalSnaps };
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

// ───────────────────── 라우트 ─────────────────────
// 확장 SW 바디: { reason, rows: [ AZ_*... (옵션) snapshot:{} ], ts }
app.post("/ingest/batch", requireApiKey, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows?.length) return res.status(400).json({ error: "empty_rows" });

    // 요청자 IP
    const clientIp = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || null;
    const tenantIdPerRow = (r) => parseTenantId(req, r);

    // 수집 허용 키(기존 19 + 추가 31 + 스냅샷 pass-through)
    const ALL_50 = [
      // 기존 19
      "AZ_api_url","AZ_api_method","AZ_api_status","AZ_api_path",
      "AZ_ip_address","AZ_url","AZ_login_id","AZ_event_time",
      "AZ_element_uid","AZ_element_type","AZ_element_label","AZ_data",
      "AZ_frame_path","AZ_shadow_path","AZ_form_selector",
      "AZ_locators_json","AZ_nav_root","AZ_menu_li_trail","AZ_post_hints",
      // 추가 31
      "AZ_event_action","AZ_event_subtype","AZ_page_title","AZ_referrer",
      "AZ_viewport_w","AZ_viewport_h","AZ_url_host","AZ_url_path",
      "AZ_api_host","AZ_api_latency_ms",
      "AZ_session_install_id","AZ_session_browser_id","AZ_session_tab_id","AZ_session_page_id",
      "AZ_selector_css","AZ_selector_xpath","AZ_element_tag",
      "AZ_a11y_role","AZ_aria_label","AZ_aria_labelledby",
      "AZ_form_name","AZ_form_action","AZ_data_testid","AZ_input_length","AZ_is_sensitive",
      "AZ_key","AZ_key_mods","AZ_menu_section","AZ_menu_item","AZ_route_from","AZ_route_to",
      // 테넌트 + 스냅샷 pass-through
      "AZ_tenant_id",
      "AZ_snapshot_dom_before","AZ_snapshot_dom_after","AZ_snapshot_api_response_body","snapshot",
      "AZ_dom_before","AZ_dom_after","AZ_api_response_body"
    ];

    const filled = rows.map((r) => {
      const o = {}; for (const k of ALL_50) o[k] = Object.prototype.hasOwnProperty.call(r, k) ? r[k] : null;
      o._tenant_id = tenantIdPerRow(r); // per-row tenant
      return o;
    });

    const result = await processBatch(filled, clientIp, null);
    res.json({ ok: true, inserted_events: result.inserted, inserted_snapshots: result.snapshots });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

app.get("/healthz", (req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT || 8080);
app.listen(port, () => log.info(`direct ingest listening :${port}`));
