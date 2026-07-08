import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const chromePath =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sourceDir = path.resolve(
  process.env.COLLECTOR_EXTENSION_SOURCE_DIR ||
    path.join(projectRoot, "..", "rainbow_visualization_test", "collector_test", "extension")
);
const outputRoot = path.resolve(
  process.env.COLLECTOR_EXTENSION_OUTPUT_DIR ||
    path.join(projectRoot, "extension-updates")
);
const buildRoot = path.join(outputRoot, "build");
const crxRoot = path.join(outputRoot, "crx");
const privateRoot = path.join(outputRoot, "private");
const keyPath = path.resolve(
  process.env.COLLECTOR_EXTENSION_PRIVATE_KEY ||
    path.join(privateRoot, "rainbow-collector.pem")
);
const customer = normalizeSegment(process.env.COLLECTOR_EXTENSION_CUSTOMER || "default");
const channel = normalizeSegment(process.env.COLLECTOR_EXTENSION_CHANNEL || "stable");
const updateBaseUrl = String(
  process.env.COLLECTOR_EXTENSION_UPDATE_BASE_URL ||
    "http://127.0.0.1:8080"
).replace(/\/+$/, "");
const updateUrl =
  process.env.COLLECTOR_EXTENSION_UPDATE_URL ||
  `${updateBaseUrl}/extension/update/${customer}/${channel}/updates.xml`;

function normalizeSegment(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensureCleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function waitForExists(filePath, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (await exists(filePath)) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

function runChromePack(extensionDir, keyFile = null) {
  return new Promise((resolve, reject) => {
    const args = [`--pack-extension=${extensionDir}`];
    if (keyFile) args.push(`--pack-extension-key=${keyFile}`);
    const child = spawn(chromePath, args, {
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
        reject(new Error(`chrome_pack_failed:${code}\n${stdout}\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function extensionIdFromPem(pem) {
  const publicKeyDer = crypto.createPublicKey(pem).export({
    type: "spki",
    format: "der",
  });
  const hash = crypto.createHash("sha256").update(publicKeyDer).digest();
  const alphabet = "abcdefghijklmnop";
  let id = "";
  for (let index = 0; index < 16; index += 1) {
    const byte = hash[index];
    id += alphabet[(byte >> 4) & 0x0f];
    id += alphabet[byte & 0x0f];
  }
  return id;
}

function buildUpdateXml({ extensionId, version, crxFile }) {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<gupdate xmlns=\"http://www.google.com/update2/response\" protocol=\"2.0\">",
    `  <app appid="${extensionId}">`,
    `    <updatecheck codebase="${updateBaseUrl}/extension/crx/${encodeURIComponent(crxFile)}" version="${version}" />`,
    "  </app>",
    "</gupdate>",
    "",
  ].join("\n");
}

async function main() {
  const sourceManifest = await readJson(path.join(sourceDir, "manifest.json"));
  const version = String(process.env.COLLECTOR_EXTENSION_VERSION || sourceManifest.version || "").trim();
  if (!version) throw new Error("COLLECTOR_EXTENSION_VERSION or source manifest version is required");

  await fs.mkdir(crxRoot, { recursive: true });
  await fs.mkdir(privateRoot, { recursive: true });
  await ensureCleanDir(buildRoot);

  const buildDir = path.join(buildRoot, "rainbow-collector");
  await fs.cp(sourceDir, buildDir, {
    recursive: true,
    filter: (src) => {
      const name = path.basename(src);
      return ![".pem", ".crx"].includes(path.extname(name).toLowerCase());
    },
  });

  const manifestPath = path.join(buildDir, "manifest.json");
  const manifest = await readJson(manifestPath);
  manifest.version = version;
  manifest.update_url = updateUrl;
  if (process.env.COLLECTOR_EXTENSION_VERSION_NAME) {
    manifest.version_name = process.env.COLLECTOR_EXTENSION_VERSION_NAME;
  }
  await writeJson(manifestPath, manifest);

  const hasKey = await exists(keyPath);
  await runChromePack(buildDir, hasKey ? keyPath : null);

  const sourceCrx = `${buildDir}.crx`;
  const generatedPem = `${buildDir}.pem`;
  if (!await waitForExists(sourceCrx)) throw new Error(`packed_crx_missing:${sourceCrx}`);
  if (!hasKey) {
    if (!await waitForExists(generatedPem)) throw new Error(`generated_key_missing:${generatedPem}`);
    await fs.rename(generatedPem, keyPath);
  } else if (await exists(generatedPem)) {
    await fs.rm(generatedPem, { force: true });
  }

  const pem = await fs.readFile(keyPath, "utf8");
  const extensionId = extensionIdFromPem(pem);
  const crxFile = `rainbow-collector-${version}.crx`;
  const targetCrx = path.join(crxRoot, crxFile);
  await fs.rm(targetCrx, { force: true });
  await fs.rename(sourceCrx, targetCrx);

  const releases = {
    schema_version: 1,
    default_extension: "rainbow-collector",
    default_channel: channel,
    generated_at: new Date().toISOString(),
    extensions: {
      "rainbow-collector": {
        extension_id: extensionId,
        channels: {
          [channel]: {
            version,
            crx_path: crxFile,
          },
        },
        customers: {
          [customer]: {
            [channel]: {
              version,
              crx_path: crxFile,
            },
          },
        },
      },
    },
  };
  await writeJson(path.join(outputRoot, "releases.json"), releases);
  await writeJson(path.join(outputRoot, "metadata.json"), {
    extension_id: extensionId,
    version,
    update_url: updateUrl,
    crx_path: targetCrx,
    releases_path: path.join(outputRoot, "releases.json"),
    private_key_path: keyPath,
    chrome_path: chromePath,
  });
  await fs.writeFile(
    path.join(outputRoot, "updates.xml"),
    buildUpdateXml({ extensionId, version, crxFile }),
    "utf8"
  );
  await writeJson(path.join(outputRoot, "extension-install-forcelist.json"), [
    `${extensionId};${updateUrl}`,
  ]);
  await writeJson(path.join(outputRoot, "extension-settings.policy.json"), {
    [extensionId]: {
      installation_mode: "force_installed",
      update_url: updateUrl,
      override_update_url: true,
    },
  });

  console.log(JSON.stringify({
    ok: true,
    extension_id: extensionId,
    version,
    update_url: updateUrl,
    crx_path: targetCrx,
    releases_path: path.join(outputRoot, "releases.json"),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
