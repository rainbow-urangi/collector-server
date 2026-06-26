"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  QUALITY_POLICY_VERSION,
  applyServerQualityGuard,
  buildQualityRuntimeConfig,
} = require("../src/collectorQuality");

test("builds a quality-first runtime config without remote code execution", () => {
  const config = buildQualityRuntimeConfig({
    environment: "test",
    fetchedAt: new Date("2026-06-26T00:00:00.000Z"),
    env: {
      COLLECTOR_RUNTIME_CONFIG_VERSION: "quality-test-config",
      COLLECTOR_RUNTIME_PRIVACY_JSON: '{"remote_code_execution":true,"max_text_bytes":1234}',
      COLLECTOR_RUNTIME_MODULES_JSON: '{"websocket_hooks":{"enabled":false}}',
    },
  });

  assert.equal(config.version, "quality-test-config");
  assert.equal(config.environment, "test");
  assert.equal(config.privacy.remote_code_execution, false);
  assert.equal(config.privacy.max_text_bytes, 1234);
  assert.equal(config.quality.policy_version, QUALITY_POLICY_VERSION);
  assert.equal(config.quality.contract, "raw_preserved_derived_annotated");
  assert.equal(config.modules.dom_events.enabled, true);
  assert.equal(config.modules.quality_guard.enabled, true);
  assert.equal(config.modules.websocket_hooks.enabled, false);
});

test("annotates missing core fields without dropping the row", () => {
  const config = buildQualityRuntimeConfig({
    environment: "test",
    fetchedAt: new Date("2026-06-26T00:00:00.000Z"),
    env: { COLLECTOR_RUNTIME_CONFIG_VERSION: "quality-test-config" },
  });
  const result = applyServerQualityGuard([
    {
      AZ_element_text: "button",
      AZ_locators_json: {
        analysis: {
          existing_signal: "kept",
        },
      },
    },
  ], {
    config,
    environment: "test",
    receivedAt: new Date("2026-06-26T01:02:03.004Z"),
  });

  assert.equal(result.rows.length, 1);
  const row = result.rows[0];
  assert.match(row.AZ_event_id, /^server-qg-/);
  assert.equal(row.AZ_event_time, "2026-06-26 01:02:03.004");
  assert.match(row.AZ_session_page_id, /^server-session-/);
  assert.equal(row.AZ_event_action, "collector_diagnostic");
  assert.equal(row.AZ_url, "about:blank");
  assert.equal(row.AZ_locators_json.analysis.existing_signal, "kept");
  assert.deepEqual(row.AZ_locators_json.analysis.server_quality_guard.flags, [
    "missing_event_id",
    "missing_event_time",
    "missing_page_session_id",
    "missing_event_action",
    "missing_page_url",
    "missing_runtime_config_version",
  ]);
  assert.equal(result.summary.flagged_rows, 1);
  assert.equal(result.summary.flags.missing_event_id, 1);
});

test("preserves client runtime version and flags oversize API bodies", () => {
  const config = buildQualityRuntimeConfig({
    environment: "production",
    env: {
      COLLECTOR_RUNTIME_CONFIG_VERSION: "server-config",
      COLLECTOR_RUNTIME_QUALITY_JSON: '{"max_response_body_bytes":5}',
    },
  });
  const result = applyServerQualityGuard([
    {
      AZ_event_id: "event-1",
      AZ_event_time: "2026-06-26 12:00:00.000",
      AZ_event_action: "fetch_response",
      AZ_url: "https://example.com",
      AZ_session_page_id: "page-1",
      AZ_api_response_body: "123456",
      AZ_locators_json: JSON.stringify({
        analysis: {
          runtime_config_version: "client-config",
        },
      }),
    },
  ], {
    config,
    environment: "production",
    receivedAt: new Date("2026-06-26T01:02:03.004Z"),
  });

  const analysis = result.rows[0].AZ_locators_json.analysis;
  assert.equal(analysis.effective_runtime_config_version, "client-config");
  assert.equal(analysis.server_runtime_config_version, "server-config");
  assert.deepEqual(analysis.server_quality_guard.flags, ["oversize_api_response_body"]);
  assert.equal(result.summary.flags.oversize_api_response_body, 1);
});
