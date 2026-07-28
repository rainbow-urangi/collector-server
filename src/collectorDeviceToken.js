"use strict";

const crypto = require("crypto");

const TOKEN_TYPE = "rainbow_collector_device";

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function normalizeIdentifier(value, pattern, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!pattern.test(normalized)) throw new Error(`invalid_${name}`);
  return normalized;
}

function issueCollectorDeviceToken({ installationId, extensionId, nowMs = Date.now(), ttlMs }, secret) {
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("collector_device_token_secret_missing");
  }
  const subject = normalizeIdentifier(
    installationId,
    /^[a-zA-Z0-9._:-]{16,128}$/,
    "installation_id"
  );
  const extension = normalizeIdentifier(extensionId, /^[a-p]{32}$/, "extension_id");
  const effectiveTtlMs = Math.min(Math.max(Number(ttlMs) || 86400000, 300000), 2592000000);
  const issuedAt = Math.floor(nowMs / 1000);
  const payload = {
    typ: TOKEN_TYPE,
    sub: subject,
    ext: extension,
    env: "production",
    iat: issuedAt,
    exp: issuedAt + Math.floor(effectiveTtlMs / 1000),
  };
  const encoded = encode(payload);
  return {
    token: `${encoded}.${sign(encoded, secret)}`,
    expiresAtMs: payload.exp * 1000,
    claims: payload,
  };
}

function verifyCollectorDeviceToken(token, secret, nowMs = Date.now()) {
  if (typeof token !== "string" || typeof secret !== "string" || secret.length < 16) return null;
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return null;
  const expectedSignature = sign(encoded, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (claims.typ !== TOKEN_TYPE || claims.env !== "production") return null;
    normalizeIdentifier(claims.sub, /^[a-zA-Z0-9._:-]{16,128}$/, "installation_id");
    normalizeIdentifier(claims.ext, /^[a-p]{32}$/, "extension_id");
    const nowSeconds = Math.floor(nowMs / 1000);
    if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) return null;
    if (claims.iat > nowSeconds + 60 || claims.exp <= nowSeconds) return null;
    return claims;
  } catch {
    return null;
  }
}

module.exports = {
  issueCollectorDeviceToken,
  verifyCollectorDeviceToken,
};
