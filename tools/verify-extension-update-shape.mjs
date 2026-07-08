import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { applyServerQualityGuard } = require("../src/collectorQuality");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourceExtensionDir = path.resolve(projectRoot, "..", "rainbow_visualization_test", "collector_test", "extension");
const variantRoot = path.resolve(projectRoot, "tmp", "extension-update-shape");
const updateBaseUrl = process.env.COLLECTOR_EXTENSION_UPDATE_BASE_URL || "http://127.0.0.1:8080";

const variants = [
  {
    key: "before",
    version: "0.1.20",
    build: "shape-test-before-v1",
    runtimeConfigVersion: "shape-config-before",
  },
  {
    key: "after",
    version: "0.1.21",
    build: "shape-test-after-v2",
    runtimeConfigVersion: "shape-config-after",
  },
];

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runNode(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`script_failed:${script}:${code}\n${stdout}\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function makeVariantSource(variant) {
  const dir = path.join(variantRoot, variant.key);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(dir), { recursive: true });
  await fs.cp(sourceExtensionDir, dir, { recursive: true });

  const manifestPath = path.join(dir, "manifest.json");
  const manifest = await readJson(manifestPath);
  manifest.name = `Rainbow Collector Shape Test ${variant.key}`;
  manifest.version = variant.version;
  manifest.version_name = `${variant.version}-${variant.key}`;
  await writeJson(manifestPath, manifest);

  const contentPath = path.join(dir, "content.js");
  const content = await fs.readFile(contentPath, "utf8");
  const replaced = content.replace(
    /const COLLECTOR_BUILD = ".*?";/,
    `const COLLECTOR_BUILD = "${variant.build}";`
  );
  if (replaced === content) throw new Error("collector_build_marker_not_replaced");
  await fs.writeFile(contentPath, replaced, "utf8");

  return dir;
}

function sampleRow(variant) {
  return {
    AZ_event_id: `shape-${variant.key}-event-1`,
    AZ_event_time: "2026-06-29 12:00:00.000",
    AZ_event_action: "collector_boot",
    AZ_url: "https://shape-test.example/work",
    AZ_session_page_id: `shape-session-${variant.key}`,
    AZ_login_id: `shape-user-${variant.key}`,
    AZ_locators_json: {
      analysis: {
        collector_build: variant.build,
        runtime_config_version: variant.runtimeConfigVersion,
        runtime_config_schema_version: 1,
      },
      raw_payload: {
        collector_build: variant.build,
        runtime_config_version: variant.runtimeConfigVersion,
      },
    },
  };
}

async function packageVariant(variant) {
  const sourceDir = await makeVariantSource(variant);
  const result = await runNode("tools/package-extension-crx.mjs", {
    COLLECTOR_EXTENSION_SOURCE_DIR: sourceDir,
    COLLECTOR_EXTENSION_VERSION: variant.version,
    COLLECTOR_EXTENSION_VERSION_NAME: `${variant.version}-${variant.key}`,
    COLLECTOR_EXTENSION_UPDATE_BASE_URL: updateBaseUrl,
  });
  return JSON.parse(result.stdout);
}

async function main() {
  const before = await packageVariant(variants[0]);
  const after = await packageVariant(variants[1]);

  assert.equal(after.extension_id, before.extension_id, "extension_id must stay stable across update builds");
  assert.equal(after.version, variants[1].version);

  const releases = await readJson(path.join(projectRoot, "extension-updates", "releases.json"));
  const stable = releases.extensions["rainbow-collector"].channels.stable;
  assert.equal(stable.version, variants[1].version);
  assert.equal(stable.crx_path, `rainbow-collector-${variants[1].version}.crx`);

  const updateXml = await fs.readFile(path.join(projectRoot, "extension-updates", "updates.xml"), "utf8");
  assert.match(updateXml, new RegExp(`appid="${after.extension_id}"`));
  assert.match(updateXml, new RegExp(`version="${variants[1].version}"`));
  assert.match(updateXml, new RegExp(`rainbow-collector-${variants[1].version}\\.crx`));

  const guarded = applyServerQualityGuard(variants.map(sampleRow), {
    environment: "test",
    receivedAt: new Date("2026-06-29T12:00:01.000Z"),
  });

  assert.equal(guarded.rows.length, 2);
  for (const [index, variant] of variants.entries()) {
    const analysis = guarded.rows[index].AZ_locators_json.analysis;
    assert.equal(analysis.collector_build, variant.build);
    assert.equal(analysis.effective_runtime_config_version, variant.runtimeConfigVersion);
    assert.deepEqual(analysis.server_quality_guard.flags, []);
  }

  console.log(JSON.stringify({
    ok: true,
    extension_id: after.extension_id,
    before: {
      version: before.version,
      collector_build: variants[0].build,
      crx_path: before.crx_path,
    },
    after: {
      version: after.version,
      collector_build: variants[1].build,
      crx_path: after.crx_path,
    },
    update_manifest_points_to: stable,
    data_shape_preserved: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
