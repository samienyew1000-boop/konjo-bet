const crypto = require("crypto");
const http = require("http");
const https = require("https");
const os = require("os");

const SALT = "konjo-sec-lic-salt-8934710293847102938471928374";
const AUTHORIZED_IP = "13.140.146.163";
const AUTHORIZED_HOSTS = new Set([
  "konjobet.com",
  "www.konjobet.com",
  "13.140.146.163",
  "127.0.0.1",
  "localhost",
]);

function getExpectedLicense() {
  const payload = `${AUTHORIZED_IP}:konjobet.com:official-production`;
  const sig = crypto.createHmac("sha256", SALT).update(payload).digest("hex");
  return "KB-LIC-" + Buffer.from(payload).toString("base64url") + "." + sig;
}

function verifyLicenseKey(key) {
  if (!key || typeof key !== "string") return false;
  const parts = key.trim().split(".");
  if (parts.length !== 2) return false;
  const prefixAndPayload = parts[0];
  const sig = parts[1];
  if (!prefixAndPayload.startsWith("KB-LIC-")) return false;

  const b64 = prefixAndPayload.slice("KB-LIC-".length);
  let payloadStr = "";
  try {
    payloadStr = Buffer.from(b64, "base64url").toString("utf8");
  } catch (_) {
    return false;
  }

  const expectedSig = crypto.createHmac("sha256", SALT).update(payloadStr).digest("hex");
  if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    const [ip, domain] = payloadStr.split(":");
    return ip === AUTHORIZED_IP && domain === "konjobet.com";
  }
  return false;
}

function fetchPublicIp(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const urls = [
      "http://api.ipify.org",
      "http://icanhazip.com",
      "http://ifconfig.me/ip",
    ];

    let completed = false;
    for (const u of urls) {
      try {
        const req = http.get(u, { timeout: timeoutMs }, (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            if (!completed && data.trim()) {
              completed = true;
              resolve(data.trim());
            }
          });
        });
        req.on("error", () => {});
        req.on("timeout", () => req.destroy());
      } catch (_) {}
    }

    setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve(null);
      }
    }, timeoutMs);
  });
}

async function verifyServerLock() {
  const isProd = process.env.NODE_ENV === "production";
  const licenseKey = process.env.KONJO_LICENSE_KEY;

  if (isProd) {
    // 1. License Key Check
    if (!verifyLicenseKey(licenseKey)) {
      console.error("\x1b[31m[SECURITY LOCK] FATAL: Invalid or missing KONJO_LICENSE_KEY.\x1b[0m");
      console.error("\x1b[31m[SECURITY LOCK] This software is locked to konjobet.com (13.140.146.163).\x1b[0m");
      process.exit(1);
    }

    // 2. Server IP Check
    const detectedIp = await fetchPublicIp(3500);
    if (detectedIp && detectedIp !== AUTHORIZED_IP) {
      console.error(`\x1b[31m[SECURITY LOCK] FATAL: Unauthorized server IP detected: ${detectedIp}.\x1b[0m`);
      console.error(`\x1b[31m[SECURITY LOCK] Bound to authorized server IP: ${AUTHORIZED_IP}. Execution terminated.\x1b[0m`);
      process.exit(1);
    }

    console.log(`\x1b[32m[SECURITY LOCK] License validated for ${AUTHORIZED_IP} (konjobet.com).\x1b[0m`);
  }
}

function domainGuardMiddleware(req, res, next) {
  const hostHeader = (req.headers.host || "").split(":")[0].toLowerCase();

  // If in production, strictly enforce allowed hostnames
  if (process.env.NODE_ENV === "production") {
    if (!AUTHORIZED_HOSTS.has(hostHeader)) {
      return res.status(403).json({
        ok: false,
        error: "Unauthorized domain or server. License validation failed.",
        code: "LICENSE_DOMAIN_MISMATCH",
      });
    }
  }

  next();
}

module.exports = {
  verifyServerLock,
  domainGuardMiddleware,
  getExpectedLicense,
  verifyLicenseKey,
  AUTHORIZED_IP,
};
