"use strict";

const crypto = require("node:crypto");

const QUALITY_POLICY_VERSION = "quality-first-v1";
const DEFAULT_TTL_MS = 300000;
const DEFAULT_MAX_TEXT_BYTES = 60000;
const DEFAULT_MAX_RESPONSE_BODY_BYTES = 200000;
const DEFAULT_MAX_SNAPSHOT_BYTES = 65536;
const DEFAULT_MAX_QUEUE_ROWS = 2000;
const DEFAULT_DEDUPE_WINDOW_MS = 1200;

function toPositiveNumber(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function toFiniteNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function toBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseJsonEnv(value, name, fallback) {
  if (!value || !String(value).trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`invalid_${name}_json`);
  }
}

function parseJsonObjectEnv(value, name, fallback = {}) {
  const parsed = parseJsonEnv(value, name, fallback);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`invalid_${name}_object`);
  }
  return parsed;
}

function parseJsonArrayEnv(value, name, fallback = []) {
  const parsed = parseJsonEnv(value, name, fallback);
  if (!Array.isArray(parsed)) {
    throw new Error(`invalid_${name}_array`);
  }
  return parsed;
}

function mergePlainObject(base, override) {
  const next = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    const baseValue = next[key];
    if (
      baseValue &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      next[key] = mergePlainObject(baseValue, value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function buildQualityRuntimeConfig({
  environment = "production",
  env = process.env,
  fetchedAt = new Date(),
} = {}) {
  const ttlMs = toPositiveNumber(
    env.COLLECTOR_RUNTIME_CONFIG_TTL_MS,
    DEFAULT_TTL_MS,
    { min: 5000, max: 60 * 60 * 1000 }
  );
  const maxTextBytes = toPositiveNumber(
    env.COLLECTOR_MAX_TEXT_BYTES,
    DEFAULT_MAX_TEXT_BYTES,
    { min: 256, max: 1000000 }
  );
  const maxResponseBodyBytes = toPositiveNumber(
    env.COLLECTOR_MAX_RESPONSE_BODY_BYTES || env.SNAPSHOT_API_BODY_MAX_BYTES,
    DEFAULT_MAX_RESPONSE_BODY_BYTES,
    { min: 0, max: 5000000 }
  );
  const maxSnapshotBytes = toPositiveNumber(
    env.COLLECTOR_MAX_SNAPSHOT_BYTES,
    DEFAULT_MAX_SNAPSHOT_BYTES,
    { min: 1024, max: 5000000 }
  );

  const defaultModules = {
    dom_events: { enabled: true, required: true, preserves_raw_event: true },
    api_hooks: {
      enabled: true,
      capture_body: false,
      max_body_bytes: maxResponseBodyBytes,
    },
    snapshots: {
      enabled: true,
      mode: "triggered",
      max_bytes: maxSnapshotBytes,
    },
    grid_adapters: {
      enabled: true,
      min_confidence: toFiniteNumber(env.COLLECTOR_GRID_MIN_CONFIDENCE, 0.72, {
        min: 0,
        max: 1,
      }),
      max_scan_nodes: toPositiveNumber(env.COLLECTOR_GRID_MAX_SCAN_NODES, 3000, {
        min: 100,
        max: 100000,
      }),
    },
    workflow_rules: { enabled: true, mode: "annotate_only" },
    quality_guard: { enabled: true, mode: "server_annotate" },
    privacy_guard: { enabled: true, mode: "server_and_extension_policy" },
  };

  const defaultPrivacy = {
    remote_code_execution: false,
    mask_inputs: toBoolean(env.COLLECTOR_PRIVACY_MASK_INPUTS, true),
    max_text_bytes: maxTextBytes,
    max_response_body_bytes: maxResponseBodyBytes,
    excluded_url_patterns: [],
  };

  const defaultQuality = {
    policy_version: QUALITY_POLICY_VERSION,
    contract: "raw_preserved_derived_annotated",
    require_event_id: true,
    require_event_time: true,
    require_page_session_id: true,
    require_runtime_config_version: true,
    generated_missing_identifiers: true,
    annotate_locators_json: true,
    dedupe_window_ms: toPositiveNumber(
      env.COLLECTOR_DEDUPE_WINDOW_MS,
      DEFAULT_DEDUPE_WINDOW_MS,
      { min: 100, max: 60000 }
    ),
    max_queue_rows: toPositiveNumber(
      env.COLLECTOR_MAX_QUEUE_ROWS,
      DEFAULT_MAX_QUEUE_ROWS,
      { min: 1, max: 100000 }
    ),
    max_text_bytes: maxTextBytes,
    max_response_body_bytes: maxResponseBodyBytes,
    fail_closed_on_missing_db: true,
  };

  const modules = mergePlainObject(
    defaultModules,
    parseJsonObjectEnv(env.COLLECTOR_RUNTIME_MODULES_JSON, "collector_runtime_modules", {})
  );
  const privacy = mergePlainObject(
    defaultPrivacy,
    parseJsonObjectEnv(env.COLLECTOR_RUNTIME_PRIVACY_JSON, "collector_runtime_privacy", {})
  );
  const quality = mergePlainObject(
    defaultQuality,
    parseJsonObjectEnv(env.COLLECTOR_RUNTIME_QUALITY_JSON, "collector_runtime_quality", {})
  );

  privacy.remote_code_execution = false;
  quality.policy_version = QUALITY_POLICY_VERSION;
  quality.contract = "raw_preserved_derived_annotated";

  return {
    schema_version: 1,
    version:
      env.COLLECTOR_RUNTIME_CONFIG_VERSION ||
      `${environment}-${QUALITY_POLICY_VERSION}`,
    fetched_at: fetchedAt.toISOString(),
    ttl_ms: ttlMs,
    environment,
    modules,
    event_types: parseJsonObjectEnv(
      env.COLLECTOR_RUNTIME_EVENT_TYPES_JSON,
      "collector_runtime_event_types",
      {}
    ),
    selector_packs: parseJsonObjectEnv(
      env.COLLECTOR_RUNTIME_SELECTOR_PACKS_JSON,
      "collector_runtime_selector_packs",
      {}
    ),
    workflow_rules: parseJsonArrayEnv(
      env.COLLECTOR_RUNTIME_WORKFLOW_RULES_JSON,
      "collector_runtime_workflow_rules",
      []
    ),
    privacy,
    quality,
  };
}

function byteLength(value) {
  if (value == null) return 0;
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

function safeJson(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatSqlDateTime(date) {
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  return [
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`,
  ].join(" ");
}

function stableGeneratedId(row, index, environment) {
  const source = JSON.stringify({
    environment,
    index,
    action: row.AZ_event_action || null,
    time: row.AZ_event_time || row.AZ_event_ts_ms || null,
    session: row.AZ_session_page_id || null,
    url: row.AZ_url || null,
    selector: row.AZ_selector_css || row.AZ_selector_xpath || null,
    api: row.AZ_api_url || row.AZ_api_path || null,
  });
  const digest = crypto.createHash("sha256").update(source).digest("hex").slice(0, 24);
  return `server-qg-${digest}`;
}

function annotateQuality(row, annotation) {
  const locators = safeJson(row.AZ_locators_json) || {};
  const analysis =
    locators.analysis && typeof locators.analysis === "object" && !Array.isArray(locators.analysis)
      ? { ...locators.analysis }
      : {};

  analysis.server_quality_guard = annotation;
  analysis.server_runtime_config_version = annotation.runtime_config_version;
  analysis.effective_runtime_config_version =
    analysis.runtime_config_version ||
    annotation.client_runtime_config_version ||
    annotation.runtime_config_version;
  analysis.collector_environment = annotation.environment;

  row.AZ_locators_json = {
    ...locators,
    analysis,
  };
}

function applyServerQualityGuard(rows, {
  config,
  environment = "production",
  receivedAt = new Date(),
} = {}) {
  const runtimeConfig = config || buildQualityRuntimeConfig({ environment, fetchedAt: receivedAt });
  const quality = runtimeConfig.quality || {};
  const privacy = runtimeConfig.privacy || {};
  const maxTextBytes = toPositiveNumber(quality.max_text_bytes || privacy.max_text_bytes, DEFAULT_MAX_TEXT_BYTES);
  const maxResponseBodyBytes = toPositiveNumber(
    quality.max_response_body_bytes || privacy.max_response_body_bytes,
    DEFAULT_MAX_RESPONSE_BODY_BYTES,
    { min: 0, max: 5000000 }
  );
  const receivedAtIso = receivedAt.toISOString();
  const receivedAtSql = formatSqlDateTime(receivedAt);
  const summary = {
    policy_version: quality.policy_version || QUALITY_POLICY_VERSION,
    runtime_config_version: runtimeConfig.version,
    total_rows: rows.length,
    flagged_rows: 0,
    flags: {},
  };

  const guardedRows = rows.map((input, index) => {
    const row = { ...input };
    const flags = [];
    const generatedFields = [];
    const clientLocators = safeJson(row.AZ_locators_json);
    const clientRuntimeConfigVersion =
      clientLocators?.analysis?.runtime_config_version ||
      clientLocators?.analysis?.server_runtime_config_version ||
      null;

    const mark = (flag) => {
      flags.push(flag);
      summary.flags[flag] = (summary.flags[flag] || 0) + 1;
    };

    if (!row.AZ_event_id) {
      row.AZ_event_id = stableGeneratedId(row, index, environment);
      generatedFields.push("AZ_event_id");
      mark("missing_event_id");
    }

    if (!row.AZ_event_time) {
      row.AZ_event_time = receivedAtSql;
      generatedFields.push("AZ_event_time");
      mark("missing_event_time");
    }

    if (!row.AZ_session_page_id) {
      row.AZ_session_page_id = `server-session-${stableGeneratedId(row, index, environment).slice("server-qg-".length)}`;
      generatedFields.push("AZ_session_page_id");
      mark("missing_page_session_id");
    }

    if (!row.AZ_login_id) {
      row.AZ_login_id = `server-actor:${row.AZ_session_page_id}`;
      generatedFields.push("AZ_login_id");
      mark("missing_login_id");
    }

    if (!row.AZ_event_action) {
      row.AZ_event_action = "collector_diagnostic";
      generatedFields.push("AZ_event_action");
      mark("missing_event_action");
    }

    if (!row.AZ_url) {
      row.AZ_url = "about:blank";
      generatedFields.push("AZ_url");
      mark("missing_page_url");
    }

    for (const [field, value] of [
      ["AZ_element_text", row.AZ_element_text],
      ["AZ_associated_label", row.AZ_associated_label],
      ["AZ_data", row.AZ_data],
    ]) {
      if (byteLength(value) > maxTextBytes) {
        mark(`oversize_${field}`);
      }
    }

    if (byteLength(row.AZ_api_response_body) > maxResponseBodyBytes) {
      mark("oversize_api_response_body");
    }

    if (!clientRuntimeConfigVersion) {
      mark("missing_runtime_config_version");
    }

    if (flags.length) summary.flagged_rows += 1;

    annotateQuality(row, {
      version: 1,
      policy_version: quality.policy_version || QUALITY_POLICY_VERSION,
      environment,
      runtime_config_version: runtimeConfig.version,
      client_runtime_config_version: clientRuntimeConfigVersion,
      received_at: receivedAtIso,
      flags,
      generated_fields: generatedFields,
    });

    return row;
  });

  return {
    rows: guardedRows,
    summary,
  };
}

module.exports = {
  QUALITY_POLICY_VERSION,
  applyServerQualityGuard,
  buildQualityRuntimeConfig,
};
