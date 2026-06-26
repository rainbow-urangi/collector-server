"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  normalizeEnvironment,
  parseKeyMap,
  readKeyMapFromEnvironment,
  resolveCollectorIdentity,
  validateDatabaseSeparation,
  validateKeySeparation,
} = require("../src/collectorRouting");

const options = {
  productionApiKey: "prod-root",
  productionTenantId: null,
  productionTenantKeys: {
    "prod-company-a": "company_a",
  },
  testApiKey: "test_key",
  testTenantId: "test_company",
  testTenantKeys: {
    "test-company-b": "test_company_b",
  },
};

test("keeps production API key routing backward compatible", () => {
  assert.deepEqual(resolveCollectorIdentity("prod-root", options), {
    environment: "production",
    tenantId: null,
  });
});

test("routes test_key only to the test environment", () => {
  assert.deepEqual(resolveCollectorIdentity("test_key", options), {
    environment: "test",
    tenantId: "test_company",
  });
});

test("routes tenant keys to their configured environments", () => {
  assert.equal(resolveCollectorIdentity("prod-company-a", options).environment, "production");
  assert.equal(resolveCollectorIdentity("test-company-b", options).environment, "test");
});

test("rejects unknown keys", () => {
  assert.equal(resolveCollectorIdentity("unknown", options), null);
});

test("rejects keys configured in both environments", () => {
  assert.throws(() => validateKeySeparation({
    ...options,
    testApiKey: "prod-root",
  }), /collector_key_environment_overlap/);
});

test("validates environment and key map formats", () => {
  assert.equal(normalizeEnvironment("TEST"), "test");
  assert.deepEqual(parseKeyMap('{"key":"tenant"}', "tenant_keys"), { key: "tenant" });
  assert.throws(() => normalizeEnvironment("staging"), /invalid_collector_environment/);
  assert.throws(() => parseKeyMap("[]", "tenant_keys"), /invalid_tenant_keys_object/);
});

test("supports the existing multiline TENANT_KEYS .env format", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "collector-routing-"));
  const envPath = path.join(tempDir, ".env");
  fs.writeFileSync(envPath, [
    "TENANT_KEYS={",
    "  \"test_key\":\"test_company\",",
    "  \"prod_key\":\"prod_company\"",
    "}",
  ].join("\n"));

  const previous = process.env.TENANT_KEYS;
  process.env.TENANT_KEYS = "{";
  try {
    assert.deepEqual(
      readKeyMapFromEnvironment("TENANT_KEYS", "tenant_keys", envPath),
      {
        test_key: "test_company",
        prod_key: "prod_company",
      }
    );
  } finally {
    if (previous === undefined) delete process.env.TENANT_KEYS;
    else process.env.TENANT_KEYS = previous;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("rejects test and production pools that point to the same database", () => {
  const production = {
    host: "db.internal",
    port: 3306,
    database: "ingest_backend_db",
  };
  assert.throws(
    () => validateDatabaseSeparation(production, { ...production }),
    /test_and_production_database_must_differ/
  );
  assert.doesNotThrow(() => validateDatabaseSeparation(production, {
    ...production,
    database: "ingest_backend_test_db",
  }));
});
