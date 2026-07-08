"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildUpdateXml,
  resolveCrxPath,
  resolveRelease,
} = require("../src/extensionUpdate");

test("builds Chrome update XML for a selected release", () => {
  const xml = buildUpdateXml({
    extension_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    version: "1.2.3",
    crx_path: "rainbow-collector-1.2.3.crx",
  }, "https://updates.example.com");

  assert.match(xml, /<gupdate xmlns="http:\/\/www\.google\.com\/update2\/response" protocol="2\.0">/);
  assert.match(xml, /appid="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/);
  assert.match(xml, /codebase="https:\/\/updates\.example\.com\/extension\/crx\/rainbow-collector-1\.2\.3\.crx"/);
  assert.match(xml, /version="1\.2\.3"/);
});

test("selects customer channel before global channel", () => {
  const catalog = {
    default_extension: "rainbow-collector",
    extensions: {
      "rainbow-collector": {
        extension_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        channels: {
          stable: {
            version: "1.0.0",
            crx_path: "rainbow-collector-1.0.0.crx",
          },
        },
        customers: {
          "customer-a": {
            stable: {
              version: "1.0.1",
              crx_path: "rainbow-collector-1.0.1.crx",
            },
          },
        },
      },
    },
  };

  assert.equal(resolveRelease(catalog, { channel: "stable" }).version, "1.0.0");
  assert.equal(resolveRelease(catalog, { customer: "customer-a", channel: "stable" }).version, "1.0.1");
});

test("rejects CRX path traversal", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "collector-crx-"));
  try {
    assert.equal(
      resolveCrxPath(tempDir, "rainbow-collector-1.0.0.crx"),
      path.join(tempDir, "rainbow-collector-1.0.0.crx")
    );
    assert.throws(() => resolveCrxPath(tempDir, "../secret.crx"), /invalid_crx_file/);
    assert.throws(() => resolveCrxPath(tempDir, "not-a-crx.zip"), /invalid_crx_file/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
