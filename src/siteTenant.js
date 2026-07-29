"use strict";

const DEFAULT_SITE_TENANT_MAP = Object.freeze({
  "http://211.109.22.33:8791": "excampus_211_109_22_33_8791",
});

function safeObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeOrigin(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeSiteTenantMap(value = {}) {
  const normalized = {};
  for (const [site, tenantId] of Object.entries(value || {})) {
    const origin = normalizeOrigin(site);
    const tenant = typeof tenantId === "string" ? tenantId.trim() : "";
    if (!origin || !tenant || tenant.length > 128) continue;
    normalized[origin] = tenant;
  }
  return normalized;
}

function sourcePageUrlOf(row) {
  if (typeof row?.AZ_url === "string" && row.AZ_url.trim()) return row.AZ_url;
  if (typeof row?.page_url === "string" && row.page_url.trim()) return row.page_url;
  const locators = safeObject(row?.AZ_locators_json);
  return locators?.page?.page_url || locators?.session?.page_url || null;
}

function resolveSiteTenantId(row, configuredMap = {}) {
  const origin = normalizeOrigin(sourcePageUrlOf(row));
  if (!origin) return null;
  const map = {
    ...DEFAULT_SITE_TENANT_MAP,
    ...normalizeSiteTenantMap(configuredMap),
  };
  return map[origin] || null;
}

module.exports = {
  DEFAULT_SITE_TENANT_MAP,
  normalizeOrigin,
  normalizeSiteTenantMap,
  resolveSiteTenantId,
};
