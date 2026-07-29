"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeOrigin,
  resolveSiteTenantId,
} = require("../src/siteTenant");

test("maps the eXCampus collector origin to its tenant", () => {
  assert.equal(
    resolveSiteTenantId({ AZ_url: "http://211.109.22.33:8791/index.do" }),
    "excampus_211_109_22_33_8791"
  );
});

test("allows deployment config to override a built-in site tenant", () => {
  assert.equal(
    resolveSiteTenantId(
      { AZ_locators_json: { page: { page_url: "http://211.109.22.33:8791/work" } } },
      { "http://211.109.22.33:8791": "customer_override" }
    ),
    "customer_override"
  );
  assert.equal(normalizeOrigin("javascript:alert(1)"), null);
});
