"use strict";

const net = require("node:net");

function normalizePublicIp(value) {
  let ip = typeof value === "string" ? value.trim() : "";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  const version = net.isIP(ip);
  if (!version) return null;

  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) return null;
    return ip;
  }

  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)) {
    return null;
  }
  return ip;
}

module.exports = { normalizePublicIp };
