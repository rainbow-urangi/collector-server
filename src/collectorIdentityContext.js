"use strict";

const ALLOWED_SOURCES = new Set([
  "site_authenticated_user",
  "manual_poc_override",
]);

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

function normalizeSubject(value) {
  const normalized = typeof value === "string" ? value.normalize("NFKC").trim() : "";
  if (!normalized || normalized.length > 128) return null;
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

function applyCollectorIdentityContext(row) {
  const result = { ...row };
  const locators = { ...safeObject(result.AZ_locators_json) };
  const rawContext = safeObject(locators.identity_context);
  const subject = normalizeSubject(rawContext.subject);
  const source = ALLOWED_SOURCES.has(rawContext.source) ? rawContext.source : null;
  if (!subject || !source) return result;

  result.AZ_login_id = subject;
  result._session_user_id = subject;
  result._identity_source = source;
  locators.identity_context = {
    source,
    confidence: typeof rawContext.confidence === "string" ? rawContext.confidence.slice(0, 32) : null,
    resolved_at: typeof rawContext.resolved_at === "string" ? rawContext.resolved_at.slice(0, 40) : null,
    subject_present: true,
  };
  result.AZ_locators_json = locators;
  return result;
}

function sessionUserIdOf(row) {
  return normalizeSubject(row?._session_user_id) || null;
}

module.exports = {
  applyCollectorIdentityContext,
  normalizeSubject,
  sessionUserIdOf,
};
