"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyCollectorIdentityContext,
  normalizeSubject,
  sessionUserIdOf,
} = require("../src/collectorIdentityContext");
const { applyIdentity } = require("../src/identity");

test("uses collector identity for session mapping without persisting the raw subject in locators", () => {
  const row = applyCollectorIdentityContext({
    AZ_login_id: "session:old",
    AZ_locators_json: {
      identity_context: {
        subject: " scenario-user-11 ",
        source: "manual_poc_override",
        confidence: "poc",
      },
    },
  });

  assert.equal(row.AZ_login_id, "scenario-user-11");
  assert.equal(sessionUserIdOf(row), "scenario-user-11");
  assert.equal(row.AZ_locators_json.identity_context.source, "manual_poc_override");
  assert.equal(row.AZ_locators_json.identity_context.subject, undefined);
  assert.equal(row.AZ_locators_json.identity_context.subject_present, true);
});

test("rejects invalid or untrusted identity contexts", () => {
  assert.equal(normalizeSubject("\u0000bad"), null);
  const row = applyCollectorIdentityContext({
    AZ_login_id: "session:old",
    AZ_locators_json: {
      identity_context: {
        subject: "forged-user",
        source: "unknown_source",
      },
    },
  });
  assert.equal(row.AZ_login_id, "session:old");
  assert.equal(sessionUserIdOf(row), null);
});

test("keeps the readable session ID while deriving the existing tenant-scoped actor ID", () => {
  const row = applyIdentity(applyCollectorIdentityContext({
    _tenant_id: "tenant-a",
    AZ_session_install_id: "install-0123456789abcdef",
    AZ_locators_json: {
      identity_context: {
        subject: "site-user-1",
        source: "site_authenticated_user",
        confidence: "verified",
      },
    },
  }), "0123456789abcdef0123456789abcdef");

  assert.equal(sessionUserIdOf(row), "site-user-1");
  assert.match(row.AZ_login_id, /^[a-f0-9]{64}$/);
  assert.match(row._account_id, /^[a-f0-9]{64}$/);
  assert.notEqual(row.AZ_login_id, row._account_id);
});
