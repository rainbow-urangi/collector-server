"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectDir = path.resolve(__dirname, "..");

async function getAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(port, child) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`collector_server_exited:${child.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("collector_server_health_timeout");
}

async function withServer(overrides, run) {
  const port = await getAvailablePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: String(port),
      API_KEY: "legacy-production-key",
      TENANT_KEYS: "{}",
      TEST_API_KEY: "",
      TEST_TENANT_KEYS: "{}",
      COLLECTOR_DB_ENV: "production",
      DB_HOST: "127.0.0.1",
      DB_PORT: "9",
      DB_USER: "unused",
      DB_PASSWORD: "unused",
      DB_DATABASE: "unused",
      DB_CONNECT_TIMEOUT_MS: "100",
      TEST_DB_HOST: "",
      TEST_DB_PORT: "",
      TEST_DB_USER: "",
      TEST_DB_PASSWORD: "",
      TEST_DB_DATABASE: "",
      PROD_DB_HOST: "",
      PROD_DB_PORT: "",
      PROD_DB_USER: "",
      PROD_DB_PASSWORD: "",
      PROD_DB_DATABASE: "",
      IDENTITY_HMAC_SECRET: "routing-smoke-secret",
      IDENTITY_ALLOCATOR_INTERVAL_MS: "60000",
      ...overrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  try {
    await waitForHealth(port, child);
    await run(port);
  } catch (error) {
    error.message = `${error.message}\n${output}`;
    throw error;
  } finally {
    if (child.exitCode == null) child.kill();
    await new Promise((resolve) => {
      if (child.exitCode != null) return resolve();
      child.once("exit", resolve);
      setTimeout(resolve, 2000).unref();
    });
  }
}

test("keeps the existing production key and runtime-config behavior", async () => {
  await withServer({}, async (port) => {
    const authorized = await fetch(`http://127.0.0.1:${port}/collector/runtime-config`, {
      headers: { "x-api-key": "legacy-production-key" },
    });
    const config = await authorized.json();
    assert.equal(authorized.status, 200);
    assert.equal(config.schema_version, 1);
    assert.equal(config.privacy.remote_code_execution, false);
    assert.equal(config.quality.contract, "raw_preserved_derived_annotated");
    assert.equal(config.modules.quality_guard.enabled, true);

    const unauthorized = await fetch(`http://127.0.0.1:${port}/collector/runtime-config`, {
      headers: { "x-api-key": "unknown-key" },
    });
    assert.equal(unauthorized.status, 401);
  });
});

test("self-enrolls a config-free extension into production routing", async () => {
  await withServer({}, async (port) => {
    const bootstrap = await fetch(`http://127.0.0.1:${port}/ingest/batch?bootstrap=device-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installation_id: "install-routing-smoke-123456",
        extension_id: "abcdefghijklmnopabcdefghijklmnop",
      }),
    });
    const enrollment = await bootstrap.json();
    assert.equal(bootstrap.status, 200);
    assert.equal(enrollment.collector_environment, "production");
    assert.equal(typeof enrollment.access_token, "string");

    const runtimeConfig = await fetch(`http://127.0.0.1:${port}/ingest/batch?runtime_config=1`, {
      headers: { Authorization: `Bearer ${enrollment.access_token}` },
    });
    assert.equal(runtimeConfig.status, 200);

    const ingest = await fetch(`http://127.0.0.1:${port}/ingest/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${enrollment.access_token}`,
      },
      body: JSON.stringify({ rows: [] }),
    });
    const ingestBody = await ingest.json();
    assert.equal(ingest.status, 400);
    assert.equal(ingestBody.error, "empty_rows");
  });
});

test("fails closed when a test key has no test database pool", async () => {
  await withServer({
    TEST_API_KEY: "test_key",
    TEST_TENANT_ID: "test_company",
  }, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/ingest/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "test_key",
      },
      body: JSON.stringify({
        rows: [{
          AZ_event_id: "routing-smoke-test",
          AZ_event_time: "2026-06-25 12:00:00.000000",
          AZ_event_action: "page_view",
          AZ_url: "https://example.com",
        }],
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error, "collector_database_unavailable");
    assert.equal(body.collector_environment, "test");
  });
});

test("selects the configured test pool without changing production routing", async () => {
  await withServer({
    TEST_API_KEY: "test_key",
    TEST_TENANT_ID: "test_company",
    TEST_DB_HOST: "127.0.0.1",
    TEST_DB_PORT: "8",
    TEST_DB_USER: "unused",
    TEST_DB_PASSWORD: "unused",
    TEST_DB_DATABASE: "unused_test",
    TEST_DB_CONNECT_TIMEOUT_MS: "100",
  }, async (port) => {
    const testResponse = await fetch(`http://127.0.0.1:${port}/ingest/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "test_key",
      },
      body: JSON.stringify({ rows: [] }),
    });
    assert.equal(testResponse.status, 400);

    const productionResponse = await fetch(`http://127.0.0.1:${port}/ingest/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "legacy-production-key",
      },
      body: JSON.stringify({ rows: [] }),
    });
    assert.equal(productionResponse.status, 400);
  });
});

test("serves self-hosted extension update XML and CRX artifacts", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "collector-update-route-"));
  const crxDir = path.join(tempDir, "crx");
  const crxFile = "rainbow-collector-9.9.9.crx";
  const releasesPath = path.join(tempDir, "releases.json");
  fs.mkdirSync(crxDir, { recursive: true });
  fs.writeFileSync(path.join(crxDir, crxFile), "fake-crx");
  fs.writeFileSync(releasesPath, JSON.stringify({
    default_extension: "rainbow-collector",
    extensions: {
      "rainbow-collector": {
        extension_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        channels: {
          stable: {
            version: "9.9.9",
            crx_path: crxFile,
          },
        },
      },
    },
  }));

  try {
    await withServer({
      COLLECTOR_EXTENSION_RELEASES_PATH: releasesPath,
      COLLECTOR_EXTENSION_CRX_DIR: crxDir,
      COLLECTOR_EXTENSION_UPDATE_BASE_URL: "https://updates.example.com",
    }, async (port) => {
      const xmlResponse = await fetch(`http://127.0.0.1:${port}/extension/update/default/stable/updates.xml`);
      const xml = await xmlResponse.text();
      assert.equal(xmlResponse.status, 200);
      assert.match(xml, /appid="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/);
      assert.match(xml, /codebase="https:\/\/updates\.example\.com\/extension\/crx\/rainbow-collector-9\.9\.9\.crx"/);

      const crxResponse = await fetch(`http://127.0.0.1:${port}/extension/crx/${crxFile}`);
      assert.equal(crxResponse.status, 200);
      assert.equal(crxResponse.headers.get("content-type"), "application/x-chrome-extension");
      assert.equal(await crxResponse.text(), "fake-crx");
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
