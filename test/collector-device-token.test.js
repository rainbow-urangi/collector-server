"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  issueCollectorDeviceToken,
  verifyCollectorDeviceToken,
} = require("../src/collectorDeviceToken");

const secret = "collector-device-token-test-secret";
const identity = {
  installationId: "install-1234567890abcdef",
  extensionId: "abcdefghijklmnopabcdefghijklmnop",
};

test("collector device token round-trips production identity", () => {
  const issued = issueCollectorDeviceToken({ ...identity, nowMs: 1000000, ttlMs: 600000 }, secret);
  const claims = verifyCollectorDeviceToken(issued.token, secret, 1100000);
  assert.equal(claims.sub, identity.installationId);
  assert.equal(claims.ext, identity.extensionId);
  assert.equal(claims.env, "production");
});

test("collector device token rejects tampering and expiration", () => {
  const issued = issueCollectorDeviceToken({ ...identity, nowMs: 1000000, ttlMs: 300000 }, secret);
  assert.equal(verifyCollectorDeviceToken(`${issued.token}x`, secret, 1100000), null);
  assert.equal(verifyCollectorDeviceToken(issued.token, secret, 1400000), null);
});
