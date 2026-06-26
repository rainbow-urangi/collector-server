"use strict";

const fs = require("node:fs");
const path = require("node:path");

const VALID_ENVIRONMENTS = new Set(["production", "test"]);

function normalizeEnvironment(value, fallback = "production") {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (!VALID_ENVIRONMENTS.has(normalized)) {
    throw new Error(`invalid_collector_environment:${normalized}`);
  }
  return normalized;
}

function parseKeyMap(value, name) {
  if (!value || !String(value).trim()) return {};

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`invalid_${name}_json`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`invalid_${name}_object`);
  }

  const normalized = {};
  for (const [key, tenantId] of Object.entries(parsed)) {
    const normalizedKey = String(key || "").trim();
    const normalizedTenantId = String(tenantId || "").trim();
    if (!normalizedKey || !normalizedTenantId) {
      throw new Error(`invalid_${name}_entry`);
    }
    normalized[normalizedKey] = normalizedTenantId;
  }
  return normalized;
}

function readRawEnvValue(variableName, envPath = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(envPath)) return null;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  const prefix = `${variableName}=`;
  const startIndex = lines.findIndex((line) => line.trimStart().startsWith(prefix));
  if (startIndex < 0) return null;

  const firstLine = lines[startIndex].trimStart();
  const chunks = [firstLine.slice(prefix.length)];
  let braceDepth = 0;
  let insideString = false;
  let escaped = false;

  const scan = (text) => {
    for (const char of text) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (insideString && char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        insideString = !insideString;
        continue;
      }
      if (!insideString && char === "{") braceDepth += 1;
      if (!insideString && char === "}") braceDepth -= 1;
    }
  };

  scan(chunks[0]);
  for (let index = startIndex + 1; braceDepth > 0 && index < lines.length; index += 1) {
    chunks.push(lines[index]);
    scan(lines[index]);
  }

  return chunks.join("\n").trim();
}

function readKeyMapFromEnvironment(variableName, name, envPath) {
  const value = process.env[variableName];
  try {
    return parseKeyMap(value, name);
  } catch (error) {
    const rawValue = readRawEnvValue(variableName, envPath);
    if (rawValue && rawValue !== value) {
      return parseKeyMap(rawValue, name);
    }
    throw error;
  }
}

function validateKeySeparation({
  productionApiKey,
  productionTenantKeys,
  testApiKey,
  testTenantKeys,
}) {
  const productionKeys = new Set([
    productionApiKey,
    ...Object.keys(productionTenantKeys),
  ].filter(Boolean));

  for (const key of [testApiKey, ...Object.keys(testTenantKeys)].filter(Boolean)) {
    if (productionKeys.has(key)) {
      throw new Error("collector_key_environment_overlap");
    }
  }
}

function resolveCollectorIdentity(key, options) {
  const normalizedKey = typeof key === "string" ? key.trim() : "";
  if (!normalizedKey) return null;

  if (options.testApiKey && normalizedKey === options.testApiKey) {
    return {
      environment: "test",
      tenantId: options.testTenantId || null,
    };
  }

  if (Object.prototype.hasOwnProperty.call(options.testTenantKeys, normalizedKey)) {
    return {
      environment: "test",
      tenantId: options.testTenantKeys[normalizedKey],
    };
  }

  if (options.productionApiKey && normalizedKey === options.productionApiKey) {
    return {
      environment: "production",
      tenantId: options.productionTenantId || null,
    };
  }

  if (Object.prototype.hasOwnProperty.call(options.productionTenantKeys, normalizedKey)) {
    return {
      environment: "production",
      tenantId: options.productionTenantKeys[normalizedKey],
    };
  }

  return null;
}

function readOptionalDbConfig(env, prefix, fallbackConnectionLimit = 10) {
  const fields = {
    host: process.env[`${prefix}DB_HOST`],
    port: process.env[`${prefix}DB_PORT`],
    user: process.env[`${prefix}DB_USER`],
    password: process.env[`${prefix}DB_PASSWORD`],
    database: process.env[`${prefix}DB_DATABASE`],
    connectionLimit: process.env[`${prefix}DB_CONN_LIMIT`],
    connectTimeout: process.env[`${prefix}DB_CONNECT_TIMEOUT_MS`],
  };
  const hasAnyValue = Object.values(fields).some((value) => value != null && String(value).trim());
  if (!hasAnyValue) return null;

  for (const field of ["host", "user", "password", "database"]) {
    if (!fields[field] || !String(fields[field]).trim()) {
      throw new Error(`incomplete_${env}_db_config:${field}`);
    }
  }

  return {
    host: String(fields.host).trim(),
    port: Number(fields.port || 3306),
    user: String(fields.user).trim(),
    password: String(fields.password),
    database: String(fields.database).trim(),
    connectionLimit: Number(fields.connectionLimit || fallbackConnectionLimit),
    connectTimeout: Number(fields.connectTimeout || 10000),
  };
}

function validateDatabaseSeparation(primaryConfig, secondaryConfig) {
  if (!secondaryConfig) return;
  const targetOf = (config) =>
    `${String(config.host).trim().toLowerCase()}:${Number(config.port || 3306)}/${String(config.database).trim().toLowerCase()}`;
  if (targetOf(primaryConfig) === targetOf(secondaryConfig)) {
    throw new Error("test_and_production_database_must_differ");
  }
}

module.exports = {
  normalizeEnvironment,
  parseKeyMap,
  readKeyMapFromEnvironment,
  readOptionalDbConfig,
  resolveCollectorIdentity,
  validateDatabaseSeparation,
  validateKeySeparation,
};
