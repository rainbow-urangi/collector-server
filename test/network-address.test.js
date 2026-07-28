"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePublicIp } = require("../src/networkAddress");

test("rejects proxy-local addresses as client identity", () => {
  assert.equal(normalizePublicIp("192.168.219.1"), null);
  assert.equal(normalizePublicIp("172.18.0.1"), null);
  assert.equal(normalizePublicIp("::ffff:10.0.0.1"), null);
});

test("preserves public observed addresses", () => {
  assert.equal(normalizePublicIp("203.0.113.10"), "203.0.113.10");
  assert.equal(normalizePublicIp("2001:db8::1"), "2001:db8::1");
});
