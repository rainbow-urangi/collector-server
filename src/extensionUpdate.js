"use strict";

const fs = require("fs");
const path = require("path");

const UPDATE_XML_CONTENT_TYPE = "application/xml; charset=utf-8";
const CRX_CONTENT_TYPE = "application/x-chrome-extension";

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeSegment(value, fallback) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function resolveBaseUrl(req, env = process.env) {
  const configured = String(env.COLLECTOR_EXTENSION_UPDATE_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
  return `${protocol}://${req.get("host")}`;
}

function readReleaseCatalog(releasesPath) {
  const raw = fs.readFileSync(releasesPath, "utf8");
  const catalog = JSON.parse(raw);
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("invalid_extension_release_catalog");
  }
  return catalog;
}

function selectExtension(catalog, extensionKey = null) {
  const key = extensionKey || catalog.default_extension || Object.keys(catalog.extensions || {})[0];
  const extension = catalog.extensions?.[key];
  if (!extension) throw new Error(`unknown_extension_release:${key || "default"}`);
  return { key, extension };
}

function resolveRelease(catalog, options = {}) {
  const customer = normalizeSegment(options.customer, "default");
  const channel = normalizeSegment(options.channel, catalog.default_channel || "stable");
  const { key, extension } = selectExtension(catalog, options.extension);
  const customerRelease = extension.customers?.[customer]?.[channel];
  const channelRelease = extension.channels?.[channel];
  const release = customerRelease || channelRelease;
  if (!release) {
    throw new Error(`unknown_extension_channel:${key}:${customer}:${channel}`);
  }
  if (release.enabled === false) {
    throw new Error(`disabled_extension_channel:${key}:${customer}:${channel}`);
  }

  const extensionId = release.extension_id || extension.extension_id;
  const version = release.version;
  const crxPath = release.crx_path || release.crx || release.file;
  if (!extensionId || !version || !crxPath) {
    throw new Error(`incomplete_extension_release:${key}:${customer}:${channel}`);
  }

  return {
    key,
    customer,
    channel,
    extension_id: extensionId,
    version,
    crx_path: crxPath,
    codebase: release.codebase || null,
    prodversionmin: release.prodversionmin || release.min_chrome_version || extension.prodversionmin || null,
  };
}

function buildUpdateXml(release, baseUrl) {
  const codebase = release.codebase && isAbsoluteHttpUrl(release.codebase)
    ? release.codebase
    : `${baseUrl.replace(/\/+$/, "")}/extension/crx/${encodeURIComponent(path.basename(release.crx_path))}`;
  const prodVersionMin = release.prodversionmin
    ? ` prodversionmin="${xmlEscape(release.prodversionmin)}"`
    : "";

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<gupdate xmlns=\"http://www.google.com/update2/response\" protocol=\"2.0\">",
    `  <app appid="${xmlEscape(release.extension_id)}">`,
    `    <updatecheck codebase="${xmlEscape(codebase)}" version="${xmlEscape(release.version)}"${prodVersionMin} />`,
    "  </app>",
    "</gupdate>",
    "",
  ].join("\n");
}

function resolveCrxPath(crxRoot, fileName) {
  const safeName = path.basename(String(fileName || ""));
  if (!safeName || safeName !== fileName || !safeName.endsWith(".crx")) {
    throw new Error("invalid_crx_file");
  }
  const root = path.resolve(crxRoot);
  const filePath = path.resolve(root, safeName);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("invalid_crx_path");
  }
  return filePath;
}

function registerExtensionUpdateRoutes(app, options = {}) {
  const env = options.env || process.env;
  const releasesPath = path.resolve(
    env.COLLECTOR_EXTENSION_RELEASES_PATH ||
      path.join(__dirname, "..", "extension-updates", "releases.json")
  );
  const crxRoot = path.resolve(
    env.COLLECTOR_EXTENSION_CRX_DIR ||
      path.join(path.dirname(releasesPath), "crx")
  );

  function sendUpdateXml(req, res, routeOptions) {
    try {
      const catalog = readReleaseCatalog(releasesPath);
      const release = resolveRelease(catalog, routeOptions);
      const xml = buildUpdateXml(release, resolveBaseUrl(req, env));
      res.set({
        "Content-Type": UPDATE_XML_CONTENT_TYPE,
        "Cache-Control": "no-store",
      });
      res.status(200).send(xml);
    } catch (error) {
      res.status(404).json({
        error: "extension_update_unavailable",
        message: String(error?.message || error),
      });
    }
  }

  app.get("/extension/update/:customer/:channel/updates.xml", (req, res) => {
    sendUpdateXml(req, res, {
      customer: req.params.customer,
      channel: req.params.channel,
      extension: req.query.extension,
    });
  });

  app.get("/extension/update/:channel/updates.xml", (req, res) => {
    sendUpdateXml(req, res, {
      customer: "default",
      channel: req.params.channel,
      extension: req.query.extension,
    });
  });

  app.get("/extension/crx/:file", (req, res) => {
    try {
      const filePath = resolveCrxPath(crxRoot, req.params.file);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "crx_not_found" });
        return;
      }
      res.set({
        "Content-Type": CRX_CONTENT_TYPE,
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      res.sendFile(filePath);
    } catch (error) {
      res.status(400).json({
        error: "invalid_crx_request",
        message: String(error?.message || error),
      });
    }
  });

  app.get("/extension/update/healthz", (_req, res) => {
    res.json({
      ok: true,
      releases_path: releasesPath,
      crx_root: crxRoot,
      configured: fs.existsSync(releasesPath),
    });
  });
}

module.exports = {
  buildUpdateXml,
  readReleaseCatalog,
  registerExtensionUpdateRoutes,
  resolveCrxPath,
  resolveRelease,
};
