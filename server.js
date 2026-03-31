/**
 * server_annotated.js
 * ------------------
 * Rainbow Recorder 백엔드 서버 (직접 AZ_* 이벤트 ingest)
 * MariaDB에 sessions, tasks, events, snapshots 테이블로 바로 적재
 *
 */

"use strict"; // 문법을 더 엄격하게 체크해서 버그 방지

// ───────────────── 환경 변수 및 라이브러리 ─────────────────
require("dotenv").config(); // env 파일 로드 (config 설정을 불러오는 함수)

// require 모듈 로드 (require 모듈을 불러오는 node 내장 함수)
const express = require("express"); // express 모듈 로드
const helmet = require("helmet"); // HTTP 보안 헤더를 자동으로 설정해주는 라이브러리
const cors = require("cors"); // 다른 도메인에서 이 서버에 접근할 수 있게 허용하는 라이브러리
const pino = require("pino"); // 빠른 로그 기록 라이브러리
//const mariadb = require("mariadb"); // mariadb 모듈 로드
const crypto = require("crypto"); // 암호화, 랜덤 값 생성 등을 하는 node 내장 라이브러리
const { RateLimiterMemory } = require("rate-limiter-flexible"); // rate-limiter-flexible 요청 횟수 제한 라이브러리
// rate-limiter-flexible에서 RateLimiterMemory 모듈만 불러옴

// ───────────────── Express 앱 설정 ─────────────────
const app = express(); // 웹 서버 객체 생성(express)
const log = pino({ level: "info" }); // pino 로그 기록 생성 ("info" 정보 수준 이상의 로그만 기록 )

app.set("trust proxy", process.env.TRUST_PROXY === "1"); // express 설정을 변경
// 프록시 서버 사용 여부 설정 (프록시 서버 사용 시 클라이언트 IP 추적 가능)
app.use(helmet()); // 미들웨어를 추가하는 메서드(HTTP 헤더 자동 보안 설정)
const corsOptions = { // cors 옵션 설정
  origin: (origin, cb) => cb(null, true), // 모든 Origin 허용(초기 수집 단계)
  methods: ["GET", "POST", "OPTIONS"], // 허용된 HTTP 메서드
  allowedHeaders: ["Content-Type", "x-api-key"], // 허용된 헤더
  maxAge: 86400, // CORS 설정을 브라우저가 캐시할 시간 (초 단위)
};
app.use(cors(corsOptions)); // corsOptions 적용
app.options("/ingest/batch", cors(corsOptions)); // 특정 경로에 대한 cors 설정
app.use(express.json({ limit: "32mb" })); // 요청 본문 크기 제한
app.use(express.text({ type: ["text/plain", "application/json"], limit: "32mb" })); // 텍스트 본문 크기 제한

// ───────────────────── DB Pool ─────────────────────
let pool;
const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
};

// actor 별 워크플로우 상태 캐시
const actorCache = new Map();

// 캐시 메모리 정리 스케줄러
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, val] of actorCache) {
    if (val.accessedAt < cutoff) actorCache.delete(key);
  }
}, 60 * 60 * 1000);

// ───────────────────── 보안/리밋 ─────────────────────
const limiter = new RateLimiterMemory({ points: 200, duration: 60 }); // duration초(60초)동안 points(200)번 요청 가능
/*
CHANGE NOTE: 초기 버전과 code_after 모두 헤더 기반 API 키만 허용했습니다.

LEGACY_FROM_code_after:
function requireApiKey(req, res, next) {
  const k = req.get("x-api-key");
  if (!k || k !== process.env.API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}
현재는 req.query.api_key 도 허용합니다.
변경 이유:
- pagehide/keepalive 류 요청에서 커스텀 헤더 전달이 불안정할 수 있기 때문입니다.
- 보안보다 수집 누락 방지를 우선한 절충입니다.
*/
function requireApiKey(req, res, next) {
  // 창 종료 시 api_key 쿼리 파라미터 사용 가능
  const k = req.get("x-api-key") || req.query.api_key; // 요청 헤더에서 x-api-key 헤더 값 또는 쿼리 파라미터에서 api_key 값 가져옴
  if (!k || k !== process.env.API_KEY) return res.status(401).json({ error: "unauthorized" }); // API_KEY와 일치하지 않으면 401 오류 반환
  next();
}
app.use(async (req, res, next) => {
  try {
    await limiter.consume(req.ip); // 비동기 작업이 종료될 때까지 대기 (limiter.consume 메서드는 요청 횟수를 소비하는 메서드, 제한 초과 시 에러 발생)
    next();
  } catch {
    res.status(429).json({ error: "rate_limited" }); // 429 오류 반환
  }
});

// ───────────────────── 유틸 ─────────────────────
const TASK_NAME = process.env.TASK_NAME || "SessionFlow"; // env 파일 안에 TASK_NAME 가져오거나 없으면 "SessionFlow" 사용

/*
CHANGE NOTE: code_after 와 초기 적재 서버에는 workflow_key/workflow_index 계산 블록 자체가 없었습니다.

현재 추가된 블록의 역할:
- actorKey(login/browser/install/session) 생성
- event_time 기준 정렬
- route_change / idle gap / submit / error-ui 를 workflow 경계로 사용
- 결과를 locators_json.analysis 와 events.workflow_key/index 에 저장

얻는 것:
- 후처리 배치에서 workflow_key 기준 분석 가능
- DB에 원시 이벤트와 분석 힌트를 함께 보존 가능

리스크:
- client AZ_workflow_index를 우선하면 stale index가 살아남을 수 있다.
- workflow는 task보다 의미가 가변적이라 해석 계층으로 다뤄야 한다.
*/
// 사용자 행동 이후 일정 시간 이후 공백일 경우 새 워크플로우로 분리
const WORKFLOW_IDLE_MS = Number(process.env.WORKFLOW_IDLE_MS || 120000);

// 위 idle 시간 계산에 활용되는 사용자 의도 흐름을 대표하는 이벤트 정의
const USER_RELEVANT_ACTIONS = new Set([
  "click",
  "menu_click",
  "change",
  "blur",
  "submit",
  "route_change",
  "contextmenu",
  "dragstart",
  "drop",
  "pointerdown",
  "pointerup",
  "page_close",
]);

// 오류 키워드 정규식 정의
const ERROR_KEYWORD_RE =
  /\b(error|failed|failure|denied|forbidden|exception|timeout|invalid|fatal)\b|오류|실패|에러|경고|잘못|만료/i;


// 안전 문자열
const SAFE = (s) => (typeof s === "string" && s.trim() ? s.trim() : null);

// UInt 변환 (Unsigned Integer 양의 정수)
const toUInt = (v) => {
  const n = Number(v); // 문자열을 숫자로 변환
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null; // 숫자가 유한(isFinite 함수)하고 0 이상이면 소수점 버림
};

// 안전 JSON 파싱
const safeJSON = (v) => {
  try {
    return typeof v === "string" ? JSON.parse(v) : v || null; // 문자열이면 JSON.parse 메서드(객체)로 파싱, 아니면 v 반환
  } catch {
    return null; // 파싱 실패 시 null 반환
  }
};

// 객체 → JSON 문자열
const asJsonString = (v) => {
  if (v == null) return null; // v가 null 또는 undefined 이면 null 반환
  if (typeof v === "string") { // v가 문자열이면 JSON.parse 메서드(객체)로 파싱
    try { JSON.parse(v); return v; } catch { /* fallthrough */ } // 파싱 실패 시 무시(/* fallthrough */)
  }
  try { return JSON.stringify(v); } catch { return null; } // 파싱 실패 시 null 반환
};

// URL에서 호스트(도메인) 추출 함수
const hostOf = (u) => {
  try { return new URL(u).host; } catch { return null; } // URL 객체 생성 실패 시 null 반환
};
//  URL에서 경로(pathname) 추출 함수
const pathOf = (u) => {
  try { return new URL(u).pathname || "/"; } catch { return null; } // URL 객체 생성 실패 시 null 반환
};

// 유효한 사용자 ID인지 확인
const isKnownUserId = (v) => {
  const s = SAFE(v); // SAFE 함수로 문자열 정리
  return !!(s && s.toLowerCase() !== "unknown"); // s가 null 또는 undefined 이거나 "unknown"이 아니면 true 반환
};

// user_id 보강: unknown 대신 새 값 사용
const betterUserId = (prev, next) => {
  const p = SAFE(prev), n = SAFE(next); // prev: 이전 값, next: 새 값 모두 SAFE 함수로 정리
  if (!n || n.toLowerCase() === "unknown") return p || null; // n이 null 또는 undefined 이거나 "unknown"이면 p 반환
  if (!p || p.toLowerCase() === "unknown") return n; // p가 null 또는 undefined 이거나 "unknown"이면 n 반환
  return p; // p 반환
};

// multi-tenant (여러 조직이 하나의 시스템을 공유하도록 지원)
const parseTenantId = (req, row) =>
  SAFE(row?.AZ_tenant_id) ||
  SAFE(req.get("x-az-tenant")) ||
  SAFE(req.get("x-tenant-id")) ||
  SAFE(req.get("x-tenant")) ||
  null;

// 길이 클램프 & 정규화 유틸
const MAXLEN = {
  api_path: Number(process.env.API_PATH_MAX || 1024), // 필요시 .env로 조절, 기본 값 최대 1024
  page_url: 2048,                                     // 스키마와 동일, 페이지 URL 최대 2048자
  target_selector: 2048                               // TEXT지만 방어적 클램프, CSS 선택자 최대 2048자
};

// 문자열 클램프 함수
function clampStr(s, n) {
  if (s == null) return null; // s가 null 또는 undefined 이면 null 반환
  s = String(s); // s를 문자열로 변환
  return s.length > n ? s.slice(0, n) : s; // s의 길이가 n보다 크면 s의 처음 n자리를 반환, 아니면 s 반환
}

// 'http...' 또는 '/path?query#frag' → pathname만 추출 + 클램프
// API 경로 정규화 함수
function normalizeApiPath(v) {
  if (!v) return null;
  try {
    // "http"로 시작하면 URL 객체 생성 후 pathname 추출
    if (typeof v === "string" && v.startsWith("http")) {
      return clampStr(new URL(v).pathname || "/", MAXLEN.api_path);
    }
  } catch {} // URL 객체 생성 실패 시 무시
  const onlyPath = String(v).split("?")[0].split("#")[0] || "/"; // 쿼리 문자열과 해시 제거 후 경로 추출
  return clampStr(onlyPath, MAXLEN.api_path);
}

// HTTP Status 정규화(문자/혼합도 허용)
function toApiStatus(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).match(/\d+/); // 정규식으로 숫자 패턴 찾기
  if (!m) return null; // 숫자가 없으면 null 반환
  const i = parseInt(m[0], 10); // 숫자를 정수로 변환
  if (!Number.isFinite(i) || i < 0 || i > 65535) return null; // 숫자가 유한하고 0 이상이고 65535 이하가 아니면 null 반환
  return i; // 숫자 반환
}

// YYYY-MM-DD HH:mm:ss.ms 형태를 정규식으로 파싱
// KST 입력을 UTC 기준 ms로 환산 처리
function parseEventTimeMs(v) {
  // v가 숫자면 정수로 변환 후 파싱 후 반환
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  // v가 Date 객체면 getTime(UTC epoch ms) 반환
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.getTime();
  
  // v가 문자열이면 SAFE 함수로 정리 후 null 이면 null 반환
  const s = SAFE(v);
  if (!s) return null;

  // 정근식으로 파싱
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
  );
  // 정규식으로 파싱 성공 시 날짜 파싱
  if (m) {
    const [, yy, MM, dd, hh, mm, ss, ms = "0"] = m;
    return Date.UTC(
      Number(yy),
      Number(MM) - 1,
      Number(dd),
      Number(hh) - 9,
      Number(mm),
      Number(ss),
      Number(ms.padEnd(3, "0"))
    );
  }

  // 문자열이면 Date.parse 메서드로 파싱 후 반환
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? parsed : null;
}
// 위 함수를 활용한 resolveEventTsMs 함수 정의
function resolveEventTsMs(row, fallbackMs = Date.now()) {
  // AZ_event_ts_ms 필드가 있으면 그 값을 반환 (null guard: toUInt(null)=0 오탐 방지)
  const raw = row?.AZ_event_ts_ms;
  if (raw != null) {
    const fromMsField = toUInt(raw);
    if (fromMsField != null) return fromMsField;
  }

  // AZ_event_time 필드가 있으면 파싱 후 반환
  const fromEventTime = parseEventTimeMs(row?.AZ_event_time);
  if (fromEventTime != null) return fromEventTime;

  // 둘 다 없으면 fallbackMs 반환
  return Number.isFinite(fallbackMs) ? Math.floor(fallbackMs) : Date.now();
}

// 유저 행동 키 생성
function actorKeyOfRow(row) {
  // AZ_login_id, AZ_session_browser_id, AZ_session_install_id, AZ_session_page_id 필드 추출 및 정리
  const loginId = SAFE(row?.AZ_login_id);
  const browserId = SAFE(row?.AZ_session_browser_id);
  const installId = SAFE(row?.AZ_session_install_id);
  const sid = SAFE(row?.AZ_session_page_id);

  // loginId가 있고 "unknown"이 아니면 키 생성 loginId
  if (loginId && loginId.toLowerCase() !== "unknown") {
    return `login:${loginId}`;
  }
  // loginId가 없고 browserId가 있으면 키 생성
  if (browserId) return `browser:${browserId}`;
  // browserId가 없고 installId가 있으면 키 생성
  if (installId) return `install:${installId}`;
  // installId가 없고 sid가 있으면 키 생성
  if (sid) return `session:${sid}`;
  // 모두 없으면 "actor:unknown" 반환
  return "actor:unknown";
}

// ───────────────────── 오류 탐지 유틸 ─────────────────────
// 데이터를 문자열로 변환
function stringifyForScan(v) {
  // v가 null 또는 undefined 이면 "" 반환
  if (v == null || v === undefined) return "";
  // v가 문자열이면 v 반환
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
// 오류 경계 이벤트인지 확인
function isErrorMutationBoundary(row, actionLower) {
  // actionLower가 "dom_mutation"이 아니면 false 반환
  if (actionLower !== "dom_mutation") return false;
  // AZ_event_subtype 필드 추출 및 소문자로 변환
  const subtype = (SAFE(row?.AZ_event_subtype) || "").toLowerCase();
  // subtype가 "error-ui"이면 true 반환
  if (subtype === "error-ui") return true;

  // AZ_data, AZ_mutation_json 필드 추출 및 문자열로 변환 후 결합
  const scan = `${stringifyForScan(row?.AZ_data)} ${stringifyForScan(row?.AZ_mutation_json)}`;
  // ERROR_KEYWORD_RE 정규식으로 테스트 후 결과 반환
  return ERROR_KEYWORD_RE.test(scan);
}

// row에 actorKey, workflowIndex, eventTsMs 를 활용하여 워크플로우 힌트 설정
function setActorWorkflowHints(row, actorKey, workflowIndex, eventTsMs, step_duration_ms) {
  // workflowIndex를 정수로 변환, 실패 시 1로 설정
  const idx = toUInt(workflowIndex) || 1;
  // 워크플로우 키 생성
  const workflowKey = `${actorKey}#W${idx}`;
  
  // 메모리용 필드 row._actor_key, row._actor_workflow_index, row._actor_workflow_key 설정
  row._actor_key = actorKey;
  row._actor_workflow_index = idx;
  row._actor_workflow_key = workflowKey;

  // AZ_locators_json 필드 추출 및 객체로 변환
  const loc = safeJSON(row.AZ_locators_json);
  // loc가 객체이고 배열이 아니면 그대로 사용, 아니면 빈 객체 생성
  const locObj = loc && typeof loc === "object" && !Array.isArray(loc) ? { ...loc } : {};
  // locObj.analysis가 객체이고 배열이 아니면 그대로 사용, 아니면 빈 객체 생성
  const analysis = locObj.analysis && typeof locObj.analysis === "object" && !Array.isArray(locObj.analysis) ? { ...locObj.analysis } : {};

  // analysis 객체에 필드 설정
  analysis.actor_key = actorKey; // 유저 행동 키
  analysis.actor_workflow_key = workflowKey; // 워크플로우 키
  analysis.actor_workflow_index = idx; // 워크플로우 인덱스
  analysis.event_ts_ms = eventTsMs; // 이벤트 시간
  analysis.step_duration_ms = step_duration_ms; // 이벤트 소요 시간
  locObj.analysis = analysis; // locObj.analysis에 analysis 객체 설정

  // 최종 객체를 row.AZ_locators_json에 삽입
  row.AZ_locators_json = locObj;
}
// actor 별 workflow index 할당
function assignActorWorkflowHints(rows, idleMs = WORKFLOW_IDLE_MS) {
  try {
    // 각 row를 item 구조로 변환 
    // (r: row, seq: 순서, eventTsMs: 이벤트 시간, actorKey: 유저 행동 키, workflowIndex: 초기값 1)
    const items = rows.map((r, seq) => ({
      r,
      seq,
      eventTsMs: resolveEventTsMs(r),
      actorKey: actorKeyOfRow(r),
      workflowIndex: 1,
      browserId: SAFE(r.AZ_session_browser_id),
    }));

    // actor 별 그룹화(actorKey를 키로 하는 버킷맵 생성)
    const byActor = new Map();
    // items를 actor 별로 그룹화
    for (const item of items) {
      const bucket = byActor.get(item.actorKey) || [];
      bucket.push(item);
      byActor.set(item.actorKey, bucket);
    }

    // actor 버킷별로 분할
    for (const [, bucket] of byActor.entries()) {
      // 이벤트 시간 기준 정렬(eventTsMS 우선 비교 후 같을 경우 seq 비교)
      bucket.sort((a, b) => a.eventTsMs - b.eventTsMs || a.seq - b.seq);

      // 캐시에서 워크플로우 상태 조회
      const cached = actorCache.get(bucket[0].actorKey);
      // workflow index 초기값 1
      let workflowIndex = cached?.workflowIndex ?? 1;
      // 현재 workflow에 이벤트가 하나라도 들어갔는지 확인
      let hasCurrentEvents = false;
      // 마지막 user-relevant 이벤트 시각 추적
      let lastRelevantTs = cached?.lastRelevantTs ?? null;
      // 마지막 browser id 추적
      let lastBrowserId = cached?.browserId ?? null;
      // 이벤트 소요 시간 추적
      let lastEventTs = cached?.lastEventTs ?? null;

      // bucket 내의 이벤트 순회
      for (const item of bucket) {
        // AZ_event_action 정규화
        const action = (SAFE(item.r.AZ_event_action) || "").toLowerCase();
        // user-relevant 이벤트 여부 확인 (action 인지 확인)
        const isRelevant = USER_RELEVANT_ACTIONS.has(action);
        // route_change 이벤트 여부 확인
        const routeBoundary = action === "route_change";
        // idle 시간 초과 여부 확인
        const idleBoundary =
          isRelevant && lastRelevantTs != null && item.eventTsMs - lastRelevantTs > idleMs;
        // browser id 변경 여부 확인
        const browserBoundary = lastBrowserId != null && item.browserId !== lastBrowserId;

        // 이벤트 소요 시간 계산
        let stepMs = null;
        if (lastEventTs != null) {
          const delta = item.eventTsMs - lastEventTs;
          stepMs = delta >= 0 ? delta : null;
        }
        item.stepDurationMs = stepMs;

        // 현재 workflow에 이벤트가 이미 있을 때
        // route_change 또는 idle 시간 초과 시 workflow index 증가
        // 그 외 경우 현재 workflow 유지(초기화)
        if (hasCurrentEvents && (routeBoundary || idleBoundary || browserBoundary)) {
          workflowIndex += 1;
          hasCurrentEvents = false;
        }

        // 현재 이벤트의 workflow index 설정
        item.workflowIndex = workflowIndex;
        // 현재 workflow에 이벤트가 하나라도 들어갔음을 표시
        hasCurrentEvents = true;

        // relevant 이벤트 시각 업데이트
        if (isRelevant && (lastRelevantTs == null || item.eventTsMs >= lastRelevantTs)) {
          lastRelevantTs = item.eventTsMs;
        }

        // browser id 업데이트
        if (lastEventTs == null || item.eventTsMs >= lastEventTs) {
          lastEventTs = item.eventTsMs;
        }

        // submit 또는 오류 경계 이벤트 시 workflow index 증가
        const submitBoundary = action === "submit";
        const errorBoundary = isErrorMutationBoundary(item.r, action);
        if (submitBoundary || errorBoundary) {
          workflowIndex += 1;
          hasCurrentEvents = false;
        }
      }
      // 현재 배치 결과를 캐시에 저장
      actorCache.set(bucket[0].actorKey, {
        lastRelevantTs,
        workflowIndex,
        accessedAt: Date.now(),
        browserId: lastBrowserId,
        lastEventTs: lastEventTs,
      })
    }

    // 전체 item에 확정된 workflow index를 row에 반영
    for (const item of items) {
      // 클라이언트가 AZ_workflow_index를 보낸 경우 우선 사용 (cross-batch 연속성 보장)
      const clientIdx = toUInt(item.r.AZ_workflow_index);
      const finalIdx = (clientIdx && clientIdx > item.workflowIndex) ? clientIdx : item.workflowIndex;
      setActorWorkflowHints(
        item.r,
        item.actorKey,
        finalIdx,
        item.eventTsMs,
        item.stepDurationMs 
      );
    }
  } catch {
    for (const r of rows) {
      // 실패 시 fallback 처리 (workflow index 1, 이벤트 시각 사용)
      const actorKey = actorKeyOfRow(r);
      setActorWorkflowHints(r, actorKey, 1, resolveEventTsMs(r));
    }
  }
}

// ───────────────────── 행 보강 ─────────────────────
function enrichRow(row, clientIp, tenantId) {
  const r = { ...row }; //  객체 스프레드 (복사본 생성)

  // 서버 관측 IP (확장 프로그램에서 직접 얻기 어려움)
  if (!r.AZ_ip_address || r.AZ_ip_address === "(unavailable-in-extension)")
    r.AZ_ip_address = clientIp || null;

  // 테넌트
  //r._tenant_id = tenantId || null; // 테넌트 적재가 막혀 주석처리 (tenant_id가 무조건 NULL로 저장되어 테넌트 정보 유실)

  // URL 파생
  r.AZ_url_host = r.AZ_url_host || hostOf(r.AZ_url); // URL 호스트 추출
  r.AZ_url_path = r.AZ_url_path || pathOf(r.AZ_url); // URL 경로 추출
  r.AZ_api_host = r.AZ_api_host || hostOf(r.AZ_api_url); // API URL 호스트 추출

  // locators_json → session/env/a11y (locators_json 객체에서 세션, 환경, 접근성 정보 추출)
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

  // 이벤트 액션이 없을 경우 요소 타입에 따라 기본값 설정
  if (!r.AZ_event_action) {
    if (r.AZ_element_type === "menu") r.AZ_event_action = "menu_click"; // 메뉴 클릭
    else if (r.AZ_element_type === "event") r.AZ_event_action = "event"; // 이벤트
    else if (r.AZ_element_type === "state") r.AZ_event_action = "post_state"; // 상태 변경
    else r.AZ_event_action = "change"; // 변경
  }

  // 메뉴 trail → section/item (메뉴 경로 추출)
  const trail = safeJSON(r.AZ_menu_li_trail);
  if (Array.isArray(trail) && trail.length) {
    r.AZ_menu_section = r.AZ_menu_section ?? String(trail[0]).slice(0, 255);
    if (trail.length >= 2)
      r.AZ_menu_item = r.AZ_menu_item ?? String(trail[1]).slice(0, 255);
  }

  // 입력 길이가 null이고 데이터가 문자열이면서 특정 타입이 아닐 경우에 input_length에 data의 길이 저장
  if (
    r.AZ_input_length == null &&
    typeof r.AZ_data === "string" &&
    !["event", "menu", "state"].includes(r.AZ_element_type || "")
  ) {
    r.AZ_input_length = r.AZ_data.length;
  }

  // 스냅샷 정규화(세 포맷 수용: AZ_snapshot_* / snapshot.* / AZ_dom_*)
  const snap = r.snapshot && typeof r.snapshot === "object" ? r.snapshot : null;
  r._snap_dom_before =
    r.AZ_snapshot_dom_before ?? r.AZ_dom_before ?? snap?.dom_before ?? null;
  r._snap_dom_after =
    r.AZ_snapshot_dom_after ?? r.AZ_dom_after ?? snap?.dom_after ?? null;
  r._snap_api_body =
    r.AZ_snapshot_api_response_body ??
    r.AZ_api_response_body ??
    snap?.api_response_body ??
    null;

  r.AZ_api_status = toApiStatus(r.AZ_api_status);

  return r;
}

// 2) toEventTuple 내부에서 사용
/*
CHANGE NOTE: code_after 와 초기 버전의 toEventTuple 은 interaction_type surface 와 input_data 정책이 더 단순했습니다.

LEGACY_FROM_code_after:
function toEventTuple(r, taskId) {
  const event_type =
    r.AZ_event_action === "page_view" || r.AZ_element_type === "page"
      ? "PAGE_VIEW"
      : "DOM_EVENT";

  let interaction_type = "change";
  if (r.AZ_element_type === "menu" || r.AZ_event_action === "menu_click")
    interaction_type = "click";
  else if (r.AZ_event_action === "event")
    interaction_type = r.AZ_event_subtype || "event";
  else if (r.AZ_event_action === "route_change") interaction_type = "spa";
  else if (r.AZ_event_action === "post_state") interaction_type = "state";
  else if (r.AZ_event_action === "submit") interaction_type = "submit";

  const input_data = ["event", "menu", "state"].includes(r.AZ_element_type || "")
    ? null
    : r.AZ_data;
}

현재 변경 이유:
- api_response / blur / focus / visibility_change / page_close / page_view까지 명시적으로 남김
- input_data 를 더 보존해 후처리 분석 재료를 남김
- api_latency_ms 를 별도 적재
*/
function toEventTuple(r, taskId) {
  // 이벤트 유형 설정 (PAGE_VIEW 또는 DOM_EVENT)
  const event_type =
    r.AZ_event_action === "page_view" || r.AZ_element_type === "page"
      ? "PAGE_VIEW"
      : "DOM_EVENT";

    // API_EVENT 고려려
    // const event_type =
    //   r.AZ_event_action === "api_response" ? "API_EVENT" :
    //     (r.AZ_event_action === "page_view" || r.AZ_element_type === "page") ? "PAGE_VIEW" :
    //     "DOM_EVENT";

  // 상호작용(이벤트) 유형 설정 (기본 "change")
  let interaction_type = "change";
  if (r.AZ_element_type === "menu" || r.AZ_event_action === "menu_click" || r.AZ_event_action === 'click')
    interaction_type = "click";
  else if (r.AZ_event_action === "event")
    interaction_type = r.AZ_event_subtype || "event";
  else if (r.AZ_event_action === "route_change") interaction_type = "spa";
  else if (r.AZ_event_action === "post_state") interaction_type = "state";
  else if (r.AZ_event_action === "submit") interaction_type = "submit";
  else if (r.AZ_event_action === "api_response") interaction_type = "api_response";
  else if (r.AZ_event_action === "blur") interaction_type = "blur";
  else if (r.AZ_event_action === "focus") interaction_type = "focus";
  else if (r.AZ_event_action === 'visibility_change') interaction_type = 'visibility_change';
  else if (r.AZ_event_action === 'page_close') interaction_type = 'page_close';
  else if (r.AZ_event_action === 'page_view') interaction_type = 'page_view';
  // 입력 데이터 설정 (이벤트, 메뉴, 상태 타입이 아닐 경우 null)
  const input_data = r.AZ_data ?? null;
  // const input_data = ["event", "menu", "state"].includes(r.AZ_element_type || "")
  //   && r.AZ_event_action !== 'visibility_change'
  //   ? null
  //   : r.AZ_data;

  // api_path는 항상 pathname만 사용(우선순위: AZ_api_path → AZ_api_url)
  let api_path_raw = r.AZ_api_path ?? null;
  if (!api_path_raw) {
    api_path_raw = r.AZ_api_url ? pathOf(r.AZ_api_url) : null; // pathOf는 pathname 반환
  } 
  // else {
  //   api_path_raw = normalizeApiPath(api_path_raw); // 혹시 풀 URL/질의 포함해도 정규화
  // }
  const api_path = normalizeApiPath(api_path_raw);

  // 길이 제한
  const page_url = clampStr(r.AZ_url, MAXLEN.page_url);
  const rawTargetSelector = r.AZ_selector_css || r.AZ_element_uid || null;
  const target_selector = clampStr(rawTargetSelector, MAXLEN.target_selector); 

  const api_status = toApiStatus(r.AZ_api_status);
  const api_latency_ms = toUInt(r.AZ_api_latency_ms) ?? null;

  // 배열로 반환
  return [
    taskId, // 태스크 ID
    r.AZ_event_time, // 이벤트 시간
    event_type, // 이벤트 유형
    page_url, // 페이지 URL
    target_selector, // 타겟 선택자
    interaction_type, // 상호작용 유형
    input_data, // 입력 데이터
    api_path, // API 경로
    r.AZ_api_method || null, // API 메서드
    api_status, // API 상태
    api_latency_ms, // API 레이턴시 (ms)
  ];
}

//안전한 바이트 기준 트림 함수 추가 (UTF-8)
function trimUtf8Bytes(input, maxBytes) {
  if (input == null) return null;

  const s = String(input);
  // Buffer.from 메서드는 문자열을 바이트 배열로 변환하는 메서드
  const buf = Buffer.from(s, "utf8"); // "utf8" 인코딩 사용
  if (buf.length <= maxBytes) return s; // 바이트 배열의 길이가 maxBytes 이하면 원본 문자열 반환

  // maxBytes 안에서 잘라서 UTF-8 깨짐 방지(문자 경계 맞추기)
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0b11000000) === 0b10000000) {
    end--; // 연속 바이트(10xxxxxx)면 뒤로 이동
  }
  // return buf.slice(0, end).toString("utf8");
  return buf.subarray(0, end).toString("utf8");
}


// ───────────────────── 세션 집계 ─────────────────────
// 여러 이벤트를 세션별로 그룹화
function batchAggregateSessions(rows) {
  // sid -> {user_id, tenant_id, start, end, ua, viewport, ip, vw, vh, browser_id}
  const map = new Map();
  for (const r of rows) {
    const sid = SAFE(r.AZ_session_page_id);
    if (!sid) continue;

    const cur =
      map.get(sid) || {
        user_id: SAFE(r.AZ_login_id) || "unknown",
        tenant_id: r._tenant_id || null,
        start: r.AZ_event_time,
        end: r.AZ_event_time,
        ua: null,
        viewport: null,
        ip: null,
        vw: null,
        vh: null,
        browser_id: null,
      };

    if (r.AZ_event_time < cur.start) cur.start = r.AZ_event_time;
    if (r.AZ_event_time > cur.end) cur.end = r.AZ_event_time;

    cur.user_id = betterUserId(cur.user_id, r.AZ_login_id);
    cur.tenant_id = cur.tenant_id || r._tenant_id || null;

    if (!cur.ua) {
      const L = safeJSON(r.AZ_locators_json);
      const ua = SAFE(L?.env?.ua);
      if (ua) cur.ua = ua;
    }
    if (!cur.viewport && (r.AZ_viewport_w || r.AZ_viewport_h)) {
      const w = toUInt(r.AZ_viewport_w),
        h = toUInt(r.AZ_viewport_h);
      if (w && h) cur.viewport = `${w}x${h}`;
    }
    if (!cur.vw && r.AZ_viewport_w) cur.vw = toUInt(r.AZ_viewport_w);
    if (!cur.vh && r.AZ_viewport_h) cur.vh = toUInt(r.AZ_viewport_h);
    if (!cur.browser_id && SAFE(r.AZ_session_browser_id))
      cur.browser_id = SAFE(r.AZ_session_browser_id);

    if (!cur.ip && SAFE(r.AZ_ip_address)) cur.ip = r.AZ_ip_address;

    map.set(sid, cur);
  }
  return map;
}

//세션/태스크 보장
async function ensureTasks(conn, sessionIds) {
  if (!sessionIds.length) return;
  const placeholders = sessionIds
    .map(() => "(?, ?, 'IN_PROGRESS', ?, NULL, NULL)")
    .join(",");
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
  // 1) page_session_id
  if (SAFE(r.AZ_session_page_id)) return r.AZ_session_page_id;

  // 2) locators_json에서 추출
  const L = safeJSON(r.AZ_locators_json);
  const sid2 = SAFE(L?.session?.page_session_id);
  if (sid2) {
    r.AZ_session_page_id = sid2;
    return sid2;
  }

  // 3) 사용자/시간 기반 귀속
  if (isKnownUserId(r.AZ_login_id)) {
    const [row] = await conn.query(
      `SELECT id FROM sessions
        WHERE user_id = ? AND start_time <= ? AND (end_time IS NULL OR end_time >= ?)
        ORDER BY end_time DESC LIMIT 1`,
      [r.AZ_login_id.trim(), r.AZ_event_time, r.AZ_event_time]
    );
    if (row?.id) return row.id;
  }

  // 4) 없으면 새 세션 생성
  const newSid = crypto.randomUUID();
  const L2 = safeJSON(r.AZ_locators_json);
  const ua = SAFE(L2?.env?.ua) || null;
  const w = toUInt(r.AZ_viewport_w),
    h = toUInt(r.AZ_viewport_h);
  const viewport = w && h ? `${w}x${h}` : null;
  const userId = isKnownUserId(r.AZ_login_id) ? r.AZ_login_id.trim() : "unknown";
  const browserId = SAFE(r.AZ_session_browser_id) || null;

  await conn.query(
    `INSERT INTO sessions (id, user_id, tenant_id, start_time, end_time,
                            user_agent, viewport_size, ip_address,
                            viewport_width, viewport_height, browser_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newSid,
      userId,
      r._tenant_id || null,
      r.AZ_event_time,
      r.AZ_event_time,
      ua,
      viewport,
      SAFE(r.AZ_ip_address) || null,
      w || null,
      h || null,
      browserId,
    ]
  );
  return newSid;
}

// ───────────────────── 한 배치 처리 ─────────────────────
// 이 호출은 "기존 tasks/session 적재 로직은 유지"한 채,
// 추가로 workflow 힌트만 side-channel로 심는 절충안입니다.
// 즉 DB의 주 적재 구조를 갈아엎지 않고, 후속 프로세스 분석용 열(workflow_key/index)만 확장합니다.
async function processBatch(rows, clientIp, tenantId) {
  if (!rows.length) return { inserted: 0, snapshots: 0 };

  // 0) 보강
  const norm = rows.map((r) => enrichRow(r, clientIp, tenantId));

  // 분석용 actor workflow 힌트 생성 (DB task/task_id 의미는 그대로 유지)
  assignActorWorkflowHints(norm, WORKFLOW_IDLE_MS);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) 세션 upsert (세션ID 있는 것만)
    const sessAgg = batchAggregateSessions(norm);
    if (sessAgg.size) {
      const values = [];
      const ph = [];
      for (const [sid, s] of sessAgg.entries()) {
        ph.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        values.push(
          sid,
          s.user_id,
          s.tenant_id,
          s.start,
          s.end,
          s.ua,
          s.viewport,
          s.ip,
          s.vw,
          s.vh,
          s.browser_id
        );
      }
      await conn.query(
        `INSERT INTO sessions
            (id, user_id, tenant_id, start_time, end_time,
            user_agent, viewport_size, ip_address,
            viewport_width, viewport_height, browser_id)
          VALUES ${ph.join(",")}
          ON DUPLICATE KEY UPDATE
            start_time    = LEAST(start_time, VALUES(start_time)),
            end_time      = GREATEST(COALESCE(end_time, '1000-01-01'), VALUES(end_time)),
            user_agent    = COALESCE(sessions.user_agent, VALUES(user_agent)),
            viewport_size = COALESCE(sessions.viewport_size, VALUES(viewport_size)),
            ip_address    = COALESCE(sessions.ip_address, VALUES(ip_address)),
            tenant_id     = COALESCE(sessions.tenant_id, VALUES(tenant_id)),
            viewport_width  = COALESCE(sessions.viewport_width,  VALUES(viewport_width)),
            viewport_height = COALESCE(sessions.viewport_height, VALUES(viewport_height)),
            browser_id      = COALESCE(sessions.browser_id,      VALUES(browser_id)),
            -- ★ 기존이 NULL/빈문자/'unknown'이면 새 login_id로 승격
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
    const perTaskMin = new Map(),
      perTaskMax = new Map();
    let totalEvents = 0,
      totalSnaps = 0;

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
          [r.AZ_login_id.trim(), sid]
        );
      }

      // 태스크 확보
      let taskId = taskIdCache.get(sid);
      if (!taskId) {
        const [row] = await conn.query(
          `SELECT id FROM tasks WHERE session_id=? AND task_name=? LIMIT 1`,
          [sid, TASK_NAME]
        );
        if (row?.id) taskId = row.id;
        else {
          const res = await conn.query(
            `INSERT INTO tasks (session_id, task_name, status, start_time)
              VALUES (?, ?, 'IN_PROGRESS', ?)`,
            [sid, TASK_NAME, r.AZ_event_time]
          );
          taskId = res.insertId;
        }
        taskIdCache.set(sid, taskId);
      }

      const MAX_TEXT_BYTES = 60000;

      // 이벤트 삽입 (★ 신규 4컬럼 포함)
      const evtTuple = toEventTuple(r, taskId);
      const selector_xpath = r.AZ_selector_xpath || null;
      const element_tag = r.AZ_element_tag || null;
      const data_testid = r.AZ_data_testid || null;
      let locatorsPayload = r.AZ_locators_json;
      if (r.AZ_event_subtype) {
        if (locatorsPayload && typeof locatorsPayload === "object" && !Array.isArray(locatorsPayload)) {
          const analysis =
            locatorsPayload.analysis &&
            typeof locatorsPayload.analysis === "object" &&
            !Array.isArray(locatorsPayload.analysis)
              ? locatorsPayload.analysis
              : {};
          locatorsPayload = {
            ...locatorsPayload,
            analysis: {
              ...analysis,
              event_subtype: r.AZ_event_subtype,
            },
          };
        } else {
          locatorsPayload = {
            analysis: {
              event_subtype: r.AZ_event_subtype,
            },
          };
        }
      }
      const locators_json = asJsonString(locatorsPayload);
      // const data_testid = r.AZ_data_testid || null;
      // const locators_json = asJsonString(r.AZ_locators_json);
      const page_title  = r.AZ_page_title  || null;
      const element_text = trimUtf8Bytes(r.AZ_element_text, MAX_TEXT_BYTES) || null;
      const associated_label = trimUtf8Bytes(r.AZ_associated_label, MAX_TEXT_BYTES) || null;
      const workflow_key = r.AZ_locators_json?.analysis?.actor_workflow_key || null;
      const workflow_index = r.AZ_locators_json?.analysis?.actor_workflow_index ?? null;
      const step_duration_ms = toUInt(r.AZ_locators_json?.analysis?.step_duration_ms);
      /*
      CHANGE NOTE: code_after 의 events insert 는 더 좁은 스키마를 사용했습니다.

      LEGACY_FROM_code_after:
      const evtRes = await conn.query(
        `INSERT INTO events
          (task_id, event_time, event_type, page_url, target_selector, interaction_type, input_data,
            api_path, api_method, api_status_code,
            selector_xpath, element_tag, data_testid, locators_json, page_title, element_text, associated_label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ...evtTuple,
          selector_xpath,
          element_tag,
          data_testid,
          locators_json,
          page_title,
          element_text,
          associated_label,
        ]
      );

      현재 추가 컬럼:
      - event_id
      - session_id
      - api_latency_ms
      - workflow_key
      - workflow_index

      즉 원시 이벤트 적재와 분석 힌트 적재를 한 insert 에 묶은 상태입니다.
      */
      const evtRes = await conn.query(
        `INSERT INTO events
          (event_id, session_id, task_id, event_time, event_type, page_url, target_selector, interaction_type, input_data,
            api_path, api_method, api_status_code, api_latency_ms,
            selector_xpath, element_tag, data_testid, locators_json, page_title, element_text, associated_label,
            workflow_key, workflow_index, step_duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE event_id = event_id`,
        [
          r.AZ_event_id, // 이벤트 중복 방지 처리를 위한 고유 ID
          sid,
          ...evtTuple,
          selector_xpath,
          element_tag,
          data_testid,
          locators_json,
          page_title,
          element_text,
          associated_label,
          workflow_key,
          workflow_index,
          step_duration_ms,
        ]
      );

      const eventId = evtRes.insertId;

    // 스냅샷 저장 비활성화
    /*
      if (r._snap_dom_before || r._snap_dom_after || r._snap_api_body) {
        let apiBody = r._snap_api_body;
        if (typeof apiBody === "string") {
          try {
            apiBody = JSON.parse(apiBody);
          } catch {
            // keep string 
          }
        }
        await conn.query(
          `INSERT INTO snapshots (event_id, dom_before, dom_after, api_response_body)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            dom_before       = VALUES(dom_before),
            dom_after        = VALUES(dom_after),
            api_response_body= VALUES(api_response_body)`,
          [ eventId, r._snap_dom_before || null, r._snap_dom_after || null, apiBody ?? null ]
        );
        totalSnaps++;
      }
      */

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
        [r.AZ_event_time, r.AZ_event_time, r.AZ_event_time, sid]
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
        [minT, minT, maxT, maxT, taskId]
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
// 확장 SW 호출 바디: { reason, rows: [ AZ_*... (옵션) snapshot:{} ], ts }
/*
CHANGE NOTE: code_after 의 ingest route 는 JSON body 기준만 전제했습니다.

LEGACY_FROM_code_after:
app.post("/ingest/batch", requireApiKey, async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows?.length) return res.status(400).json({ error: "empty_rows" });
  ...
});

현재는 text/plain / string body 도 먼저 JSON.parse 시도합니다.
변경 이유:
- 종료 직전 keepalive/beacon 성격의 요청도 수용하기 위함
- whitelist 에 AZ_api_latency_ms, AZ_workflow_index 같은 신규 필드를 포함하기 위함
*/
app.post("/ingest/batch", requireApiKey, async (req, res) => {
  try {
    // 창 종료 시 텍스트 본문 처리
    let requestBody = req.body;
    if (typeof requestBody === 'string') {
      try { requestBody = JSON.parse(requestBody); } catch(e) {}
    }

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows?.length) return res.status(400).json({ error: "empty_rows" });
    
    // 요청자 IP → 세션 ip_address 보강
    const clientIp =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.ip ||
      null;
    // 테넌트 ID
    const tenantIdPerRow = (r) => parseTenantId(req, r);
    /*
    CHANGE NOTE: code_after 의 ingest whitelist 는 workflow/api-latency 중심 필드를 받지 않았습니다.
    LEGACY_FROM_code_after (excerpt):
    - "AZ_event_time"
    - "AZ_api_status"
    - "AZ_snapshot_dom_before"
    - "AZ_snapshot_dom_after"
    - "AZ_snapshot_api_response_body"
    - "snapshot"
    
    현재 추가 수용 필드:
    - AZ_event_ts_ms
    - AZ_api_latency_ms
    - AZ_workflow_index
    - AZ_event_id
    
    즉 route whitelist 자체가 "원시 수집"에서 "분석 힌트 포함 수집"으로 확장된 상태입니다.
    */
    // 기존 20 + 추가 31 (누락은 NULL로 정규화)
    const ALL_50 = [
      // 기존 20
      "AZ_api_method",
      "AZ_api_path",
      "AZ_api_status",
      "AZ_api_url",
      "AZ_data",
      "AZ_element_label",
      "AZ_element_type",
      "AZ_element_uid",
      "AZ_event_time",
      "AZ_event_ts_ms", // 0306 추가
      "AZ_form_selector",
      "AZ_frame_path",
      "AZ_ip_address",
      "AZ_locators_json",
      "AZ_login_id",
      "AZ_menu_li_trail",
      "AZ_nav_root",
      "AZ_post_hints",
      "AZ_shadow_path",
      "AZ_url",
      // 추가 31
      "AZ_a11y_role",
      "AZ_api_host",
      "AZ_api_latency_ms",
      "AZ_aria_label",
      "AZ_aria_labelledby",
      "AZ_data_testid",
      "AZ_dom_mutation_json", // 0306 추가
      "AZ_element_tag",
      "AZ_event_action",
      "AZ_event_subtype",
      "AZ_form_action",
      "AZ_form_name",
      "AZ_input_length",
      "AZ_is_sensitive",
      "AZ_key",
      "AZ_key_mods",
      "AZ_menu_item",
      "AZ_menu_section",
      "AZ_page_title",
      "AZ_referrer",
      "AZ_route_from",
      "AZ_route_to",
      "AZ_selector_css",
      "AZ_selector_xpath",
      "AZ_session_browser_id",
      "AZ_session_install_id",
      "AZ_session_page_id",
      "AZ_session_tab_id",
      "AZ_url_host",
      "AZ_url_path",
      "AZ_viewport_h",
      "AZ_viewport_w",
      "AZ_workflow_index",
      // 선택: 멀티 테넌트/스냅샷
      "AZ_api_response_body",
      "AZ_associated_label",
      "AZ_dom_after",
      "AZ_dom_before",
      "AZ_element_text",
      "AZ_event_id",
      "AZ_snapshot_api_response_body",
      "AZ_snapshot_dom_after",
      "AZ_snapshot_dom_before",
      "AZ_tenant_id",
      "snapshot",
    ];

    const filled = rows.map((r) => {
      const o = {};
      for (const k of ALL_50) o[k] = Object.prototype.hasOwnProperty.call(r, k) ? r[k] : null;
      // per-row tenant 상향
      o._tenant_id = tenantIdPerRow(r);
      return o;
    });

    const result = await processBatch(filled, clientIp, null);
    res.json({
      ok: true,
      inserted_events: result.inserted,
      inserted_snapshots: result.snapshots,
    });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

// ───────────────────── Workflow 라우트 ─────────────────────
// 프로세스 목록 조회 및 상태 분류 (NEW, UPDATED, SYNCED)
app.get("/api/processes", async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id, p.name, p.created_at,
        v.last_synced_at,
        (SELECT MD5(GROUP_CONCAT(step_id ORDER BY step_order SEPARATOR '-')) 
          FROM flows f WHERE f.process_id = p.id) as current_sig,
        v.source_signature as stored_sig,
        CASE 
          WHEN v.process_id IS NULL THEN 'NEW'
          WHEN v.source_signature != (SELECT MD5(GROUP_CONCAT(step_id ORDER BY step_order SEPARATOR '-')) 
                                        FROM flows f WHERE f.process_id = p.id) THEN 'UPDATED'
          ELSE 'SYNCED'
        END as sync_status
      FROM processes p
      LEFT JOIN process_visualizations v ON p.id = v.process_id
      ORDER BY p.created_at DESC;
    `;
    const rows = await pool.query(query);
    res.json(rows);
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: "fetch_processes_failed" });
  }
});

// 동기화
app.post("/api/processes/:id/sync", async (req, res) => {
  const id = toUInt(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id"});

  try {
    // 현재 플로우 고유 식별자 생성
    const signatureRow = await pool.query(
      `SELECT MD5(GROUP_CONCAT(step_id ORDER BY step_order SEPARATOR '-')) as sig 
        FROM flows 
        WHERE process_id = ?`,
        [id]
    );
    const currentSig = signatureRow[0]?.sig;

    // Workflow 시각화 JSON 데이터 생성
    // 시각화를 위해 flows, steps 테이블 조회, node, edge 데이터 생성
    const nodesRaw = await pool.query(
      `SELECT f.step_id, f.step_order, s.name, s.description 
        FROM flows f 
        JOIN steps s 
          ON f.step_id = s.id 
        WHERE f.process_id = ?
        ORDER BY f.step_order`, 
        [id]
    );
    const edgesRaw = await pool.query(
      `SELECT f1.step_id as source_step, f2.step_id as target_step
        FROM flows f1 
        JOIN flows f2 
          ON f1.process_id = f2.process_id 
        AND f1.step_order + 1 = f2.step_order 
        WHERE f1.process_id = ? `, 
        [id]
    );

    const initialChart = {
      nodes: nodesRaw.map(n => ({
        id: `step-${n.step_id}`,
        type: 'default',
        data: { label: n.name, order: n.step_order, desc: n.description },
        position: { x: 0, y: 0 },
      })),
      edges: edgesRaw.map(e => ({
        id: `e${e.source_step}-${e.target_step}`,
        source: `step-${e.source_step}`,
        target: `step-${e.target_step}`,
        animated: true,
      })),
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    // process_visualizations 테이블 INSERT (동기화)
    await pool.query(`
      INSERT INTO process_visualizations (process_id, chart_config, source_signature, last_synced_at)
      VALUES (?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            chart_config = VALUES(chart_config),
            source_signature = VALUES(source_signature),
            last_synced_at = NOW()
      `,
      [id, JSON.stringify(initialChart), currentSig]
    );
    res.json({ ok: true });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: "sync_failed" });
  }
});

// 편집된 레이아웃 저장 (프론트에서 편집한 nodes/edges/viewport를 그대로 저장)
app.put("/api/processes/:id/save-layout", async (req, res) => {
  const id = toUInt(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const { nodes, edges, viewport } = req.body || {};
  if (!nodes || !edges) return res.status(400).json({ error: "missing nodes or edges" });

  try {
    const chartConfig = JSON.stringify({ nodes, edges, viewport: viewport || { x: 0, y: 0, zoom: 1 } });
    const result = await pool.query(
      `UPDATE process_visualizations SET chart_config = ? WHERE process_id = ?`,
      [chartConfig, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: "save_layout_failed" });
  }
});

// 프로세스 상세 조회
app.get("/api/processes/:id/config", async (req, res) => {
  const id = toUInt(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id"});

  try {
    const rows = await pool.query(`
      SELECT chart_config
        FROM process_visualizations
      WHERE  process_id = ?`,
    [id]);
    if (!rows.length) return res.status(404).json({ error: "not_found"});
    res.json(safeJSON(rows[0].chart_config));
  } catch (e) {
    res.status(500).json({ error: "fetch_config_failed" });
  }
});

// ───────────────────── 헬스 체크 ─────────────────────
app.get("/healthz", (req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT || 8080);

async function start() {
  const mariadb = await import("mariadb");
  pool = mariadb.createPool(dbConfig);
  app.listen(port, () => log.info(`direct ingest listening :${port}`));
}

start().catch((e) => {
  log.error(e, "server_start_failed");
  process.exit(1);
});